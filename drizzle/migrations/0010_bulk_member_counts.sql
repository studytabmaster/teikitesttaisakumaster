CREATE OR REPLACE FUNCTION public.open_group_member_counts(_group_ids uuid[])
RETURNS TABLE(group_id uuid, member_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT g.id, (SELECT count(*)::int FROM public.group_members m WHERE m.group_id = g.id)
  FROM public.groups g
  WHERE g.id = ANY(_group_ids)
    AND (g.is_open OR public.is_group_member(g.id, auth.uid()))
$$;
REVOKE ALL ON FUNCTION public.open_group_member_counts(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_group_member_counts(uuid[]) TO authenticated;