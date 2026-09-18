-- オープンチャット: 誰でも探して参加申請できる公開ルーム
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_groups_open ON public.groups (is_open, created_at DESC) WHERE is_open;

-- 公開ルームは参加していなくても一覧・検索できる
DROP POLICY IF EXISTS groups_select_open ON public.groups;
CREATE POLICY groups_select_open ON public.groups
  FOR SELECT TO authenticated
  USING (is_open);

CREATE TABLE IF NOT EXISTS public.group_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_join_requests TO authenticated;
GRANT ALL ON public.group_join_requests TO service_role;

ALTER TABLE public.group_join_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gjr_select_own_or_owner ON public.group_join_requests;
CREATE POLICY gjr_select_own_or_owner ON public.group_join_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_group_owner(group_id, auth.uid()));

DROP POLICY IF EXISTS gjr_insert_own ON public.group_join_requests;
CREATE POLICY gjr_insert_own ON public.group_join_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.is_open)
  );

DROP POLICY IF EXISTS gjr_update_owner ON public.group_join_requests;
CREATE POLICY gjr_update_owner ON public.group_join_requests
  FOR UPDATE TO authenticated
  USING (public.is_group_owner(group_id, auth.uid()))
  WITH CHECK (public.is_group_owner(group_id, auth.uid()));

DROP POLICY IF EXISTS gjr_delete_own_or_owner ON public.group_join_requests;
CREATE POLICY gjr_delete_own_or_owner ON public.group_join_requests
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_group_owner(group_id, auth.uid()));

DROP TRIGGER IF EXISTS gjr_updated_at ON public.group_join_requests;
CREATE TRIGGER gjr_updated_at BEFORE UPDATE ON public.group_join_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 参加申請の承認（作成者のみ）: 承認したらメンバーに追加
CREATE OR REPLACE FUNCTION public.approve_join_request(_request_id uuid, _approve boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  req public.group_join_requests;
BEGIN
  SELECT * INTO req FROM public.group_join_requests WHERE id = _request_id;
  IF req.id IS NULL THEN RAISE EXCEPTION '申請が見つかりません'; END IF;
  IF NOT public.is_group_owner(req.group_id, auth.uid()) THEN
    RAISE EXCEPTION '作成者のみ操作できます';
  END IF;
  IF _approve THEN
    INSERT INTO public.group_members (group_id, user_id)
    VALUES (req.group_id, req.user_id)
    ON CONFLICT DO NOTHING;
    UPDATE public.group_join_requests SET status = 'approved' WHERE id = req.id;
  ELSE
    UPDATE public.group_join_requests SET status = 'rejected' WHERE id = req.id;
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public.approve_join_request(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_join_request(uuid, boolean) TO authenticated;

-- 承認不要の公開ルームは自分で参加できる
CREATE OR REPLACE FUNCTION public.join_open_group(_group_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  g public.groups;
  me UUID := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'ログインが必要です'; END IF;
  SELECT * INTO g FROM public.groups WHERE id = _group_id;
  IF g.id IS NULL OR NOT g.is_open THEN RAISE EXCEPTION 'このルームには参加できません'; END IF;
  IF g.requires_approval THEN RAISE EXCEPTION 'このルームは参加申請が必要です'; END IF;
  INSERT INTO public.group_members (group_id, user_id) VALUES (_group_id, me)
  ON CONFLICT DO NOTHING;
END; $$;

REVOKE ALL ON FUNCTION public.join_open_group(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_open_group(uuid) TO authenticated;

-- 公開ルームの参加人数（メンバー行を直接読めない相手にも件数だけ返す）
CREATE OR REPLACE FUNCTION public.open_group_member_count(_group_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*)::int FROM public.group_members m
   JOIN public.groups g ON g.id = m.group_id
   WHERE m.group_id = _group_id AND g.is_open
$$;

REVOKE ALL ON FUNCTION public.open_group_member_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_group_member_count(uuid) TO authenticated;