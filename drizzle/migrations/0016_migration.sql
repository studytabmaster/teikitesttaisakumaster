ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now();
UPDATE public.groups g SET last_activity_at = COALESCE((SELECT max(created_at) FROM public.group_messages m WHERE m.group_id = g.id), g.created_at);
CREATE INDEX IF NOT EXISTS groups_open_activity_idx ON public.groups (is_open, last_activity_at DESC);
CREATE OR REPLACE FUNCTION public.bump_group_activity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.groups SET last_activity_at = now()
  WHERE id = NEW.group_id AND last_activity_at < now() - interval '2 minutes';
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_bump_group_activity ON public.group_messages;
CREATE TRIGGER trg_bump_group_activity AFTER INSERT ON public.group_messages FOR EACH ROW EXECUTE FUNCTION public.bump_group_activity();