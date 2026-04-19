
-- Attach the existing handle_new_user function to auth.users so signups create a profile row
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill any existing auth users that are missing a profile (covers anyone who signed up before this fix)
INSERT INTO public.profiles (id, username, display_name)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'username', split_part(u.email, '@', 1), 'player_' || substr(u.id::text, 1, 8)) AS uname,
  COALESCE(u.raw_user_meta_data->>'username', split_part(u.email, '@', 1), 'player_' || substr(u.id::text, 1, 8))
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;
