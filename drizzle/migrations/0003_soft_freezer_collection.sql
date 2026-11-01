CREATE TABLE public.soft_freezer_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);
GRANT SELECT ON public.soft_freezer_orders TO anon, authenticated;
GRANT ALL ON public.soft_freezer_orders TO service_role;
ALTER TABLE public.soft_freezer_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Shared soft freezer order reads" ON public.soft_freezer_orders FOR SELECT TO anon, authenticated USING (true);
CREATE UNIQUE INDEX one_active_soft_freezer_order ON public.soft_freezer_orders(status) WHERE status='active';
CREATE TABLE public.soft_freezer_order_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES public.soft_freezer_orders(id) ON DELETE CASCADE,
 flavour_id uuid NOT NULL REFERENCES public.flavours(id),
 flavour_name text NOT NULL,
 qty integer NOT NULL CHECK (qty > 0),
 unit text NOT NULL CHECK (unit IN ('tray','tub')),
 position integer NOT NULL,
 collected_at timestamptz,
 movement_session_id uuid,
 UNIQUE(order_id,flavour_id,unit)
);
GRANT SELECT ON public.soft_freezer_order_items TO anon, authenticated;
GRANT ALL ON public.soft_freezer_order_items TO service_role;
ALTER TABLE public.soft_freezer_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Shared soft freezer item reads" ON public.soft_freezer_order_items FOR SELECT TO anon, authenticated USING (true);
CREATE OR REPLACE FUNCTION public.start_soft_freezer_order(_request_id uuid, _items jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _id uuid; _item jsonb; _position integer := 0;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('charlies-soft-freezer-order'));
 SELECT id INTO _id FROM public.soft_freezer_orders WHERE request_id=_request_id;
 IF _id IS NOT NULL THEN RETURN _id; END IF;
 IF _request_id IS NULL OR _items IS NULL OR jsonb_typeof(_items) <> 'array' THEN RAISE EXCEPTION 'Select at least one flavour.'; END IF;
 IF jsonb_array_length(_items)=0 THEN RAISE EXCEPTION 'Select at least one flavour.'; END IF;
 IF EXISTS(SELECT 1 FROM public.soft_freezer_orders WHERE status='active') THEN RAISE EXCEPTION 'A collection is already in progress. Reopen it to continue.'; END IF;
 INSERT INTO public.soft_freezer_orders(request_id) VALUES(_request_id) RETURNING id INTO _id;
 FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
  IF (_item->>'qty') IS NULL OR (_item->>'qty')::integer <= 0 OR (_item->>'unit') IS NULL OR (_item->>'unit') NOT IN ('tray','tub') THEN RAISE EXCEPTION 'Invalid collection quantity or unit.'; END IF;
  INSERT INTO public.soft_freezer_order_items(order_id,flavour_id,flavour_name,qty,unit,position)
  SELECT _id,id,name,(_item->>'qty')::integer,_item->>'unit',_position FROM public.flavours WHERE id=(_item->>'flavour_id')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'A selected flavour no longer exists.'; END IF;
  _position := _position + 1;
 END LOOP;
 RETURN _id;
END; $$;
CREATE OR REPLACE FUNCTION public.collect_soft_freezer_item(_item_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _order uuid; _status text; _item public.soft_freezer_order_items%ROWTYPE; _session uuid;
BEGIN
 SELECT order_id INTO _order FROM public.soft_freezer_order_items WHERE id=_item_id;
 SELECT status INTO _status FROM public.soft_freezer_orders WHERE id=_order FOR UPDATE;
 SELECT * INTO _item FROM public.soft_freezer_order_items WHERE id=_item_id FOR UPDATE;
 IF _item.id IS NULL THEN RAISE EXCEPTION 'This collection line could not be found.'; END IF;
 IF _item.collected_at IS NOT NULL THEN RETURN false; END IF;
 IF _status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'This collection is already complete.'; END IF;
 _session := public.apply_stock_movements(jsonb_build_array(jsonb_build_object('flavour_id',_item.flavour_id,'qty',-_item.qty,'unit',_item.unit)), 'removal', 'Soft freezer order', NULL::uuid, 'Charlie''s Shop');
 UPDATE public.soft_freezer_order_items SET collected_at=now(),movement_session_id=_session WHERE id=_item_id;
 IF NOT EXISTS(SELECT 1 FROM public.soft_freezer_order_items WHERE order_id=_order AND collected_at IS NULL) THEN
  UPDATE public.soft_freezer_orders SET status='completed',completed_at=now() WHERE id=_order;
 END IF;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.start_soft_freezer_order(uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.collect_soft_freezer_item(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_soft_freezer_order(uuid,jsonb),public.collect_soft_freezer_item(uuid) TO anon,authenticated,service_role;