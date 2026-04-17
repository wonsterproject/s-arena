-- 1. Roles enum + table
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 2. Security definer role-check function (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 3. RLS for user_roles
CREATE POLICY "ur_select_self_or_admin" ON public.user_roles
FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "ur_admin_insert" ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "ur_admin_update" ON public.user_roles
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "ur_admin_delete" ON public.user_roles
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 4. Extend profiles RLS so admins can read/update all
CREATE POLICY "profiles_admin_update_all" ON public.profiles
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 5. Extend user_inventory so admins can view/grant
CREATE POLICY "inv_admin_select_all" ON public.user_inventory
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "inv_admin_insert_all" ON public.user_inventory
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "inv_admin_update_all" ON public.user_inventory
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 6. Admin edit profile RPC
CREATE OR REPLACE FUNCTION public.admin_update_profile(
  _user_id uuid,
  _coins integer DEFAULT NULL,
  _wins integer DEFAULT NULL,
  _losses integer DEFAULT NULL,
  _display_name text DEFAULT NULL,
  _username text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  UPDATE public.profiles SET
    coins = COALESCE(_coins, coins),
    wins = COALESCE(_wins, wins),
    losses = COALESCE(_losses, losses),
    display_name = COALESCE(_display_name, display_name),
    username = COALESCE(_username, username),
    updated_at = now()
  WHERE id = _user_id;
END;
$$;

-- 7. Admin grant item RPC
CREATE OR REPLACE FUNCTION public.admin_grant_item(_user_id uuid, _item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  INSERT INTO public.user_inventory (user_id, item_id)
  VALUES (_user_id, _item_id)
  ON CONFLICT DO NOTHING;
END;
$$;

-- 8. Admin set role RPC
CREATE OR REPLACE FUNCTION public.admin_set_role(_user_id uuid, _role public.app_role, _grant boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF _grant THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = _user_id AND role = _role;
  END IF;
END;
$$;