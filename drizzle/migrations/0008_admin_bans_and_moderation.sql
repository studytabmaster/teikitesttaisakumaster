-- 利用停止（BAN）テーブル
CREATE TABLE IF NOT EXISTS public.user_bans (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT '',
  until TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_bans TO authenticated;
GRANT ALL ON public.user_bans TO service_role;

ALTER TABLE public.user_bans ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_bans_select_own_or_admin ON public.user_bans
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE OR REPLACE FUNCTION public.is_banned(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_bans
    WHERE user_id = _user_id AND (until IS NULL OR until > now())
  )
$$;

CREATE OR REPLACE FUNCTION public.reject_banned_sender()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.is_banned(NEW.sender_id) THEN
    RAISE EXCEPTION 'このアカウントは利用停止中です';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_ban_guard ON public.messages;
CREATE TRIGGER messages_ban_guard BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.reject_banned_sender();

DROP TRIGGER IF EXISTS group_messages_ban_guard ON public.group_messages;
CREATE TRIGGER group_messages_ban_guard BEFORE INSERT ON public.group_messages
  FOR EACH ROW EXECUTE FUNCTION public.reject_banned_sender();

-- 管理者はメッセージを削除できる
CREATE POLICY messages_delete_admin ON public.messages
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY group_messages_delete_admin ON public.group_messages
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 管理者は全ユーザーの権限を確認できる（一覧表示用）
CREATE POLICY user_roles_select_admin_all ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
