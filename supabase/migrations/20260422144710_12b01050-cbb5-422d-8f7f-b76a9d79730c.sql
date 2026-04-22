-- Function: create a paid (bet-based) bot match. Locks the bet coins from user and creates a single-player bot match.
CREATE OR REPLACE FUNCTION public.create_paid_bot_match(_game game_type, _bet integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  bal int;
  new_match_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _bet < 50 THEN RAISE EXCEPTION 'Minimum bet is 50 coins'; END IF;

  SELECT coins INTO bal FROM public.profiles WHERE id = uid;
  IF bal IS NULL OR bal < _bet THEN
    RAISE EXCEPTION 'Not enough coins for this bet';
  END IF;

  -- Lock the bet
  UPDATE public.profiles SET coins = coins - _bet WHERE id = uid;

  INSERT INTO public.matches (host_id, mode, status, game_type, bet_amount)
    VALUES (uid, 'bot', 'active', _game, _bet)
    RETURNING id INTO new_match_id;

  -- Seat: human as red(0), bot as blue(1)
  INSERT INTO public.match_players (match_id, user_id, is_bot, bot_name, color, team, ready) VALUES
    (new_match_id, uid,  false, NULL,  'red',  0, true),
    (new_match_id, NULL, true,  'CPU', 'blue', 1, true);

  RETURN new_match_id;
END;
$$;

-- Update finalize_match to reward 2x bet on bot-match wins (human gets bet back + same amount as reward).
CREATE OR REPLACE FUNCTION public.finalize_match(_match_id uuid, _winner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  m record;
  human_count int;
  pot int;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = _match_id FOR UPDATE;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF m.status = 'finished' THEN RETURN; END IF;
  -- Verify caller is participant
  IF NOT public.is_match_participant(_match_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not a participant';
  END IF;

  IF m.bet_amount > 0 AND _winner_id IS NOT NULL THEN
    IF m.mode = 'bot' THEN
      -- Bot match: award 2x bet to winning human (only if human won)
      IF EXISTS (SELECT 1 FROM public.match_players
                 WHERE match_id = _match_id AND user_id = _winner_id AND is_bot = false) THEN
        UPDATE public.profiles
          SET coins = coins + (m.bet_amount * 2), wins = wins + 1
          WHERE id = _winner_id;
      ELSE
        -- Bot won — human already lost the locked bet; just record the loss
        UPDATE public.profiles SET losses = losses + 1
          WHERE id IN (SELECT user_id FROM public.match_players
                       WHERE match_id = _match_id AND is_bot = false AND user_id IS NOT NULL);
      END IF;
    ELSE
      -- PvP match: pot is bet * humans
      SELECT count(*) INTO human_count FROM public.match_players WHERE match_id = _match_id AND is_bot = false;
      pot := m.bet_amount * human_count;
      UPDATE public.profiles SET coins = coins + pot, wins = wins + 1 WHERE id = _winner_id;
      UPDATE public.profiles SET losses = losses + 1
        WHERE id IN (SELECT user_id FROM public.match_players WHERE match_id = _match_id AND is_bot = false AND user_id <> _winner_id);
    END IF;
  ELSIF _winner_id IS NOT NULL THEN
    UPDATE public.profiles SET wins = wins + 1 WHERE id = _winner_id;
    UPDATE public.profiles SET losses = losses + 1
      WHERE id IN (SELECT user_id FROM public.match_players WHERE match_id = _match_id AND is_bot = false AND user_id <> _winner_id);
  END IF;

  UPDATE public.matches SET status='finished', winner_id=_winner_id, updated_at=now() WHERE id=_match_id;
END;
$$;