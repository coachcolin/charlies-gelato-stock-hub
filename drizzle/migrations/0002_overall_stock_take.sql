CREATE OR REPLACE FUNCTION public.overall_stock_take(_freezers jsonb, _expected jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE _fr jsonb; _c jsonb; _f record; _tray int; _tub int; _old_tray int; _old_tub int; _session uuid := gen_random_uuid(); _variance jsonb := '[]'::jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('charlies-overall-stock-take'));
  IF jsonb_typeof(_freezers) IS DISTINCT FROM 'array' OR jsonb_typeof(_expected) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid stock take.'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(_freezers)) <> (SELECT count(*) FROM public.freezers)
     OR (SELECT count(DISTINCT (v->>'freezer_id')::uuid) FROM jsonb_array_elements(_freezers) v) <> (SELECT count(*) FROM public.freezers)
     OR EXISTS (SELECT 1 FROM public.freezers f WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_freezers) v WHERE (v->>'freezer_id')::uuid=f.id)) THEN
    RAISE EXCEPTION 'Count every freezer before saving the overall stock take.';
  END IF;
  PERFORM id FROM public.flavours ORDER BY id FOR UPDATE;
  PERFORM flavour_id FROM public.freezer_stock ORDER BY flavour_id, freezer_id FOR UPDATE;
  FOR _f IN SELECT id,name,stock_qty,tub_qty FROM public.flavours ORDER BY id LOOP
    SELECT (v->>'tray')::int,(v->>'tub')::int INTO _old_tray,_old_tub FROM jsonb_array_elements(_expected) v WHERE (v->>'flavour_id')::uuid=_f.id;
    IF _old_tray IS DISTINCT FROM _f.stock_qty OR _old_tub IS DISTINCT FROM _f.tub_qty THEN RAISE EXCEPTION 'Stock changed while counting. Refresh the page to review the latest totals; your counts are saved on this device.'; END IF;
    _tray := 0; _tub := 0;
    FOR _fr IN SELECT * FROM jsonb_array_elements(_freezers) LOOP
      IF jsonb_typeof(_fr->'counts') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid freezer counts.'; END IF;
      IF (SELECT count(*) FROM jsonb_array_elements(_fr->'counts') v WHERE (v->>'flavour_id')::uuid=_f.id) <> 1 THEN RAISE EXCEPTION 'Every flavour needs one count per freezer.'; END IF;
      SELECT v INTO _c FROM jsonb_array_elements(_fr->'counts') v WHERE (v->>'flavour_id')::uuid=_f.id;
      IF (_c->>'tray') IS NULL OR (_c->>'tub') IS NULL OR (_c->>'tray')::int < 0 OR (_c->>'tub')::int < 0 THEN RAISE EXCEPTION 'Counts must be zero or more.'; END IF;
      INSERT INTO public.freezer_stock(flavour_id,freezer_id,stock_qty,tub_qty,counted_at,updated_at)
      VALUES(_f.id,(_fr->>'freezer_id')::uuid,(_c->>'tray')::int,(_c->>'tub')::int,now(),now())
      ON CONFLICT(flavour_id,freezer_id) DO UPDATE SET stock_qty=EXCLUDED.stock_qty,tub_qty=EXCLUDED.tub_qty,counted_at=EXCLUDED.counted_at,updated_at=EXCLUDED.updated_at;
      _tray := _tray + (_c->>'tray')::int; _tub := _tub + (_c->>'tub')::int;
    END LOOP;
    IF _tray <> _f.stock_qty THEN
      INSERT INTO public.stock_movements(flavour_id,flavour_name,qty,kind,note,session_id,unit) VALUES(_f.id,_f.name,_tray-_f.stock_qty,'adjustment','Overall stock take — all freezers',_session,'tray');
      _variance := _variance || jsonb_build_array(jsonb_build_object('name',_f.name,'unit','tray','before',_f.stock_qty,'after',_tray,'diff',_tray-_f.stock_qty));
    END IF;
    IF _tub <> _f.tub_qty THEN
      INSERT INTO public.stock_movements(flavour_id,flavour_name,qty,kind,note,session_id,unit) VALUES(_f.id,_f.name,_tub-_f.tub_qty,'adjustment','Overall stock take — all freezers',_session,'tub');
      _variance := _variance || jsonb_build_array(jsonb_build_object('name',_f.name,'unit','tub','before',_f.tub_qty,'after',_tub,'diff',_tub-_f.tub_qty));
    END IF;
    UPDATE public.flavours SET stock_qty=_tray,tub_qty=_tub WHERE id=_f.id;
  END LOOP;
  INSERT INTO public.app_settings(key,value,updated_at) SELECT 'freezers_counted',string_agg(id::text,',' ORDER BY position),now() FROM public.freezers
  ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at;
  RETURN jsonb_build_object('session_id',_session,'variances',_variance);
END; $$;
REVOKE ALL ON FUNCTION public.overall_stock_take(jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.overall_stock_take(jsonb,jsonb) TO anon,authenticated,service_role;