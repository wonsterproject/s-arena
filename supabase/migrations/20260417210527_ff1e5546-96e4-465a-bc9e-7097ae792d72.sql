-- Create a security definer RPC that atomically creates a bot match + players
CREATE OR REPLACE FUNCTION public.create_bot_match()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  new_match_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.matches (host_id, mode, status)
  VALUES (uid, 'bot', 'active')
  RETURNING id INTO new_match_id;

  INSERT INTO public.match_players (match_id, user_id, is_bot, bot_name, color, team, ready) VALUES
    (new_match_id, uid,  false, NULL,         'red',    0, true),
    (new_match_id, NULL, true,  'Bot Alpha',  'blue',   1, true),
    (new_match_id, NULL, true,  'Bot Bravo',  'green',  2, true),
    (new_match_id, NULL, true,  'Bot Charlie','yellow', 3, true);

  RETURN new_match_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_bot_match() TO authenticated;