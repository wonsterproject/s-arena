
-- 1. PROFILES
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS game_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_locked_coins INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_turnover_remaining INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON public.profiles(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_profiles_referral_code ON public.profiles(referral_code);
CREATE INDEX IF NOT EXISTS idx_profiles_game_id ON public.profiles(game_id);

-- 2. ID GENERATORS
CREATE OR REPLACE FUNCTION public.generate_unique_game_id()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE candidate TEXT; tries INT := 0;
BEGIN
  LOOP
    candidate := lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE game_id = candidate);
    tries := tries + 1;
    IF tries > 50 THEN RAISE EXCEPTION 'Could not allocate game_id'; END IF;
  END LOOP;
  RETURN candidate;
END; $$;

CREATE OR REPLACE FUNCTION public.generate_unique_referral_code()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; candidate TEXT; i INT; tries INT := 0;
BEGIN
  LOOP
    candidate := '';
    FOR i IN 1..6 LOOP
      candidate := candidate || substr(alphabet, (floor(random() * length(alphabet)) + 1)::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = candidate);
    tries := tries + 1;
    IF tries > 50 THEN RAISE EXCEPTION 'Could not allocate referral_code'; END IF;
  END LOOP;
  RETURN candidate;
END; $$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.profiles WHERE game_id IS NULL OR referral_code IS NULL LOOP
    UPDATE public.profiles
       SET game_id = COALESCE(game_id, public.generate_unique_game_id()),
           referral_code = COALESCE(referral_code, public.generate_unique_referral_code())
     WHERE id = r.id;
  END LOOP;
END $$;

-- 3. REFERRALS TABLE
CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  signup_bonus_paid BOOLEAN NOT NULL DEFAULT false,
  buy_bonus_paid BOOLEAN NOT NULL DEFAULT false,
  buy_bonus_amount INTEGER NOT NULL DEFAULT 0,
  buy_bonus_unlocked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(referred_id)
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ref_select_involved ON public.referrals;
CREATE POLICY ref_select_involved ON public.referrals FOR SELECT TO authenticated
  USING (auth.uid() = referrer_id OR auth.uid() = referred_id OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals(referrer_id);

DROP TRIGGER IF EXISTS trg_referrals_updated_at ON public.referrals;
CREATE TRIGGER trg_referrals_updated_at
BEFORE UPDATE ON public.referrals
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _username TEXT; _display TEXT; _ref_code TEXT; _referrer UUID; _starting INT := 50;
BEGIN
  _username := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1), 'player_' || substr(NEW.id::text, 1, 8));
  _display := COALESCE(NEW.raw_user_meta_data->>'display_name', _username);
  _ref_code := upper(NULLIF(trim(NEW.raw_user_meta_data->>'referral_code'), ''));
  IF _ref_code IS NOT NULL THEN
    SELECT id INTO _referrer FROM public.profiles WHERE referral_code = _ref_code;
    IF _referrer IS NOT NULL THEN _starting := 100; END IF;
  END IF;
  INSERT INTO public.profiles (id, username, display_name, coins, wins, losses, game_id, referral_code, referred_by)
  VALUES (NEW.id, _username, _display, _starting, 0, 0,
    public.generate_unique_game_id(), public.generate_unique_referral_code(), _referrer)
  ON CONFLICT (id) DO NOTHING;
  IF _referrer IS NOT NULL THEN
    INSERT INTO public.referrals (referrer_id, referred_id, signup_bonus_paid)
    VALUES (_referrer, NEW.id, true)
    ON CONFLICT (referred_id) DO NOTHING;
  END IF;
  INSERT INTO public.daily_rewards (user_id, streak) VALUES (NEW.id, 0)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;

-- 5. claim_daily_reward
CREATE OR REPLACE FUNCTION public.claim_daily_reward()
RETURNS TABLE(coins_awarded INTEGER, new_streak INTEGER, total_coins INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); rec record; award int; s int; hrs_since numeric;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO rec FROM public.daily_rewards WHERE user_id = uid;
  IF rec.user_id IS NULL THEN
    INSERT INTO public.daily_rewards (user_id, last_claim_at, streak) VALUES (uid, now(), 1);
    s := 1;
  ELSE
    hrs_since := EXTRACT(EPOCH FROM (now() - rec.last_claim_at))/3600;
    IF hrs_since < 20 THEN RAISE EXCEPTION 'Already claimed. Try again later.'; END IF;
    IF hrs_since < 48 THEN s := rec.streak + 1; ELSE s := 1; END IF;
    UPDATE public.daily_rewards SET last_claim_at = now(), streak = s, updated_at = now() WHERE user_id = uid;
  END IF;
  award := 10 + LEAST(s, 7);
  UPDATE public.profiles SET coins = coins + award WHERE id = uid;
  RETURN QUERY SELECT award, s, (SELECT coins FROM public.profiles WHERE id = uid);
END; $$;

