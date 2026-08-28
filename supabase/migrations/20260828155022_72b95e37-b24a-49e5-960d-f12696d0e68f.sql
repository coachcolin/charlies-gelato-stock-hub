CREATE OR REPLACE FUNCTION public.apply_stock_movements(_movements jsonb, _kind text, _note text DEFAULT NULL, _order_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _session uuid := gen_random_uuid();
  _item jsonb;
  _fid uuid;
  _qty integer;
  _name text;
BEGIN
  FOR _item IN SELECT * FROM jsonb_array_elements(_movements) LOOP
    _fid := (_item->>'flavour_id')::uuid;
    _qty := (_item->>'qty')::integer;
    SELECT name INTO _name FROM public.flavours WHERE id = _fid;
    IF _name IS NULL THEN CONTINUE; END IF;
    UPDATE public.flavours SET stock_qty = GREATEST(0, stock_qty + _qty) WHERE id = _fid;
    INSERT INTO public.stock_movements (flavour_id, flavour_name, qty, kind, note, session_id, order_id)
    VALUES (_fid, _name, _qty, _kind, _note, _session, _order_id);
  END LOOP;
  RETURN _session;
END; $$;