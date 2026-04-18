
-- Recreate the trigger that creates profile rows on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Backfill profiles for any existing auth users that don't have one
INSERT INTO public.profiles (id, username, display_name)
SELECT u.id,
       COALESCE(u.raw_user_meta_data->>'username', split_part(u.email,'@',1)) || '_' || substr(u.id::text,1,4),
       COALESCE(u.raw_user_meta_data->>'username', split_part(u.email,'@',1))
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;
