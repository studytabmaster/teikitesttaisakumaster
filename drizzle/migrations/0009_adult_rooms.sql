ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS is_adult boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS adult_verified_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birth_date date;

CREATE OR REPLACE FUNCTION public.is_adult_user(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND adult_verified_at IS NOT NULL
    AND birth_date IS NOT NULL AND birth_date <= (current_date - interval '18 years'))
$$;

CREATE OR REPLACE FUNCTION public.confirm_adult(_birth_date date)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'ログインが必要です'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = me AND birth_date IS NOT NULL AND birth_date <> _birth_date) THEN
    RAISE EXCEPTION '生年月日は一度登録すると変更できません';
  END IF;
  IF _birth_date > (current_date - interval '18 years') THEN
    UPDATE public.profiles SET birth_date = _birth_date WHERE id = me;
    RAISE EXCEPTION '18歳未満の方は利用できません';
  END IF;
  UPDATE public.profiles SET birth_date = _birth_date, adult_verified_at = now() WHERE id = me;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.confirm_adult(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_adult(date) TO authenticated;

-- prevent clients from editing age fields directly
CREATE OR REPLACE FUNCTION public.protect_age_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('authenticated','anon') THEN
    NEW.birth_date := OLD.birth_date;
    NEW.adult_verified_at := OLD.adult_verified_at;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_protect_age_fields ON public.profiles;
CREATE TRIGGER trg_protect_age_fields BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_age_fields();

CREATE OR REPLACE FUNCTION public.enforce_adult_room()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid; adult boolean;
BEGIN
  IF TG_TABLE_NAME = 'groups' THEN
    uid := NEW.owner_id; adult := NEW.is_adult;
  ELSE
    uid := NEW.user_id;
    SELECT is_adult INTO adult FROM public.groups WHERE id = NEW.group_id;
  END IF;
  IF coalesce(adult,false) AND NOT public.is_adult_user(uid) THEN
    RAISE EXCEPTION '18歳以上の年齢確認が必要です';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_adult_groups ON public.groups;
CREATE TRIGGER trg_adult_groups BEFORE INSERT OR UPDATE OF is_adult ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.enforce_adult_room();
DROP TRIGGER IF EXISTS trg_adult_members ON public.group_members;
CREATE TRIGGER trg_adult_members BEFORE INSERT ON public.group_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_adult_room();
DROP TRIGGER IF EXISTS trg_adult_requests ON public.group_join_requests;
CREATE TRIGGER trg_adult_requests BEFORE INSERT ON public.group_join_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_adult_room();

DROP POLICY IF EXISTS groups_select_open ON public.groups;
CREATE POLICY groups_select_open ON public.groups FOR SELECT TO authenticated
  USING (is_open AND (NOT is_adult OR public.is_adult_user(auth.uid())));