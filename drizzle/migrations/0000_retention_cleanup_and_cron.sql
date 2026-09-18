-- 古いデータを1日1回自動削除してDBサイズとコストを抑える

CREATE OR REPLACE FUNCTION public.cleanup_old_data()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.call_signals WHERE created_at < now() - interval '1 hour';
  DELETE FROM public.messages WHERE created_at < now() - interval '30 days';
  DELETE FROM public.group_messages WHERE created_at < now() - interval '30 days';
$$;

REVOKE ALL ON FUNCTION public.cleanup_old_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_data() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('cleanup-old-data', '17 0 * * *', 'SELECT public.cleanup_old_data()');
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;