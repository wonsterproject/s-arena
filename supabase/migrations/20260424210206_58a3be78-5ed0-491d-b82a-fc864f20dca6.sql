
-- Ensure full row data is sent on updates so clients can read new status
ALTER TABLE public.matches REPLICA IDENTITY FULL;
ALTER TABLE public.match_invites REPLICA IDENTITY FULL;
ALTER TABLE public.match_players REPLICA IDENTITY FULL;
ALTER TABLE public.match_chat REPLICA IDENTITY FULL;

-- Add tables to the realtime publication (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='matches') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='match_invites') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.match_invites;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='match_players') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.match_players;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='match_chat') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.match_chat;
  END IF;
END $$;
