-- Add game_type and bet_amount to matchmaking queue so different games/bets pair separately
ALTER TABLE public.matchmaking_queue
  ADD COLUMN IF NOT EXISTS game_type public.game_type NOT NULL DEFAULT 'ludo',
  ADD COLUMN IF NOT EXISTS bet_amount integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_mmq_game_mode_bet
  ON public.matchmaking_queue (game_type, mode, bet_amount, created_at);

-- New matchmaking RPC: pairs two online users for a given game + bet
CREATE OR REPLACE FUNCTION public.join_or_create_game_match(
  _game public.game_type,
  _mode public.match_mode,
  _bet integer DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  partner uuid;
  partner_qid uuid;
  new_match_id uuid;
  bal int;
  partner_bal int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _bet < 0 THEN RAISE EXCEPTION 'Invalid bet'; END IF;
  IF _mode NOT IN ('1v1','random') THEN
    RAISE EXCEPTION 'Only 1v1/random supported for now';
  END IF;

  -- Verify caller has balance for the bet (don't deduct yet — only on match)
  IF _bet > 0 THEN
    SELECT coins INTO bal FROM public.profiles WHERE id = uid;
    IF bal < _bet THEN RAISE EXCEPTION 'Not enough coins for this bet'; END IF;
  END IF;

  -- Try to find a waiting partner with the SAME game and bet (FIFO)
  SELECT id, user_id
    INTO partner_qid, partner
    FROM public.matchmaking_queue
   WHERE game_type = _game
     AND mode = _mode
     AND bet_amount = _bet
     AND user_id <> uid
   ORDER BY created_at ASC
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF partner IS NULL THEN
    -- Queue self (replace any prior queue entry)
    DELETE FROM public.matchmaking_queue WHERE user_id = uid;
    INSERT INTO public.matchmaking_queue (user_id, mode, game_type, bet_amount)
      VALUES (uid, _mode, _game, _bet);
    RETURN NULL;
  END IF;

  -- Verify partner still has the bet (they might have spent coins meanwhile)
  IF _bet > 0 THEN
    SELECT coins INTO partner_bal FROM public.profiles WHERE id = partner;
    IF partner_bal < _bet THEN
      -- Drop stale partner from queue, then queue self
      DELETE FROM public.matchmaking_queue WHERE id = partner_qid;
      DELETE FROM public.matchmaking_queue WHERE user_id = uid;
      INSERT INTO public.matchmaking_queue (user_id, mode, game_type, bet_amount)
        VALUES (uid, _mode, _game, _bet);
      RETURN NULL;
    END IF;
    -- Lock coins from both
    UPDATE public.profiles SET coins = coins - _bet WHERE id = uid;
    UPDATE public.profiles SET coins = coins - _bet WHERE id = partner;
  END IF;

  -- Create match (active, both ready)
  INSERT INTO public.matches (host_id, mode, status, bet_amount, game_type)
    VALUES (partner, _mode, 'active', _bet, _game)
    RETURNING id INTO new_match_id;

  INSERT INTO public.match_players (match_id, user_id, is_bot, color, team, ready) VALUES
    (new_match_id, partner, false, 'red',  0, true),
    (new_match_id, uid,     false, 'blue', 1, true);

  -- Remove both from queue
  DELETE FROM public.matchmaking_queue WHERE user_id IN (uid, partner);

  RETURN new_match_id;
END;
$$;