
-- Function to create a profile + daily_rewards row whenever a new auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _username TEXT;
  _display TEXT;
BEGIN
  _username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    split_part(NEW.email, '@', 1),
    'player_' || substr(NEW.id::text, 1, 8)
  );
  _display := COALESCE(NEW.raw_user_meta_data->>'display_name', _username);

  INSERT INTO public.profiles (id, username, display_name, coins, wins, losses)
  VALUES (NEW.id, _username, _display, 1000, 0, 0)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.daily_rewards (user_id, streak)
  VALUES (NEW.id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Trigger on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Backfill: create profiles for any existing auth users that don't have one
INSERT INTO public.profiles (id, username, display_name, coins, wins, losses)
SELECT
  u.id,
  COALESCE(
    u.raw_user_meta_data->>'username',
    split_part(u.email, '@', 1),
    'player_' || substr(u.id::text, 1, 8)
  ) AS username,
  COALESCE(
    u.raw_user_meta_data->>'display_name',
    u.raw_user_meta_data->>'username',
    split_part(u.email, '@', 1)
  ) AS display_name,
  1000, 0, 0
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- Same backfill for daily_rewards
INSERT INTO public.daily_rewards (user_id, streak)
SELECT u.id, 0
FROM auth.users u
LEFT JOIN public.daily_rewards d ON d.user_id = u.id
WHERE d.user_id IS NULL;