-- 6. admin_resolve_payment_request
CREATE OR REPLACE FUNCTION public.admin_resolve_payment_request(_request_id uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE req record; ref record; bonus INT := 500; turnover_req INT := 25000;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO req FROM public.payment_requests WHERE id = _request_id FOR UPDATE;
  IF req.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF req.status <> 'pending' THEN RAISE EXCEPTION 'Already resolved'; END IF;
  IF _approve THEN
    IF req.kind = 'buy' THEN
      UPDATE public.profiles SET coins = coins + req.coins WHERE id = req.user_id;
      IF req.coins >= 1000 THEN
        SELECT * INTO ref FROM public.referrals WHERE referred_id = req.user_id AND buy_bonus_paid = false;
        IF ref.id IS NOT NULL THEN
          UPDATE public.profiles
            SET coins = coins + bonus,
                referral_locked_coins = referral_locked_coins + bonus,
                referral_turnover_remaining = referral_turnover_remaining + turnover_req
          WHERE id = ref.referrer_id;
          UPDATE public.referrals SET buy_bonus_paid = true, buy_bonus_amount = bonus WHERE id = ref.id;
        END IF;
      END IF;
    END IF;
    UPDATE public.payment_requests SET status='approved', admin_note=_note, resolved_by=auth.uid(), resolved_at=now() WHERE id = _request_id;
  ELSE
    IF req.kind = 'withdraw' THEN
      UPDATE public.profiles SET coins = coins + req.coins WHERE id = req.user_id;
    END IF;
    UPDATE public.payment_requests SET status='rejected', admin_note=_note, resolved_by=auth.uid(), resolved_at=now() WHERE id = _request_id;
  END IF;
END; $$;

-- 7. finalize_match
CREATE OR REPLACE FUNCTION public.finalize_match(_match_id uuid, _winner_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m record; human_count int; pot int; hp record; remaining int; locked int;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = _match_id FOR UPDATE;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF m.status = 'finished' THEN RETURN; END IF;
  IF NOT public.is_match_participant(_match_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not a participant';
  END IF;

  IF m.bet_amount > 0 THEN
    FOR hp IN SELECT user_id FROM public.match_players
              WHERE match_id = _match_id AND is_bot = false AND user_id IS NOT NULL LOOP
      UPDATE public.profiles
        SET referral_turnover_remaining = GREATEST(0, referral_turnover_remaining - m.bet_amount)
      WHERE id = hp.user_id;

      SELECT referral_turnover_remaining, referral_locked_coins
        INTO remaining, locked
        FROM public.profiles WHERE id = hp.user_id;

      IF remaining = 0 AND locked > 0 THEN
        UPDATE public.profiles SET referral_locked_coins = 0 WHERE id = hp.user_id;
        UPDATE public.referrals SET buy_bonus_unlocked = true
          WHERE referrer_id = hp.user_id AND buy_bonus_paid = true AND buy_bonus_unlocked = false;
      END IF;
    END LOOP;
  END IF;

  IF m.bet_amount > 0 AND _winner_id IS NOT NULL THEN
    IF m.mode = 'bot' THEN
      IF EXISTS (SELECT 1 FROM public.match_players
                 WHERE match_id = _match_id AND user_id = _winner_id AND is_bot = false) THEN
        UPDATE public.profiles SET coins = coins + (m.bet_amount * 2), wins = wins + 1 WHERE id = _winner_id;
      ELSE
        UPDATE public.profiles SET losses = losses + 1
          WHERE id IN (SELECT user_id FROM public.match_players
                       WHERE match_id = _match_id AND is_bot = false AND user_id IS NOT NULL);
      END IF;
    ELSE
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
END; $$;

-- 8. request_withdraw_coins (locked-coin guard)
CREATE OR REPLACE FUNCTION public.request_withdraw_coins(_coins integer, _easypaisa_number text, _easypaisa_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); bal int; locked int; withdrawable int; new_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _coins < 1000 THEN RAISE EXCEPTION 'Minimum 1000 coins to withdraw'; END IF;
  IF _easypaisa_number IS NULL OR length(_easypaisa_number) < 10 THEN RAISE EXCEPTION 'Valid EasyPaisa number required'; END IF;
  IF _easypaisa_name IS NULL OR length(trim(_easypaisa_name)) < 2 THEN RAISE EXCEPTION 'Account holder name required'; END IF;
  SELECT coins, referral_locked_coins INTO bal, locked FROM public.profiles WHERE id = uid;
  withdrawable := COALESCE(bal,0) - COALESCE(locked,0);
  IF withdrawable < _coins THEN
    RAISE EXCEPTION 'Withdrawable balance is %. Locked bonus: % coins (complete turnover to unlock).', withdrawable, locked;
  END IF;
  UPDATE public.profiles SET coins = coins - _coins WHERE id = uid;
  INSERT INTO public.payment_requests (user_id, kind, coins, pkr_amount, easypaisa_number, easypaisa_name, status)
  VALUES (uid, 'withdraw', _coins, _coins, _easypaisa_number, _easypaisa_name, 'pending')
  RETURNING id INTO new_id;
  RETURN new_id;
END; $$;

-- 9. PRESENCE
CREATE OR REPLACE FUNCTION public.heartbeat()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN; END IF;
  UPDATE public.profiles SET last_seen_at = now() WHERE id = uid;
END; $$;

CREATE OR REPLACE FUNCTION public.get_online_users(_limit int DEFAULT 50)
RETURNS TABLE(id uuid, username text, display_name text, game_id text, coins int, wins int, last_seen_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, username, display_name, game_id, coins, wins, last_seen_at
  FROM public.profiles
  WHERE last_seen_at IS NOT NULL AND last_seen_at > now() - interval '5 minutes'
  ORDER BY last_seen_at DESC
  LIMIT _limit;
$$;

-- 10. REFERRAL STATS
CREATE OR REPLACE FUNCTION public.get_referral_stats()
RETURNS TABLE(invited_count int, rewarded_count int, locked_coins int, turnover_remaining int, referral_code text, game_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT count(*)::int FROM public.referrals WHERE referrer_id = auth.uid()),
    (SELECT count(*)::int FROM public.referrals WHERE referrer_id = auth.uid() AND buy_bonus_paid = true),
    p.referral_locked_coins, p.referral_turnover_remaining, p.referral_code, p.game_id
  FROM public.profiles p WHERE p.id = auth.uid();
$$;
