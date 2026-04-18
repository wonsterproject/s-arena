-- Add game_type enum and column to matches
DO $$ BEGIN
  CREATE TYPE public.game_type AS ENUM ('ludo','chess','carrom','pool');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS game_type public.game_type NOT NULL DEFAULT 'ludo';

-- Overload create_friend_match to accept game type
CREATE OR REPLACE FUNCTION public.create_friend_match(_mode match_mode, _opponent uuid, _bet integer DEFAULT 0, _game game_type DEFAULT 'ludo')
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  new_match_id uuid;
  bal int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF uid = _opponent THEN RAISE EXCEPTION 'Cannot invite yourself'; END IF;
  IF _bet < 0 THEN RAISE EXCEPTION 'Invalid bet'; END IF;
  IF _bet > 0 THEN
    SELECT coins INTO bal FROM public.profiles WHERE id = uid;
    IF bal < _bet THEN RAISE EXCEPTION 'Not enough coins for this bet'; END IF;
    UPDATE public.profiles SET coins = coins - _bet WHERE id = uid;
  END IF;
  INSERT INTO public.matches (host_id, mode, status, bet_amount, game_type)
    VALUES (uid, _mode, 'waiting', _bet, _game)
    RETURNING id INTO new_match_id;
  INSERT INTO public.match_players (match_id, user_id, is_bot, color, team, ready)
    VALUES (new_match_id, uid, false, 'red', 0, true);
  INSERT INTO public.match_invites (from_user, to_user, match_id, mode, status)
    VALUES (uid, _opponent, new_match_id, _mode, 'pending');
  RETURN new_match_id;
END;
$function$;

-- Bot match for any game type
CREATE OR REPLACE FUNCTION public.create_game_bot_match(_game game_type)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  new_match_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.matches (host_id, mode, status, game_type)
    VALUES (uid, 'bot', 'active', _game)
    RETURNING id INTO new_match_id;
  INSERT INTO public.match_players (match_id, user_id, is_bot, bot_name, color, team, ready) VALUES
    (new_match_id, uid,  false, NULL, 'red', 0, true),
    (new_match_id, NULL, true,  'CPU', 'blue', 1, true);
  RETURN new_match_id;
END;
$function$;