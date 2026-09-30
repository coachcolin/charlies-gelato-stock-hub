CREATE OR REPLACE FUNCTION public.apply_stock_movements(_movements jsonb, _kind text, _note text, _order_id uuid, _account text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _session_id uuid := gen_random_uuid();
  _m jsonb;
  _account_name text;
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
    INSERT INTO public.stock_movements (flavour_id, flavour_name, qty, kind, note, session_id, order_id, unit, account)
    VALUES (
      (_m->>'flavour_id')::uuid,
      COALESCE((SELECT name FROM public.flavours WHERE id = (_m->>'flavour_id')::uuid), 'Unknown'),
      (_m->>'qty')::int,
      _kind,
      _note,
      _session_id,
      _order_id,
      COALESCE(_m->>'unit', 'tray'),
      _account_name
    );

    IF COALESCE(_m->>'unit', 'tray') = 'tub' THEN
      UPDATE public.flavours SET tub_qty = tub_qty + (_m->>'qty')::int, updated_at = now()
      WHERE id = (_m->>'flavour_id')::uuid;
    ELSE
      UPDATE public.flavours SET stock_qty = stock_qty + (_m->>'qty')::int, updated_at = now()
      WHERE id = (_m->>'flavour_id')::uuid;
    END IF;
  END LOOP;

  RETURN _session_id;
END;
$$;