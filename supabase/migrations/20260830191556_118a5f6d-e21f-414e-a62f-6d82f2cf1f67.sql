ALTER TABLE public.flavours
  ADD COLUMN IF NOT EXISTS contains_gluten boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contains_nuts boolean NOT NULL DEFAULT false;

ALTER TABLE public.production_reports
  ADD COLUMN IF NOT EXISTS days integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS sorbetto_day integer NOT NULL DEFAULT 1;

ALTER TABLE public.production_report_items
  ADD COLUMN IF NOT EXISTS day_index integer NOT NULL DEFAULT 1;