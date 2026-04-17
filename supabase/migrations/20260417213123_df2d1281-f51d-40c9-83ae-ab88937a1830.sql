
-- ============ MATCHMAKING QUEUE ============
CREATE TABLE public.matchmaking_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  mode match_mode NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.matchmaking_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "queue_select_all" ON public.matchmaking_queue FOR SELECT TO authenticated USING (true);
CREATE POLICY "queue_insert_self" ON public.matchmaking_queue FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "queue_delete_self" ON public.matchmaking_queue FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ MATCH CHAT ============
CREATE TABLE public.match_chat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL,
  user_id uuid NOT NULL,
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 200),
  kind text NOT NULL DEFAULT 'text' CHECK (kind IN ('text','emoji')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.match_chat ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_match_chat_match ON public.match_chat(match_id, created_at);

CREATE POLICY "chat_select_participant" ON public.match_chat FOR SELECT TO authenticated
  USING (public.is_match_participant(match_id, auth.uid()));
CREATE POLICY "chat_insert_participant" ON public.match_chat FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_match_participant(match_id, auth.uid()));

-- ============ DAILY REWARDS ============
CREATE TABLE public.daily_rewards (
  user_id uuid PRIMARY KEY,
  last_claim_at timestamptz,
  streak int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.daily_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dr_select_own" ON public.daily_rewards FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "dr_insert_own" ON public.daily_rewards FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "dr_update_own" ON public.daily_rewards FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- ============ SHOP ITEMS ============
CREATE TYPE public.shop_item_type AS ENUM ('token_skin','avatar_frame','dice_skin','board_theme');
CREATE TYPE public.shop_rarity AS ENUM ('common','rare','epic','legendary');

CREATE TABLE public.shop_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  type shop_item_type NOT NULL,
  rarity shop_rarity NOT NULL DEFAULT 'common',
  price_coins int NOT NULL CHECK (price_coins >= 0),
  preview text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop_select_all" ON public.shop_items FOR SELECT TO authenticated USING (true);

INSERT INTO public.shop_items (slug,name,description,type,rarity,price_coins,preview) VALUES
  ('skin_neon','Neon Glow','Glowing token skin','token_skin','rare',500,'#22d3ee'),
  ('skin_gold','Gold Royal','Gold plated tokens','token_skin','epic',1500,'#fbbf24'),
  ('skin_galaxy','Galaxy','Cosmic swirl tokens','token_skin','legendary',3000,'#a855f7'),
  ('frame_silver','Silver Frame','Silver avatar frame','avatar_frame','common',300,'#cbd5e1'),
  ('frame_gold','Gold Frame','Gold avatar frame','avatar_frame','rare',800,'#fbbf24'),
  ('dice_neon','Neon Dice','Glowing neon dice','dice_skin','rare',600,'#22d3ee'),
  ('board_dark','Midnight Board','Dark themed board','board_theme','epic',2000,'#0f172a');

-- ============ USER INVENTORY ============
CREATE TABLE public.user_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES public.shop_items(id) ON DELETE CASCADE,
  equipped boolean NOT NULL DEFAULT false,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_id)
);
ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inv_select_own" ON public.user_inventory FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "inv_insert_own" ON public.user_inventory FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "inv_update_own" ON public.user_inventory FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- ============ AVATAR STORAGE ============
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars','avatars',true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "avatars_public_read" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'avatars');
CREATE POLICY "avatars_user_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "avatars_user_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "avatars_user_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============ FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.join_or_create_match(_mode match_mode)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  required_humans int;
  new_match_id uuid;
  partner_count int;
  partner_ids uuid[];
  colors player_color_enum[] := ARRAY['red','blue','green','yellow']::player_color_enum[];
  i int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  required_humans := CASE _mode WHEN '1v1' THEN 2 WHEN '2v2' THEN 4 WHEN 'random' THEN 2 ELSE 2 END;

  SELECT array_agg(user_id) INTO partner_ids FROM (
    SELECT user_id FROM public.matchmaking_queue
    WHERE mode = _mode AND user_id <> uid
    ORDER BY created_at ASC LIMIT required_humans - 1
  ) q;
  partner_count := COALESCE(array_length(partner_ids,1), 0);

  IF partner_count < required_humans - 1 THEN
    INSERT INTO public.matchmaking_queue (user_id, mode) VALUES (uid, _mode)
    ON CONFLICT (user_id) DO UPDATE SET mode = EXCLUDED.mode, created_at = now();
    RETURN NULL;
  END IF;

  INSERT INTO public.matches (host_id, mode, status) VALUES (uid, _mode, 'active') RETURNING id INTO new_match_id;
  INSERT INTO public.match_players (match_id, user_id, is_bot, color, team, ready)
  VALUES (new_match_id, uid, false, colors[1], 0, true);
  FOR i IN 1..partner_count LOOP
    INSERT INTO public.match_players (match_id, user_id, is_bot, color, team, ready)
    VALUES (new_match_id, partner_ids[i], false, colors[i+1], i, true);
  END LOOP;
  DELETE FROM public.matchmaking_queue WHERE user_id = uid OR user_id = ANY(partner_ids);
  RETURN new_match_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_daily_reward()
