import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Ban, KeyRound, RefreshCw, Search, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatListTime, initials, type Profile } from "@/lib/rine";
import {
  adminDeleteUserMessages,
  adminListUsers,
  adminSetBan,
  adminSetRole,
  adminStats,
  unlockAdmin,
  type AdminUser,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "管理者パネル｜RINE" },
      {
        name: "description",
        content:
          "RINE の管理者パネル。通報の確認、ユーザーの検索、利用停止、権限の管理をまとめて行えます。",
      },
      { property: "og:title", content: "管理者パネル｜RINE" },
      { property: "og:description", content: "通報対応・利用停止・権限管理。" },
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

function errorMessage(e: unknown) {
  return e instanceof Error && e.message ? e.message : "うまくいきませんでした";
}

function AdminPage() {
  const { user } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const [reports, setReports] = useState<Report[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [stats, setStats] = useState<Awaited<ReturnType<typeof adminStats>> | null>(null);

  const unlock = useServerFn(unlockAdmin);
  const listUsers = useServerFn(adminListUsers);
  const setRole = useServerFn(adminSetRole);
  const setBan = useServerFn(adminSetBan);
  const wipeMessages = useServerFn(adminDeleteUserMessages);
  const loadStats = useServerFn(adminStats);

  const loadReports = useCallback(async () => {
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
  }, []);

  const loadUsers = useCallback(
    async (q: string) => {
      try {
        setUsers(await listUsers({ data: { q } }));
      } catch (e) {
        toast.error(errorMessage(e));
      }
    },
    [listUsers],
  );

  const loadAll = useCallback(async () => {
    await Promise.all([
      loadReports(),
      loadUsers(""),
      loadStats({}).then(setStats).catch(() => {}),
    ]);
  }, [loadReports, loadUsers, loadStats]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      const isAdmin = (roles ?? []).some((r) => r.role === "admin" || r.role === "moderator");
      setAllowed(isAdmin);
      if (isAdmin) await loadAll();
    })();
  }, [user, loadAll]);

  const submitPassword = async () => {
    setBusy(true);
    try {
      await unlock({ data: { password } });
      setPassword("");
      setAllowed(true);
      await loadAll();
      toast.success("管理者パネルを開きました");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("reports").update({ status }).eq("id", id);
    if (error) {
      toast.error("更新できませんでした");
      return;
    }
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    toast.success("ステータスを更新しました");
  };

  const toggleBan = async (u: AdminUser) => {
    if (u.banned) {
      if (!confirm(`${u.display_name} さんの利用停止を解除しますか？`)) return;
      try {
        await setBan({ data: { userId: u.id, banned: false } });
        toast.success("停止を解除しました");
        await loadUsers(query);
      } catch (e) {
        toast.error(errorMessage(e));
      }
      return;
    }
    const reason = prompt("停止の理由を入力してください", "利用規約違反");
    if (reason === null) return;
    const daysText = prompt("停止する日数（空欄なら無期限）", "3");
    if (daysText === null) return;
    const days = Number(daysText);
    try {
      await setBan({
        data: { userId: u.id, banned: true, reason, days: Number.isFinite(days) ? days : 0 },
      });
      toast.success("利用を停止しました");
      await loadUsers(query);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const changeRole = async (u: AdminUser, role: "admin" | "moderator" | null) => {
    try {
      await setRole({ data: { userId: u.id, role } });
      toast.success("権限を変更しました");
      await loadUsers(query);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const deleteMessages = async (u: AdminUser) => {
    if (!confirm(`${u.display_name} さんの投稿をすべて削除しますか？（元に戻せません）`)) return;
    try {
      await wipeMessages({ data: { userId: u.id } });
      toast.success("投稿を削除しました");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  if (allowed === null) {
    return (
      <AppShell title="管理者パネル">
        <p className="px-6 py-16 text-center text-sm text-muted-foreground">読み込み中…</p>
      </AppShell>
    );
  }

  if (!allowed) {
    return (
      <AppShell title="管理者パネル">
        <div className="mx-auto mt-16 max-w-sm space-y-4 px-6 text-center">
          <KeyRound className="mx-auto size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            管理者パスワードを入力すると、このアカウントで管理者パネルを開けます。
          </p>
          <div className="space-y-2 text-left">
            <Label htmlFor="admin-password">管理者パスワード</Label>
            <Input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitPassword();
              }}
              placeholder="••••••••"
            />
          </div>
          <Button
            variant="brand"
            size="pill"
            className="w-full"
            disabled={busy || password.length === 0}
            onClick={() => void submitPassword()}
          >
            管理者として開く
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="管理者パネル"
      action={
        <Button variant="ghost" size="sm" onClick={() => void loadAll()}>
          <RefreshCw className="size-4" />
        </Button>
      }
    >
      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="mx-5 mt-4 grid w-[calc(100%-2.5rem)] grid-cols-3">
          <TabsTrigger value="dashboard">概要</TabsTrigger>
          <TabsTrigger value="reports">通報</TabsTrigger>
          <TabsTrigger value="users">ユーザー</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="px-5 py-4">
          {!stats ? (
            <p className="py-10 text-center text-sm text-muted-foreground">読み込み中…</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "ユーザー数", value: stats.users },
                { label: "グループ数", value: stats.groups },
                { label: "総メッセージ", value: stats.messages },
                { label: "24時間の投稿", value: stats.todayMessages },
                { label: "未対応の通報", value: stats.openReports },
                { label: "利用停止中", value: stats.bans },
              ].map((c) => (
                <div
                  key={c.label}
                  className="rounded-2xl border border-border bg-card p-4 shadow-soft"
                >
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                  <p className="mt-1 text-2xl font-bold">{c.value.toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="reports">
          {reports.length === 0 ? (
            <p className="px-6 py-16 text-center text-sm text-muted-foreground">
              通報はありません。
            </p>
          ) : (
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
                    <div className="flex flex-wrap gap-2">
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
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          const target =
                            users.find((u) => u.id === r.reported_id) ??
                            ({
                              id: r.reported_id,
                              display_name: reported?.display_name ?? "このユーザー",
                              banned: false,
                            } as AdminUser);
                          void toggleBan(target);
                        }}
                      >
                        <Ban className="mr-1 size-4" />
                        利用停止
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="users" className="space-y-3 px-5 py-4">
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void loadUsers(query);
              }}
              placeholder="名前・ユーザー名・フレンドIDで検索"
            />
            <Button variant="outline" onClick={() => void loadUsers(query)}>
              <Search className="size-4" />
            </Button>
          </div>

          {users.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              ユーザーが見つかりません。
            </p>
          )}

          <ul className="divide-y divide-border">
            {users.map((u) => (
              <li key={u.id} className="space-y-2 py-3">
                <div className="flex items-center gap-3">
                  <Avatar className="size-10">
                    <AvatarImage src={u.avatar_url ?? undefined} alt={u.display_name} />
                    <AvatarFallback>{initials(u.display_name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {u.display_name}
                      {u.role && (
                        <Badge variant="secondary" className="ml-2">
                          {u.role === "admin" ? "管理者" : "モデレーター"}
                        </Badge>
                      )}
                      {u.banned && (
                        <Badge variant="destructive" className="ml-2">
                          停止中
                        </Badge>
                      )}
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      ID:{u.friend_code}・登録 {formatListTime(u.created_at)}
                    </p>
                    {u.banned && u.ban_reason && (
                      <p className="text-xs text-destructive">
                        理由: {u.ban_reason}
                        {u.ban_until ? `（${formatListTime(u.ban_until)}まで）` : "（無期限）"}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant={u.banned ? "outline" : "destructive"} onClick={() => void toggleBan(u)}>
                    <Ban className="mr-1 size-4" />
                    {u.banned ? "停止を解除" : "利用停止"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void changeRole(u, u.role === "admin" ? null : "admin")}
                  >
                    <ShieldCheck className="mr-1 size-4" />
                    {u.role === "admin" ? "管理者を外す" : "管理者にする"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void changeRole(u, u.role === "moderator" ? null : "moderator")}
                  >
                    {u.role === "moderator" ? "モデレーターを外す" : "モデレーターにする"}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void deleteMessages(u)}>
                    <Trash2 className="mr-1 size-4" />
                    投稿を全削除
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
