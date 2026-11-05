import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { adminListStaff, adminSetRole, type StaffMember } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// 管理者・モデレーターの一覧（管理者のみ）
export function StaffList() {
  const list = useServerFn(adminListStaff);
  const setRole = useServerFn(adminSetRole);
  const [items, setItems] = useState<StaffMember[]>([]);

  const load = useCallback(async () => {
    try {
      setItems(await list());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "読み込めませんでした");
    }
  }, [list]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (m: StaffMember) => {
    if (!confirm(`${m.display_name} さんの役職を外しますか？`)) return;
    try {
      await setRole({ data: { userId: m.user_id, role: null } });
      toast.success("役職を外しました");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "外せませんでした");
    }
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">スタッフ一覧（{items.length}人）</h3>
      {items.length === 0 && <p className="text-xs text-muted-foreground">まだいません</p>}
      {items.map((m) => (
        <div key={m.user_id} className="flex items-center justify-between gap-2 rounded-xl border bg-card p-3 text-xs">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Badge variant={m.role === "admin" ? "default" : "outline"}>
                {m.role === "admin" ? "管理者" : "モデレーター"}
              </Badge>
              <span className="truncate font-semibold">{m.display_name}</span>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              ID {m.friend_code} ・ {new Date(m.since).toLocaleDateString("ja-JP")}から
            </p>
          </div>
          <Button size="sm" variant="ghost" className="h-7 text-[11px] text-destructive" onClick={() => void remove(m)}>
            役職を外す
          </Button>
        </div>
      ))}
    </div>
  );
}
