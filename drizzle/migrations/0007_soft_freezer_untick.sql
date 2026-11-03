CREATE OR REPLACE FUNCTION public.uncollect_soft_freezer_item(_item_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _order uuid;
  _status text;
  _item public.soft_freezer_order_items%ROWTYPE;
  _session uuid;
  _other_active boolean;
BEGIN
  SELECT order_id INTO _order FROM public.soft_freezer_order_items WHERE id=_item_id;
  IF _order IS NULL THEN RAISE EXCEPTION 'This collection line could not be found.'; END IF;
  SELECT status INTO _status FROM public.soft_freezer_orders WHERE id=_order FOR UPDATE;
  SELECT * INTO _item FROM public.soft_freezer_order_items WHERE id=_item_id FOR UPDATE;
  IF _item.id IS NULL THEN RAISE EXCEPTION 'This collection line could not be found.'; END IF;
  IF _item.collected_at IS NULL THEN RETURN false; END IF;
  IF _status = 'completed' THEN
    SELECT EXISTS(SELECT 1 FROM public.soft_freezer_orders WHERE status='active' AND id <> _order) INTO _other_active;
    IF _other_active THEN RAISE EXCEPTION 'A new collection has already started, so this one can no longer be changed.'; END IF;
  END IF;
  _session := public.apply_stock_movements(
    jsonb_build_array(jsonb_build_object('flavour_id', _item.flavour_id, 'qty', _item.qty, 'unit', _item.unit)),
    'addition', 'Soft freezer order (unticked)', NULL::uuid, 'Charlie''s Shop');
  UPDATE public.soft_freezer_order_items SET collected_at=NULL, movement_session_id=NULL WHERE id=_item_id;
  IF _status = 'completed' THEN
    UPDATE public.soft_freezer_orders SET status='active', completed_at=NULL WHERE id=_order;
  END IF;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.uncollect_soft_freezer_item(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.uncollect_soft_freezer_item(uuid) TO anon, authenticated, service_role;