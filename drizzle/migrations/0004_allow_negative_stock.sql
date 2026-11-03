CREATE OR REPLACE FUNCTION public.apply_stock_movements(_movements jsonb, _kind text, _note text, _order_id uuid, _account text DEFAULT NULL::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _session_id uuid := gen_random_uuid();
  _m jsonb;
  _account_name text;
  _unit text;
  _qty int;
  _fid uuid;
  _frz uuid;
BEGIN
  IF _account IS NOT NULL AND btrim(_account) <> '' THEN
    _account_name := btrim(_account);
  ELSIF _order_id IS NOT NULL THEN
    SELECT wholesaler INTO _account_name FROM public.wholesale_orders WHERE id = _order_id;
  ELSIF _kind = 'removal' THEN
    _account_name := 'Charlie''s Shop';
  END IF;

  FOR _m IN SELECT * FROM jsonb_array_elements(_movements)
  LOOP
    _fid := (_m->>'flavour_id')::uuid;
    _qty := (_m->>'qty')::int;
    _unit := CASE WHEN _m->>'unit' = 'tub' THEN 'tub' ELSE 'tray' END;
    _frz := NULLIF(_m->>'freezer_id', '')::uuid;
    IF _fid IS NULL OR _qty IS NULL OR _qty = 0 THEN CONTINUE; END IF;

    INSERT INTO public.stock_movements (flavour_id, flavour_name, qty, kind, note, session_id, order_id, unit, account, freezer_id)
    VALUES (_fid, COALESCE((SELECT name FROM public.flavours WHERE id = _fid), 'Unknown'),
      _qty, _kind, _note, _session_id, _order_id, _unit,
      CASE WHEN _kind = 'transfer' THEN NULL ELSE _account_name END, _frz);

    IF _kind <> 'transfer' THEN
      IF _unit = 'tub' THEN
        UPDATE public.flavours SET tub_qty = tub_qty + _qty, updated_at = now() WHERE id = _fid;
      ELSE
        UPDATE public.flavours SET stock_qty = stock_qty + _qty, updated_at = now() WHERE id = _fid;
      END IF;
    END IF;

    IF _frz IS NOT NULL THEN
      INSERT INTO public.freezer_stock (flavour_id, freezer_id) VALUES (_fid, _frz) ON CONFLICT DO NOTHING;
      IF _unit = 'tub' THEN
        UPDATE public.freezer_stock SET tub_qty = tub_qty + _qty, updated_at = now() WHERE flavour_id = _fid AND freezer_id = _frz;
      ELSE
        UPDATE public.freezer_stock SET stock_qty = stock_qty + _qty, updated_at = now() WHERE flavour_id = _fid AND freezer_id = _frz;
      END IF;
    END IF;
  END LOOP;
  RETURN _session_id;
END;
$function$;