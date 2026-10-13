UPDATE public.freezers SET name = 'Container Freezer' WHERE position = 1 AND name = 'Freezer 1';
UPDATE public.freezers SET name = 'Back Freezer' WHERE position = 2 AND name = 'Freezer 2';
UPDATE public.freezers SET name = 'Kitchen Freezer' WHERE position = 3 AND name = 'Freezer 3';

CREATE TABLE public.freezer_stock (
  flavour_id uuid NOT NULL REFERENCES public.flavours(id) ON DELETE CASCADE,
  freezer_id uuid NOT NULL REFERENCES public.freezers(id) ON DELETE CASCADE,
  stock_qty integer NOT NULL DEFAULT 0,
  tub_qty integer NOT NULL DEFAULT 0,
  counted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (flavour_id, freezer_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.freezer_stock TO anon, authenticated;
GRANT ALL ON public.freezer_stock TO service_role;
ALTER TABLE public.freezer_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Shared access to freezer stock" ON public.freezer_stock FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.stock_movements ADD COLUMN freezer_id uuid REFERENCES public.freezers(id) ON DELETE SET NULL;

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
        UPDATE public.flavours SET tub_qty = GREATEST(0, tub_qty + _qty), updated_at = now() WHERE id = _fid;
      ELSE
        UPDATE public.flavours SET stock_qty = GREATEST(0, stock_qty + _qty), updated_at = now() WHERE id = _fid;
      END IF;
    END IF;

    IF _frz IS NOT NULL THEN
      INSERT INTO public.freezer_stock (flavour_id, freezer_id) VALUES (_fid, _frz) ON CONFLICT DO NOTHING;
      IF _unit = 'tub' THEN
        UPDATE public.freezer_stock SET tub_qty = GREATEST(0, tub_qty + _qty), updated_at = now() WHERE flavour_id = _fid AND freezer_id = _frz;
      ELSE
        UPDATE public.freezer_stock SET stock_qty = GREATEST(0, stock_qty + _qty), updated_at = now() WHERE flavour_id = _fid AND freezer_id = _frz;
      END IF;
    END IF;
  END LOOP;
  RETURN _session_id;
END;
$function$;

-- Stock take for one freezer. _counts = [{flavour_id, tray, tub}] for every flavour (unseen = 0).
-- Until all freezers have had a first count, only the freezer's own record is set.
-- When the last freezer gets its first count, overall totals become the sum of all freezers.
CREATE OR REPLACE FUNCTION public.freezer_stock_take(_freezer_id uuid, _counts jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _session uuid := gen_random_uuid();
  _c jsonb;
  _fid uuid;
  _tray int; _tub int;
  _old_tray int; _old_tub int;
  _counted text;
  _ids text[];
  _was_ready boolean;
  _now_ready boolean;
  _f record;
  _fname text;
  _sum_tray int; _sum_tub int;
BEGIN
  SELECT value INTO _counted FROM public.app_settings WHERE key = 'freezers_counted';
  _ids := COALESCE(string_to_array(NULLIF(_counted, ''), ','), ARRAY[]::text[]);
  _was_ready := NOT EXISTS (SELECT 1 FROM public.freezers fr WHERE NOT (fr.id::text = ANY(_ids)));

  FOR _c IN SELECT * FROM jsonb_array_elements(_counts) LOOP
    _fid := (_c->>'flavour_id')::uuid;
    _tray := GREATEST(0, COALESCE((_c->>'tray')::int, 0));
    _tub := GREATEST(0, COALESCE((_c->>'tub')::int, 0));
    SELECT name INTO _fname FROM public.flavours WHERE id = _fid;
    IF _fname IS NULL THEN CONTINUE; END IF;
    INSERT INTO public.freezer_stock (flavour_id, freezer_id) VALUES (_fid, _freezer_id) ON CONFLICT DO NOTHING;
    SELECT stock_qty, tub_qty INTO _old_tray, _old_tub FROM public.freezer_stock WHERE flavour_id = _fid AND freezer_id = _freezer_id;
    UPDATE public.freezer_stock SET stock_qty = _tray, tub_qty = _tub, counted_at = now(), updated_at = now()
      WHERE flavour_id = _fid AND freezer_id = _freezer_id;
    IF _was_ready THEN
      IF _tray <> _old_tray THEN
        UPDATE public.flavours SET stock_qty = GREATEST(0, stock_qty + (_tray - _old_tray)) WHERE id = _fid;
        INSERT INTO public.stock_movements (flavour_id, flavour_name, qty, kind, note, session_id, unit, freezer_id)
        VALUES (_fid, _fname, _tray - _old_tray, 'adjustment', 'Stock take correction', _session, 'tray', _freezer_id);
      END IF;
      IF _tub <> _old_tub THEN
        UPDATE public.flavours SET tub_qty = GREATEST(0, tub_qty + (_tub - _old_tub)) WHERE id = _fid;
        INSERT INTO public.stock_movements (flavour_id, flavour_name, qty, kind, note, session_id, unit, freezer_id)
        VALUES (_fid, _fname, _tub - _old_tub, 'adjustment', 'Stock take correction', _session, 'tub', _freezer_id);
      END IF;
    END IF;
  END LOOP;

  IF NOT (_freezer_id::text = ANY(_ids)) THEN
    _ids := array_append(_ids, _freezer_id::text);
    INSERT INTO public.app_settings (key, value, updated_at) VALUES ('freezers_counted', array_to_string(_ids, ','), now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  END IF;
  _now_ready := NOT EXISTS (SELECT 1 FROM public.freezers fr WHERE NOT (fr.id::text = ANY(_ids)));

  IF _now_ready AND NOT _was_ready THEN
    FOR _f IN SELECT id, name, stock_qty, tub_qty FROM public.flavours LOOP
      SELECT COALESCE(SUM(stock_qty),0), COALESCE(SUM(tub_qty),0) INTO _sum_tray, _sum_tub FROM public.freezer_stock WHERE flavour_id = _f.id;
      IF _sum_tray <> _f.stock_qty THEN
        INSERT INTO public.stock_movements (flavour_id, flavour_name, qty, kind, note, session_id, unit)
        VALUES (_f.id, _f.name, _sum_tray - _f.stock_qty, 'adjustment', 'Starting freezer counts', _session, 'tray');
      END IF;
      IF _sum_tub <> _f.tub_qty THEN
        INSERT INTO public.stock_movements (flavour_id, flavour_name, qty, kind, note, session_id, unit)
        VALUES (_f.id, _f.name, _sum_tub - _f.tub_qty, 'adjustment', 'Starting freezer counts', _session, 'tub');
      END IF;
      UPDATE public.flavours SET stock_qty = _sum_tray, tub_qty = _sum_tub WHERE id = _f.id;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('session_id', _session, 'baseline_complete', _now_ready, 'just_completed', _now_ready AND NOT _was_ready);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.freezer_stock_take(uuid, jsonb) TO anon, authenticated, service_role;