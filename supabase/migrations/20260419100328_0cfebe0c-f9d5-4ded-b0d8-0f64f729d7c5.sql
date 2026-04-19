-- Recreate trigger to auto-create profile on signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill profiles for any existing users without one
INSERT INTO public.profiles (id, username, display_name)
SELECT u.id,
       COALESCE(u.raw_user_meta_data->>'username', split_part(u.email,'@',1)) || substr(u.id::text,1,4),
       COALESCE(u.raw_user_meta_data->>'username', split_part(u.email,'@',1))
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- Trigger for friend accept (also missing likely)
CREATE OR REPLACE TRIGGER on_friend_request_accept
  AFTER UPDATE ON public.friend_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_friend_accept();

-- updated_at trigger on matches
CREATE OR REPLACE TRIGGER set_matches_updated_at
  BEFORE UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();