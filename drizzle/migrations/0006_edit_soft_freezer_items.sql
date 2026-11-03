CREATE OR REPLACE FUNCTION public.set_soft_freezer_item(_order_id uuid, _flavour_id uuid, _unit text, _qty integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _status text; _item public.soft_freezer_order_items%ROWTYPE;
BEGIN
 IF _unit IS NULL OR _unit NOT IN ('tray','tub') OR _qty IS NULL OR _qty < 0 THEN RAISE EXCEPTION 'Invalid quantity or unit.'; END IF;
 SELECT status INTO _status FROM public.soft_freezer_orders WHERE id=_order_id FOR UPDATE;
 IF _status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'This collection is already complete.'; END IF;
 SELECT * INTO _item FROM public.soft_freezer_order_items WHERE order_id=_order_id AND flavour_id=_flavour_id AND unit=_unit FOR UPDATE;
 IF _item.id IS NOT NULL AND _item.collected_at IS NOT NULL THEN RAISE EXCEPTION 'That line is already collected.'; END IF;
 IF _qty = 0 THEN
  IF _item.id IS NOT NULL THEN DELETE FROM public.soft_freezer_order_items WHERE id=_item.id; END IF;
 ELSIF _item.id IS NOT NULL THEN
  UPDATE public.soft_freezer_order_items SET qty=_qty WHERE id=_item.id;
 ELSE
  INSERT INTO public.soft_freezer_order_items(order_id,flavour_id,flavour_name,qty,unit,position)
  SELECT _order_id,id,name,_qty,_unit,COALESCE((SELECT max(position)+1 FROM public.soft_freezer_order_items WHERE order_id=_order_id),0)
  FROM public.flavours WHERE id=_flavour_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'That flavour no longer exists.'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.soft_freezer_order_items WHERE order_id=_order_id)
  AND NOT EXISTS(SELECT 1 FROM public.soft_freezer_order_items WHERE order_id=_order_id AND collected_at IS NULL) THEN
  UPDATE public.soft_freezer_orders SET status='completed',completed_at=now() WHERE id=_order_id;
 END IF;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.set_soft_freezer_item(uuid,uuid,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_soft_freezer_item(uuid,uuid,text,integer) TO anon,authenticated,service_role;