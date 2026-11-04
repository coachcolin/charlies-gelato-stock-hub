CREATE OR REPLACE FUNCTION public.single_freezer_stock_take(_freezer_id uuid, _counts jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE _c jsonb; _f record; _qty int; _old int; _unit text; _session uuid := gen_random_uuid(); _variance jsonb := '[]'::jsonb; _fname text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('charlies-overall-stock-take'));
  SELECT name INTO _fname FROM public.freezers WHERE id=_freezer_id;
  IF _fname IS NULL THEN RAISE EXCEPTION 'Freezer not found.'; END IF;
  IF jsonb_typeof(_counts) IS DISTINCT FROM 'array' OR jsonb_array_length(_counts)=0 THEN RAISE EXCEPTION 'Nothing counted.'; END IF;
  FOR _c IN SELECT * FROM jsonb_array_elements(_counts) LOOP
    _unit := _c->>'unit'; _qty := (_c->>'qty')::int;
    IF _unit NOT IN ('tray','tub') OR _qty IS NULL OR _qty < 0 THEN RAISE EXCEPTION 'Counts must be zero or more.'; END IF;
    SELECT id,name INTO _f FROM public.flavours WHERE id=(_c->>'flavour_id')::uuid FOR UPDATE;
    IF _f.id IS NULL THEN RAISE EXCEPTION 'Unknown flavour.'; END IF;
    INSERT INTO public.freezer_stock(flavour_id,freezer_id,stock_qty,tub_qty) VALUES(_f.id,_freezer_id,0,0) ON CONFLICT(flavour_id,freezer_id) DO NOTHING;
    SELECT CASE WHEN _unit='tray' THEN stock_qty ELSE tub_qty END INTO _old FROM public.freezer_stock WHERE flavour_id=_f.id AND freezer_id=_freezer_id FOR UPDATE;
    IF _unit='tray' THEN
      UPDATE public.freezer_stock SET stock_qty=_qty,counted_at=now(),updated_at=now() WHERE flavour_id=_f.id AND freezer_id=_freezer_id;
      UPDATE public.flavours SET stock_qty=stock_qty+(_qty-_old) WHERE id=_f.id;
    ELSE
      UPDATE public.freezer_stock SET tub_qty=_qty,counted_at=now(),updated_at=now() WHERE flavour_id=_f.id AND freezer_id=_freezer_id;
      UPDATE public.flavours SET tub_qty=tub_qty+(_qty-_old) WHERE id=_f.id;
    END IF;
    IF _qty <> _old THEN
      INSERT INTO public.stock_movements(flavour_id,flavour_name,qty,kind,note,session_id,unit) VALUES(_f.id,_f.name,_qty-_old,'adjustment','Stock take — '||_fname||' only',_session,_unit);
      _variance := _variance || jsonb_build_array(jsonb_build_object('name',_f.name,'unit',_unit,'before',_old,'after',_qty,'diff',_qty-_old));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('session_id',_session,'variances',_variance);
END; $$;
REVOKE ALL ON FUNCTION public.single_freezer_stock_take(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.single_freezer_stock_take(uuid,jsonb) TO anon,authenticated,service_role;