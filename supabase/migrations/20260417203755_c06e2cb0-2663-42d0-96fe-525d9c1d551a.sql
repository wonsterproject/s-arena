-- ========== PROFILES ==========
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  coins INTEGER NOT NULL DEFAULT 1000,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- update updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uname TEXT;
BEGIN
  uname := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));
  -- ensure uniqueness by appending suffix if needed
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = uname) LOOP
    uname := uname || floor(random() * 1000)::text;
  END LOOP;
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (NEW.id, uname, uname);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ========== FRIEND REQUESTS ==========
CREATE TYPE public.friend_request_status AS ENUM ('pending','accepted','declined');

CREATE TABLE public.friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_user UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status friend_request_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (from_user, to_user)
);

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fr_select_involved" ON public.friend_requests FOR SELECT TO authenticated
  USING (auth.uid() = from_user OR auth.uid() = to_user);
CREATE POLICY "fr_insert_self" ON public.friend_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = from_user AND from_user <> to_user);
CREATE POLICY "fr_update_recipient" ON public.friend_requests FOR UPDATE TO authenticated
  USING (auth.uid() = to_user OR auth.uid() = from_user);
CREATE POLICY "fr_delete_involved" ON public.friend_requests FOR DELETE TO authenticated
  USING (auth.uid() = from_user OR auth.uid() = to_user);

-- ========== FRIENDS ==========
CREATE TABLE public.friends (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, friend_id),
  CHECK (user_id <> friend_id)
);

ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "friends_select_own" ON public.friends FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = friend_id);
CREATE POLICY "friends_insert_own" ON public.friends FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "friends_delete_own" ON public.friends FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- when a friend request is accepted, create symmetric friendship
CREATE OR REPLACE FUNCTION public.handle_friend_accept()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status <> 'accepted' THEN
    INSERT INTO public.friends (user_id, friend_id) VALUES (NEW.from_user, NEW.to_user) ON CONFLICT DO NOTHING;
    INSERT INTO public.friends (user_id, friend_id) VALUES (NEW.to_user, NEW.from_user) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER fr_on_accept AFTER UPDATE ON public.friend_requests
FOR EACH ROW EXECUTE FUNCTION public.handle_friend_accept();

-- ========== MATCHES ==========
CREATE TYPE public.match_mode AS ENUM ('bot','1v1','2v2','1v2','custom','random');
CREATE TYPE public.match_status AS ENUM ('waiting','active','finished','cancelled');
CREATE TYPE public.player_color_enum AS ENUM ('red','blue','green','yellow');

CREATE TABLE public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mode match_mode NOT NULL,
  status match_status NOT NULL DEFAULT 'waiting',
  winner_id UUID REFERENCES public.profiles(id),
  state JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER matches_set_updated_at BEFORE UPDATE ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.match_players (
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_bot BOOLEAN NOT NULL DEFAULT false,
  bot_name TEXT,
  color player_color_enum NOT NULL,
  team SMALLINT NOT NULL DEFAULT 0,
  ready BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, color)
);

ALTER TABLE public.match_players ENABLE ROW LEVEL SECURITY;

-- helper function: am I in this match?
CREATE OR REPLACE FUNCTION public.is_match_participant(_match_id UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.match_players
    WHERE match_id = _match_id AND user_id = _user
  ) OR EXISTS (
    SELECT 1 FROM public.matches WHERE id = _match_id AND host_id = _user
  );
$$;

CREATE POLICY "matches_select_participant" ON public.matches FOR SELECT TO authenticated
  USING (public.is_match_participant(id, auth.uid()) OR status = 'waiting');
CREATE POLICY "matches_insert_self_host" ON public.matches FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = host_id);
CREATE POLICY "matches_update_host" ON public.matches FOR UPDATE TO authenticated
  USING (auth.uid() = host_id OR public.is_match_participant(id, auth.uid()));

CREATE POLICY "mp_select_participant" ON public.match_players FOR SELECT TO authenticated
  USING (public.is_match_participant(match_id, auth.uid()));
CREATE POLICY "mp_insert_participant" ON public.match_players FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.matches WHERE id = match_id AND host_id = auth.uid()));
CREATE POLICY "mp_update_self" ON public.match_players FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.matches WHERE id = match_id AND host_id = auth.uid()));
CREATE POLICY "mp_delete_self" ON public.match_players FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.matches WHERE id = match_id AND host_id = auth.uid()));

-- ========== MATCH INVITES ==========
CREATE TYPE public.invite_status AS ENUM ('pending','accepted','declined','cancelled');

CREATE TABLE public.match_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  from_user UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_user UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mode match_mode NOT NULL,
  status invite_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.match_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mi_select_involved" ON public.match_invites FOR SELECT TO authenticated
  USING (auth.uid() = from_user OR auth.uid() = to_user);
CREATE POLICY "mi_insert_self" ON public.match_invites FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = from_user);
CREATE POLICY "mi_update_involved" ON public.match_invites FOR UPDATE TO authenticated
  USING (auth.uid() = from_user OR auth.uid() = to_user);

-- realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_invites;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friends;