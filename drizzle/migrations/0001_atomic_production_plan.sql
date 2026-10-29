ALTER TABLE public.production_reports ADD COLUMN request_id uuid;
CREATE UNIQUE INDEX production_reports_request_id_key ON public.production_reports(request_id) WHERE request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.start_production_plan(_request_id uuid, _season text, _days integer, _items jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE _id uuid; _item jsonb; _position integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('charlies-production-plan'));
  SELECT id INTO _id FROM public.production_reports WHERE request_id = _request_id;
  IF _id IS NOT NULL THEN RETURN _id; END IF;
  IF _request_id IS NULL OR _days NOT BETWEEN 1 AND 7 OR _season NOT IN ('peak','mid','low') OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Choose at least one flavour and valid production days.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.production_reports WHERE status = 'active') THEN
    RAISE EXCEPTION 'An active production report already exists. Reopen it before starting another.';
  END IF;
  INSERT INTO public.production_reports(season,days,request_id) VALUES(_season,_days,_request_id) RETURNING id INTO _id;
  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    IF (_item->>'day_index')::integer NOT BETWEEN 1 AND 7 OR (_item->>'suggested_qty')::integer < 0 OR (_item->>'suggested_tubs')::integer < 0 THEN RAISE EXCEPTION 'Invalid production quantities or day.'; END IF;
    INSERT INTO public.production_report_items(report_id,flavour_id,flavour_name,suggested_qty,suggested_tubs,day_index,note,position)
    SELECT _id,id,name,(_item->>'suggested_qty')::integer,(_item->>'suggested_tubs')::integer,(_item->>'day_index')::integer,NULLIF(btrim(_item->>'note'),''),_position
    FROM public.flavours WHERE id = (_item->>'flavour_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'A selected flavour no longer exists.'; END IF;
    _position := _position + 1;
  END LOOP;
  UPDATE public.production_reports SET days = GREATEST(_days,(SELECT max(day_index) FROM public.production_report_items WHERE report_id = _id)) WHERE id = _id;
  RETURN _id;
END; $$;
GRANT EXECUTE ON FUNCTION public.start_production_plan(uuid,text,integer,jsonb) TO anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.save_production_item(_item_id uuid,_trays integer,_tubs integer,_day integer,_note text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE _report uuid; _status text; _done boolean;
BEGIN
  SELECT report_id INTO _report FROM public.production_report_items WHERE id=_item_id;
  SELECT status INTO _status FROM public.production_reports WHERE id=_report FOR UPDATE;
  SELECT done INTO _done FROM public.production_report_items WHERE id=_item_id FOR UPDATE;
  IF _status IS DISTINCT FROM 'active' OR _done IS DISTINCT FROM false THEN RAISE EXCEPTION 'This flavour is already made or the report is closed. Reopen the report to check it.'; END IF;
  IF _trays IS NULL OR _tubs IS NULL OR _trays < 0 OR _tubs < 0 OR _day IS NULL OR _day NOT BETWEEN 1 AND 7 THEN RAISE EXCEPTION 'Enter whole quantities and a day from 1 to 7.'; END IF;
  UPDATE public.production_report_items SET suggested_qty=_trays,suggested_tubs=_tubs,day_index=_day,note=NULLIF(btrim(_note),'') WHERE id=_item_id;
  UPDATE public.production_reports SET days=GREATEST(days,_day) WHERE id=_report;
END; $$;
GRANT EXECUTE ON FUNCTION public.save_production_item(uuid,integer,integer,integer,text) TO anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.complete_production_item(_item_id uuid,_trays integer,_tubs integer,_day integer,_note text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE _report uuid; _status text; _item public.production_report_items%ROWTYPE;
BEGIN
  SELECT report_id INTO _report FROM public.production_report_items WHERE id=_item_id;
  SELECT status INTO _status FROM public.production_reports WHERE id=_report FOR UPDATE;
  SELECT * INTO _item FROM public.production_report_items WHERE id=_item_id FOR UPDATE;
  IF _item.id IS NULL THEN RAISE EXCEPTION 'This flavour could not be found.'; END IF;
  IF _item.done THEN RETURN false; END IF;
  IF _status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'This report is closed.'; END IF;
  PERFORM public.save_production_item(_item_id,_trays,_tubs,_day,_note);
  IF _item.flavour_id IS NOT NULL THEN
    PERFORM public.apply_stock_movements(jsonb_build_array(jsonb_build_object('flavour_id',_item.flavour_id,'qty',_trays,'unit','tray'),jsonb_build_object('flavour_id',_item.flavour_id,'qty',_tubs,'unit','tub')),'production','Made '||_item.flavour_name,NULL,NULL);
  END IF;
  UPDATE public.production_report_items SET done=true,produced_qty=_trays,produced_tubs=_tubs WHERE id=_item_id;
  RETURN true;
END; $$;
GRANT EXECUTE ON FUNCTION public.complete_production_item(uuid,integer,integer,integer,text) TO anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.close_production_plan(_report_id uuid,_allow_unfinished boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  PERFORM 1 FROM public.production_reports WHERE id=_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This report could not be found.'; END IF;
  IF NOT _allow_unfinished AND EXISTS(SELECT 1 FROM public.production_report_items WHERE report_id=_report_id AND NOT done) THEN RAISE EXCEPTION 'This report still has unfinished flavours.'; END IF;
  UPDATE public.production_reports SET status='completed',completed_at=now() WHERE id=_report_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.close_production_plan(uuid,boolean) TO anon,authenticated,service_role;