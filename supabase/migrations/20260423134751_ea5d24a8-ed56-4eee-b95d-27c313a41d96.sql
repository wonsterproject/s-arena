-- ============================================================
-- FAKE USERS SYSTEM
-- 200 always-online fake users that play via a hard bot,
-- but appear in the UI with their real name + avatar.
-- ============================================================

-- 1) Table
CREATE TABLE IF NOT EXISTS public.fake_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  display_name text NOT NULL,
  avatar_url text NOT NULL,
  game_id text NOT NULL UNIQUE,
  coins integer NOT NULL DEFAULT 1500,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fake_users ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read (so they appear in lobby/hub)
DROP POLICY IF EXISTS fake_users_select_all ON public.fake_users;
CREATE POLICY fake_users_select_all ON public.fake_users
  FOR SELECT TO authenticated USING (true);

-- Only admins can modify
DROP POLICY IF EXISTS fake_users_admin_insert ON public.fake_users;
CREATE POLICY fake_users_admin_insert ON public.fake_users
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS fake_users_admin_update ON public.fake_users;
CREATE POLICY fake_users_admin_update ON public.fake_users
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS fake_users_admin_delete ON public.fake_users;
CREATE POLICY fake_users_admin_delete ON public.fake_users
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- updated_at trigger
DROP TRIGGER IF EXISTS fake_users_set_updated_at ON public.fake_users;
CREATE TRIGGER fake_users_set_updated_at
  BEFORE UPDATE ON public.fake_users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Seed 200 fake users (ON CONFLICT DO NOTHING — safe to re-run)
DO $$
DECLARE
  names text[] := ARRAY[
    'Ayaan','Zain','Ahmed','Ali','Hassan','Hussain','Omar','Usman','Hamza','Bilal',
    'Ibrahim','Ismail','Salman','Fahad','Saad','Talha','Daniyal','Rayyan','Farhan','Imran',
    'Aisha','Fatima','Zainab','Maryam','Noor','Hira','Sana','Iqra','Mahnoor','Amna',
    'Laiba','Alina','Eman','Mehak','Kinza','Rimsha','Anaya','Dua','Areeba','Saba',
    'Adam','Noah','Liam','Mason','Ethan','James','Logan','Lucas','Henry','Jackson',
    'Olivia','Emma','Ava','Sophia','Isabella','Mia','Charlotte','Amelia','Harper','Evelyn',
    'Khalid','Tariq','Yousuf','Zakariya','Noman','Adnan','Waleed','Sameer','Junaid','Shayan',
    'Rabia','Bushra','Nadia','Samina','Farah','Shazia','Nida','Uzma','Tehmina','Sidra',
    'Daniel','Michael','David','Joseph','Samuel','Matthew','Andrew','Joshua','Christopher','Anthony',
    'Chloe','Grace','Lily','Ella','Scarlett','Aria','Zoey','Hannah','Nora','Stella',
    'Haris','Azlan','Shahzaib','Moiz','Taimoor','Zubair','Raza','Kashif','Yasir','Adil',
    'Sehrish','Komal','Kiran','Fiza','Noreen','Sadia','Hafsa','Minal','Haniya','Anum',
    'Ryan','Caleb','Nathan','Aaron','Isaac','Owen','Dylan','Carter','Wyatt','Julian',
    'Penelope','Layla','Riley','Victoria','Lillian','Addison','Aubrey','Natalie','Brooklyn','Leah',
    'Rehan','Adeel','Danish','Sohail','Arslan','Naveed','Shoaib','Irfan','Tahir','Zaki',
    'Maliha','Sania','Nimra','Sehr','Abeer','Hoorain','Iffat','Shaista','Faryal','Lubna',
    'Sebastian','Leo','Jack','Luke','Gabriel','Eli','Isaiah','Roman','Ezra','Miles',
    'Bella','Aurora','Skylar','Paisley','Everly','Claire','Lucy','Anna','Caroline','Maya',
    'Hamid','Asad','Shahid','Rashid','Majid','Nabeel','Faris','Aqeel','Salmaan','Zarar',
    'Kausar','Naima','Rukhsar','Parveen','Yasmeen','Shabnam','Ruqaiya','Sakeena','Nargis','Samra'
  ];
  i int;
  uname text;
  gid text;
  avatar text;
  coins_val int;
  wins_val int;
  losses_val int;
