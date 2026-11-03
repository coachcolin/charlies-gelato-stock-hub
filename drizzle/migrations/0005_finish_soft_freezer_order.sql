CREATE OR REPLACE FUNCTION public.finish_soft_freezer_order(_order_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _status text;
BEGIN
  SELECT status INTO _status FROM soft_freezer_orders WHERE id = _order_id FOR UPDATE;
  IF _status IS NULL THEN RAISE EXCEPTION 'Collection not found'; END IF;
  IF _status = 'completed' THEN RETURN false; END IF;
  UPDATE soft_freezer_orders SET status = 'completed', completed_at = now() WHERE id = _order_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.finish_soft_freezer_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finish_soft_freezer_order(uuid) TO anon, authenticated, service_role;