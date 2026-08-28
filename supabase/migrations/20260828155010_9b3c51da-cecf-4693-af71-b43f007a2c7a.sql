CREATE TABLE public.flavours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  priority boolean NOT NULL DEFAULT false,
  image_url text,
  stock_qty integer NOT NULL DEFAULT 0,
  desired_peak integer NOT NULL DEFAULT 0,
  desired_mid integer NOT NULL DEFAULT 0,
  desired_low integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flavours TO anon, authenticated;
GRANT ALL ON public.flavours TO service_role;
ALTER TABLE public.flavours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Shared access to flavours" ON public.flavours FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.freezers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  capacity_trays integer NOT NULL DEFAULT 100,
  current_trays integer NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.freezers TO anon, authenticated;
GRANT ALL ON public.freezers TO service_role;
ALTER TABLE public.freezers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Shared access to freezers" ON public.freezers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.wholesale_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler text NOT NULL,
  reference text,
  status text NOT NULL DEFAULT 'active',
  is_future boolean NOT NULL DEFAULT false,
  send_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wholesale_orders TO anon, authenticated;
GRANT ALL ON public.wholesale_orders TO service_role;
ALTER TABLE public.wholesale_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Shared access to wholesale orders" ON public.wholesale_orders FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.wholesale_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.wholesale_orders(id) ON DELETE CASCADE,
  flavour_id uuid REFERENCES public.flavours(id) ON DELETE SET NULL,
  flavour_name text NOT NULL,
  qty integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wholesale_order_items TO anon, authenticated;
GRANT ALL ON public.wholesale_order_items TO service_role;
ALTER TABLE public.wholesale_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Shared access to wholesale order items" ON public.wholesale_order_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flavour_id uuid REFERENCES public.flavours(id) ON DELETE SET NULL,
  flavour_name text NOT NULL,
  qty integer NOT NULL,
  kind text NOT NULL,
  note text,
  session_id uuid,
  order_id uuid REFERENCES public.wholesale_orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_movements_created_idx ON public.stock_movements (created_at DESC);
CREATE INDEX stock_movements_flavour_idx ON public.stock_movements (flavour_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements TO anon, authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Shared access to stock movements" ON public.stock_movements FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.production_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'active',
  season text NOT NULL DEFAULT 'mid',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_reports TO anon, authenticated;
GRANT ALL ON public.production_reports TO service_role;
ALTER TABLE public.production_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Shared access to production reports" ON public.production_reports FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.production_report_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.production_reports(id) ON DELETE CASCADE,
  flavour_id uuid REFERENCES public.flavours(id) ON DELETE SET NULL,
  flavour_name text NOT NULL,
  suggested_qty integer NOT NULL DEFAULT 0,
  produced_qty integer,
  done boolean NOT NULL DEFAULT false,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_report_items TO anon, authenticated;
GRANT ALL ON public.production_report_items TO service_role;
ALTER TABLE public.production_report_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Shared access to production report items" ON public.production_report_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Shared access to settings" ON public.app_settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER flavours_updated BEFORE UPDATE ON public.flavours FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER freezers_updated BEFORE UPDATE ON public.freezers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER wholesale_orders_updated BEFORE UPDATE ON public.wholesale_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.apply_stock_movements(_movements jsonb, _kind text, _note text DEFAULT NULL, _order_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
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
GRANT EXECUTE ON FUNCTION public.apply_stock_movements(jsonb, text, text, uuid) TO anon, authenticated, service_role;

INSERT INTO public.freezers (name, capacity_trays, position) VALUES
  ('Freezer 1', 120, 1), ('Freezer 2', 120, 2), ('Freezer 3', 80, 3);
INSERT INTO public.app_settings (key, value) VALUES ('season', 'mid');