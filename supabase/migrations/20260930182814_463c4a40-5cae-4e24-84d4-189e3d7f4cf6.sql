ALTER TABLE public.flavours ADD COLUMN IF NOT EXISTS tub_qty integer NOT NULL DEFAULT 0;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'tray';
ALTER TABLE public.wholesale_order_items ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'tray';
ALTER TABLE public.production_report_items ADD COLUMN IF NOT EXISTS suggested_tubs integer NOT NULL DEFAULT 0;
ALTER TABLE public.production_report_items ADD COLUMN IF NOT EXISTS produced_tubs integer;

CREATE OR REPLACE FUNCTION public.apply_stock_movements(_movements jsonb, _kind text, _note text DEFAULT NULL::text, _order_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _session uuid := gen_random_uuid();
  _item jsonb;
  _fid uuid;
  _qty integer;
  _name text;
  _unit text;
BEGIN
  FOR _item IN SELECT * FROM jsonb_array_elements(_movements) LOOP
    _fid := (_item->>'flavour_id')::uuid;
    _qty := (_item->>'qty')::integer;
    _unit := CASE WHEN _item->>'unit' = 'tub' THEN 'tub' ELSE 'tray' END;
    SELECT name INTO _name FROM public.flavours WHERE id = _fid;
    IF _name IS NULL OR _qty IS NULL OR _qty = 0 THEN CONTINUE; END IF;
    IF _unit = 'tub' THEN
      UPDATE public.flavours SET tub_qty = GREATEST(0, tub_qty + _qty) WHERE id = _fid;
    ELSE
      UPDATE public.flavours SET stock_qty = GREATEST(0, stock_qty + _qty) WHERE id = _fid;
    END IF;
    INSERT INTO public.stock_movements (flavour_id, flavour_name, qty, kind, note, session_id, order_id, unit)
    VALUES (_fid, _name, _qty, _kind, _note, _session, _order_id, _unit);
  END LOOP;
  RETURN _session;
END; $function$;