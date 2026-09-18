import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatListTime, type Profile } from "@/lib/rine";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "管理者パネル｜RINE" },
      {
        name: "description",
        content: "RINE の管理者パネル。ユーザーからの通報内容を確認し、対応状況を管理します。",
      },
      { property: "og:title", content: "管理者パネル｜RINE" },
      { property: "og:description", content: "通報の確認と対応ステータス管理。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

type Report = {
  id: string;
  reporter_id: string;
  reported_id: string;
  reason: string;
  detail: string;
  reported_code: string | null;
  context: string;
  group_id: string | null;
  status: string;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  open: "未対応",
  reviewing: "確認中",
  resolved: "対応済み",
};

function AdminPage() {
  const { user } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});

  const load = useCallback(async () => {
    if (!user) return;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin" || r.role === "moderator");
    setAllowed(isAdmin);
    if (!isAdmin) return;

    const { data } = await supabase
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as Report[];
    setReports(rows);

    const ids = [...new Set(rows.flatMap((r) => [r.reporter_id, r.reported_id]))];
    if (ids.length > 0) {
      const { data: ps } = await supabase.from("profiles").select("*").in("id", ids);
      const map: Record<string, Profile> = {};
      for (const p of (ps ?? []) as Profile[]) map[p.id] = p;
      setProfiles(map);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("reports").update({ status }).eq("id", id);
    if (error) {
      toast.error("更新できませんでした");
      return;
    }
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    toast.success("ステータスを更新しました");
  };

  return (
    <AppShell title="管理者パネル">
      {allowed === null && (
        <p className="px-6 py-16 text-center text-sm text-muted-foreground">読み込み中…</p>
      )}

      {allowed === false && (
        <div className="px-6 py-16 text-center text-sm text-muted-foreground">
          <ShieldAlert className="mx-auto mb-3 size-10 opacity-40" />
          このページは管理者専用です。
        </div>
      )}

      {allowed && reports.length === 0 && (
        <p className="px-6 py-16 text-center text-sm text-muted-foreground">通報はありません。</p>
      )}

      {allowed && reports.length > 0 && (
        <ul className="divide-y divide-border">
          {reports.map((r) => {
            const reported = profiles[r.reported_id];
            const reporter = profiles[r.reporter_id];
            return (
              <li key={r.id} className="space-y-2 px-5 py-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {reported?.display_name ?? "不明なユーザー"}
                      <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                        ID:{r.reported_code ?? reported?.friend_code ?? "????"}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      通報者: {reporter?.display_name ?? "不明"}・
                      {r.context === "group" ? "グループ内" : "個別トーク"}・
                      {formatListTime(r.created_at)}
                    </p>
                  </div>
                  <Badge variant={r.status === "resolved" ? "secondary" : "destructive"}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </Badge>
                </div>
                <p className="text-sm">
                  <span className="font-medium">{r.reason}</span>
                  {r.detail && <span className="block text-muted-foreground">{r.detail}</span>}
                </p>
                <div className="flex gap-2">
                  {["open", "reviewing", "resolved"].map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={r.status === s ? "default" : "outline"}
                      onClick={() => void setStatus(r.id, s)}
                    >
                      {STATUS_LABEL[s]}
                    </Button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
