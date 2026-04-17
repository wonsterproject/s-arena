
-- Payment settings (singleton row)
CREATE TABLE public.payment_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  easypaisa_number text NOT NULL DEFAULT '03486535749',
  easypaisa_name text NOT NULL DEFAULT 'Irshad Bibi',
  updated_at timestamptz NOT NULL DEFAULT now(),
  singleton boolean NOT NULL DEFAULT true UNIQUE
);

INSERT INTO public.payment_settings (easypaisa_number, easypaisa_name) VALUES ('03486535749', 'Irshad Bibi');

ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ps_select_all" ON public.payment_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "ps_admin_update" ON public.payment_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "ps_admin_insert" ON public.payment_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Payment request kind/status enums
CREATE TYPE public.payment_kind AS ENUM ('buy', 'withdraw');
CREATE TYPE public.payment_request_status AS ENUM ('pending', 'approved', 'rejected');

-- Payment requests
CREATE TABLE public.payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind public.payment_kind NOT NULL,
  coins integer NOT NULL CHECK (coins > 0),
  pkr_amount integer NOT NULL CHECK (pkr_amount > 0),
  screenshot_url text,                -- buy only
  easypaisa_number text,              -- withdraw only
  easypaisa_name text,                -- withdraw only
  status public.payment_request_status NOT NULL DEFAULT 'pending',
  admin_note text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pr_user ON public.payment_requests (user_id, created_at DESC);
CREATE INDEX idx_pr_status ON public.payment_requests (status, created_at DESC);

ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pr_select_own_or_admin" ON public.payment_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "pr_insert_own" ON public.payment_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "pr_admin_update" ON public.payment_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Storage bucket for buy screenshots (private; only owner + admin can view)
INSERT INTO storage.buckets (id, name, public) VALUES ('payment-proofs', 'payment-proofs', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "pp_user_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-proofs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "pp_user_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payment-proofs' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin')));

-- Match wager column
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS bet_amount integer NOT NULL DEFAULT 0;

