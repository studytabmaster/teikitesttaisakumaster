ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.call_signals REPLICA IDENTITY FULL;
ALTER TABLE public.group_messages REPLICA IDENTITY FULL;
ALTER TABLE public.group_members REPLICA IDENTITY FULL;
ALTER TABLE public.group_join_requests REPLICA IDENTITY FULL;
ALTER TABLE public.friendships REPLICA IDENTITY FULL;
ALTER TABLE public.group_reads REPLICA IDENTITY FULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['messages','call_signals','group_messages','group_members','group_join_requests','friendships','group_reads']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;