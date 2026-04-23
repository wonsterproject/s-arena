
-- Re-attach the missing trigger that creates a profile row whenever a new auth user signs up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill: create profile rows for any existing auth users that are missing one
INSERT INTO public.profiles (id, username, display_name, coins, wins, losses, game_id, referral_code)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'username', split_part(u.email, '@', 1), 'player_' || substr(u.id::text, 1, 8)),
  COALESCE(u.raw_user_meta_data->>'display_name', u.raw_user_meta_data->>'username', split_part(u.email, '@', 1), 'Player'),
  50,
  0,
  0,
  public.generate_unique_game_id(),
  public.generate_unique_referral_code()
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- Make sure every backfilled user also gets a daily_rewards row
INSERT INTO public.daily_rewards (user_id, streak)
SELECT u.id, 0
FROM auth.users u
LEFT JOIN public.daily_rewards d ON d.user_id = u.id
WHERE d.user_id IS NULL;