-- Function: request to buy coins
CREATE OR REPLACE FUNCTION public.request_buy_coins(_coins integer, _screenshot_url text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  new_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _coins < 100 THEN RAISE EXCEPTION 'Minimum 100 coins'; END IF;
  IF _screenshot_url IS NULL OR length(_screenshot_url) < 5 THEN
    RAISE EXCEPTION 'Screenshot required';
  END IF;
  INSERT INTO public.payment_requests (user_id, kind, coins, pkr_amount, screenshot_url, status)
  VALUES (uid, 'buy', _coins, _coins, _screenshot_url, 'pending')
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

-- Function: request to withdraw coins (locks coins immediately)
CREATE OR REPLACE FUNCTION public.request_withdraw_coins(_coins integer, _easypaisa_number text, _easypaisa_name text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  bal int;
  new_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _coins < 1000 THEN RAISE EXCEPTION 'Minimum 1000 coins to withdraw'; END IF;
  IF _easypaisa_number IS NULL OR length(_easypaisa_number) < 10 THEN
    RAISE EXCEPTION 'Valid EasyPaisa number required';
  END IF;
  IF _easypaisa_name IS NULL OR length(trim(_easypaisa_name)) < 2 THEN
    RAISE EXCEPTION 'Account holder name required';
  END IF;
  SELECT coins INTO bal FROM public.profiles WHERE id = uid;
  IF bal < _coins THEN RAISE EXCEPTION 'Not enough coins'; END IF;
  -- Lock coins now (deduct); refund if rejected
  UPDATE public.profiles SET coins = coins - _coins WHERE id = uid;
  INSERT INTO public.payment_requests (user_id, kind, coins, pkr_amount, easypaisa_number, easypaisa_name, status)
  VALUES (uid, 'withdraw', _coins, _coins, _easypaisa_number, _easypaisa_name, 'pending')
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

-- Function: admin resolves a payment request
CREATE OR REPLACE FUNCTION public.admin_resolve_payment_request(_request_id uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  req record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO req FROM public.payment_requests WHERE id = _request_id FOR UPDATE;
  IF req.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF req.status <> 'pending' THEN RAISE EXCEPTION 'Already resolved'; END IF;

  IF _approve THEN
    IF req.kind = 'buy' THEN
      UPDATE public.profiles SET coins = coins + req.coins WHERE id = req.user_id;
    END IF;
    -- For withdraw: coins already deducted at request time; nothing extra
    UPDATE public.payment_requests SET status='approved', admin_note=_note, resolved_by=auth.uid(), resolved_at=now()
      WHERE id = _request_id;
  ELSE
    IF req.kind = 'withdraw' THEN
      -- Refund locked coins
      UPDATE public.profiles SET coins = coins + req.coins WHERE id = req.user_id;
    END IF;
    UPDATE public.payment_requests SET status='rejected', admin_note=_note, resolved_by=auth.uid(), resolved_at=now()
      WHERE id = _request_id;
  END IF;
END;
$$;

-- Function: admin updates EasyPaisa settings
CREATE OR REPLACE FUNCTION public.update_payment_settings(_number text, _name text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  UPDATE public.payment_settings SET easypaisa_number=_number, easypaisa_name=_name, updated_at=now()
    WHERE singleton = true;
END;
$$;

-- Update create_friend_match to support a bet amount and lock host coins
CREATE OR REPLACE FUNCTION public.create_friend_match(_mode match_mode, _opponent uuid, _bet integer DEFAULT 0)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  INSERT INTO public.matches (host_id, mode, status, bet_amount) VALUES (uid, _mode, 'waiting', _bet)
    RETURNING id INTO new_match_id;
  INSERT INTO public.match_players (match_id, user_id, is_bot, color, team, ready)
    VALUES (new_match_id, uid, false, 'red', 0, true);
  INSERT INTO public.match_invites (from_user, to_user, match_id, mode, status)
    VALUES (uid, _opponent, new_match_id, _mode, 'pending');
  RETURN new_match_id;
END;
$$;

-- Update accept_match_invite to lock accepter's bet
CREATE OR REPLACE FUNCTION public.accept_match_invite(_invite_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  inv record;
  m record;
  next_color player_color_enum;
  next_team int;
  player_count int;
  bal int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO inv FROM public.match_invites WHERE id = _invite_id AND to_user = uid AND status = 'pending';
  IF inv.id IS NULL THEN RAISE EXCEPTION 'Invite not found'; END IF;
  SELECT * INTO m FROM public.matches WHERE id = inv.match_id;
  IF m.bet_amount > 0 THEN
    SELECT coins INTO bal FROM public.profiles WHERE id = uid;
    IF bal < m.bet_amount THEN RAISE EXCEPTION 'Not enough coins to accept this bet'; END IF;
    UPDATE public.profiles SET coins = coins - m.bet_amount WHERE id = uid;
  END IF;
  SELECT count(*) INTO player_count FROM public.match_players WHERE match_id = inv.match_id;
  next_color := (ARRAY['red','blue','green','yellow']::player_color_enum[])[player_count + 1];
  next_team := player_count;
  INSERT INTO public.match_players (match_id, user_id, is_bot, color, team, ready)
    VALUES (inv.match_id, uid, false, next_color, next_team, true);
  UPDATE public.match_invites SET status = 'accepted' WHERE id = _invite_id;
  UPDATE public.matches SET status = 'active', updated_at = now() WHERE id = inv.match_id;
  RETURN inv.match_id;
END;
$$;

-- Function to finalize match payout
CREATE OR REPLACE FUNCTION public.finalize_match(_match_id uuid, _winner_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    SELECT count(*) INTO human_count FROM public.match_players WHERE match_id = _match_id AND is_bot = false;
    pot := m.bet_amount * human_count;
    UPDATE public.profiles SET coins = coins + pot, wins = wins + 1 WHERE id = _winner_id;
    UPDATE public.profiles SET losses = losses + 1
      WHERE id IN (SELECT user_id FROM public.match_players WHERE match_id = _match_id AND is_bot = false AND user_id <> _winner_id);
  ELSIF _winner_id IS NOT NULL THEN
    UPDATE public.profiles SET wins = wins + 1 WHERE id = _winner_id;
    UPDATE public.profiles SET losses = losses + 1
      WHERE id IN (SELECT user_id FROM public.match_players WHERE match_id = _match_id AND is_bot = false AND user_id <> _winner_id);
  END IF;
  UPDATE public.matches SET status='finished', winner_id=_winner_id, updated_at=now() WHERE id=_match_id;
END;
$$;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_requests;
