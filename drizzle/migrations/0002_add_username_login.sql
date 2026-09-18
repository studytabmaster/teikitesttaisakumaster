ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_idx ON public.profiles (lower(username)) WHERE username IS NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uname TEXT := NULLIF(trim(NEW.raw_user_meta_data->>'username'), '');
BEGIN
  INSERT INTO public.profiles (id, display_name, username, friend_code)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', uname, split_part(NEW.email, '@', 1), 'ユーザー'),
    uname,
    public.generate_friend_code()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.add_friend_by_code(_code text)
RETURNS profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  target public.profiles;
  me UUID := auth.uid();
  needle TEXT := trim(_code);
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'ログインが必要です'; END IF;
  SELECT * INTO target FROM public.profiles
   WHERE upper(friend_code) = upper(needle)
      OR lower(username) = lower(needle)
   LIMIT 1;
  IF target.id IS NULL THEN RAISE EXCEPTION 'このIDのユーザーは見つかりません'; END IF;
  IF target.id = me THEN RAISE EXCEPTION '自分自身は追加できません'; END IF;
  INSERT INTO public.friendships (user_id, friend_id) VALUES (me, target.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.friendships (user_id, friend_id) VALUES (target.id, me) ON CONFLICT DO NOTHING;
  RETURN target;
END; $function$;