import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/** 自分がブロックしている相手のIDセットを購読するフック */
export function useBlocks() {
  const { user } = useAuth();
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("blocks").select("blocked_id").eq("blocker_id", user.id);
    setBlockedIds((data ?? []).map((b) => b.blocked_id as string));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void load();
    const channel = supabase
      .channel(`blocks-sync-${user.id}-${crypto.randomUUID()}`)
      // 自分のブロック行だけを購読（全ユーザー分を受け取らない）
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "blocks", filter: `blocker_id=eq.${user.id}` },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, load]);

  const block = useCallback(
    async (targetId: string) => {
      if (!user) return false;
      const { error } = await supabase
        .from("blocks")
        .insert({ blocker_id: user.id, blocked_id: targetId });
      if (!error) setBlockedIds((prev) => (prev.includes(targetId) ? prev : [...prev, targetId]));
      return !error;
    },
    [user],
  );

  const unblock = useCallback(
    async (targetId: string) => {
      if (!user) return false;
      const { error } = await supabase
        .from("blocks")
        .delete()
        .eq("blocker_id", user.id)
        .eq("blocked_id", targetId);
      if (!error) setBlockedIds((prev) => prev.filter((id) => id !== targetId));
      return !error;
    },
    [user],
  );

  return {
    blockedIds,
    loading,
    isBlocked: (id: string) => blockedIds.includes(id),
    block,
    unblock,
    reload: load,
  };
}