BEGIN
  FOR i IN 1..array_length(names, 1) LOOP
    -- Build a unique-ish lowercase username (Ayaan -> ayaan_001)
    uname := lower(names[i]) || '_' || lpad(i::text, 3, '0');
    -- DiceBear avataaars (free, public, deterministic by seed)
    avatar := 'https://api.dicebear.com/7.x/avataaars/svg?seed=' || uname;
    -- 6-digit game id, deterministic-ish but unique per slot
    gid := lpad(((100000 + i * 137) % 900000 + 100000)::text, 6, '0');
    -- Random-but-stable starter stats (admin can edit later)
    coins_val := 500 + ((i * 73) % 4500);
    wins_val := (i * 11) % 80;
    losses_val := (i * 7) % 40;

    INSERT INTO public.fake_users (username, display_name, avatar_url, game_id, coins, wins, losses)
    VALUES (uname, names[i], avatar, gid, coins_val, wins_val, losses_val)
    ON CONFLICT (username) DO NOTHING;
  END LOOP;
END $$;

-- 3) Update get_online_users to return REAL online users + ALL fake users
DROP FUNCTION IF EXISTS public.get_online_users(integer);
CREATE OR REPLACE FUNCTION public.get_online_users(_limit integer DEFAULT 50)
RETURNS TABLE(
  id uuid,
  username text,
  display_name text,
  game_id text,
  coins integer,
  wins integer,
  last_seen_at timestamptz,
  avatar_url text,
  is_fake boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  (
    SELECT id, username, display_name, game_id, coins, wins, last_seen_at, avatar_url, false AS is_fake
    FROM public.profiles
    WHERE last_seen_at IS NOT NULL AND last_seen_at > now() - interval '5 minutes'
  )
  UNION ALL
  (
    SELECT id, username, display_name, game_id, coins, wins, now() AS last_seen_at, avatar_url, true AS is_fake
    FROM public.fake_users
  )
  ORDER BY is_fake ASC, last_seen_at DESC
  LIMIT _limit;
$$;

-- 4) Start a match against a fake user. Internally it's a hard bot match,
-- but we store the fake_user_id in matches.state so the UI can show its name + avatar.
CREATE OR REPLACE FUNCTION public.start_match_with_fake_user(
  _fake_user_id uuid,
  _game game_type,
  _bet integer DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  fake record;
  bal int;
  new_match_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _bet < 0 THEN RAISE EXCEPTION 'Invalid bet'; END IF;

  SELECT * INTO fake FROM public.fake_users WHERE id = _fake_user_id;
  IF fake.id IS NULL THEN RAISE EXCEPTION 'Fake user not found'; END IF;

  IF _bet > 0 THEN
    SELECT coins INTO bal FROM public.profiles WHERE id = uid;
    IF bal IS NULL OR bal < _bet THEN RAISE EXCEPTION 'Not enough coins for this bet'; END IF;
    UPDATE public.profiles SET coins = coins - _bet WHERE id = uid;
  END IF;

  INSERT INTO public.matches (host_id, mode, status, game_type, bet_amount, state)
  VALUES (
    uid, 'bot', 'active', _game, _bet,
    jsonb_build_object(
      'fake_opponent', jsonb_build_object(
        'id', fake.id,
        'username', fake.username,
        'display_name', fake.display_name,
        'avatar_url', fake.avatar_url,
        'game_id', fake.game_id,
        'coins', fake.coins,
        'wins', fake.wins,
        'difficulty', 'hard'
      )
    )
  )
  RETURNING id INTO new_match_id;

  -- Seat: human red(0), bot blue(1) — bot uses fake user's display_name
  INSERT INTO public.match_players (match_id, user_id, is_bot, bot_name, color, team, ready) VALUES
    (new_match_id, uid,  false, NULL,                'red',  0, true),
    (new_match_id, NULL, true,  fake.display_name,   'blue', 1, true);

  RETURN new_match_id;
END;
$$;

-- 5) When a match against a fake user finishes, update the fake user's stats too
CREATE OR REPLACE FUNCTION public.bump_fake_user_stats(_match_id uuid, _human_won boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  fake_id uuid;
BEGIN
  SELECT (state->'fake_opponent'->>'id')::uuid INTO fake_id
  FROM public.matches WHERE id = _match_id;
  IF fake_id IS NULL THEN RETURN; END IF;
  IF _human_won THEN
    UPDATE public.fake_users SET losses = losses + 1 WHERE id = fake_id;
  ELSE
    UPDATE public.fake_users SET wins = wins + 1 WHERE id = fake_id;
  END IF;
END;
$$;