RETURNS TABLE(coins_awarded int, new_streak int, total_coins int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  rec record;
  award int;
  s int;
  hrs_since numeric;
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
  award := 100 + (LEAST(s,7) * 50);
  UPDATE public.profiles SET coins = coins + award WHERE id = uid;
  RETURN QUERY SELECT award, s, (SELECT coins FROM public.profiles WHERE id = uid);
END;
$$;

CREATE OR REPLACE FUNCTION public.purchase_shop_item(_item_id uuid)
RETURNS TABLE(success boolean, total_coins int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  item record;
  bal int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO item FROM public.shop_items WHERE id = _item_id;
  IF item.id IS NULL THEN RAISE EXCEPTION 'Item not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_inventory WHERE user_id = uid AND item_id = _item_id) THEN
    RAISE EXCEPTION 'Already owned';
  END IF;
  SELECT coins INTO bal FROM public.profiles WHERE id = uid;
  IF bal < item.price_coins THEN RAISE EXCEPTION 'Not enough coins'; END IF;
  UPDATE public.profiles SET coins = coins - item.price_coins WHERE id = uid;
  INSERT INTO public.user_inventory (user_id, item_id) VALUES (uid, _item_id);
  RETURN QUERY SELECT true, (SELECT coins FROM public.profiles WHERE id = uid);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_friend_match(_mode match_mode, _opponent uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  new_match_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF uid = _opponent THEN RAISE EXCEPTION 'Cannot invite yourself'; END IF;
  INSERT INTO public.matches (host_id, mode, status) VALUES (uid, _mode, 'waiting') RETURNING id INTO new_match_id;
  INSERT INTO public.match_players (match_id, user_id, is_bot, color, team, ready)
    VALUES (new_match_id, uid, false, 'red', 0, true);
  INSERT INTO public.match_invites (from_user, to_user, match_id, mode, status)
    VALUES (uid, _opponent, new_match_id, _mode, 'pending');
  RETURN new_match_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_match_invite(_invite_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  inv record;
  next_color player_color_enum;
  next_team int;
  player_count int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO inv FROM public.match_invites WHERE id = _invite_id AND to_user = uid AND status = 'pending';
  IF inv.id IS NULL THEN RAISE EXCEPTION 'Invite not found'; END IF;
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

-- ============ REALTIME (skip already-added matches) ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_chat;
ALTER PUBLICATION supabase_realtime ADD TABLE public.matchmaking_queue;

ALTER TABLE public.match_chat REPLICA IDENTITY FULL;
ALTER TABLE public.matchmaking_queue REPLICA IDENTITY FULL;
