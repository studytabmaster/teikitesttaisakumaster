import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Ban,
  EyeOff,
  KeyRound,
  Megaphone,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatListTime, initials, type Profile } from "@/lib/rine";
import {
  adminBroadcastToOpenGroups,
  adminClearGroupMessages,
  adminDeleteGroup,
  adminDeleteMessage,
  adminDeleteUserMessages,
  adminListGroups,
  adminListUsers,
  adminSearchMessages,
  adminSetBan,
  adminSetGroupOpen,
  adminSetRole,
  adminStats,
  unlockAdmin,
  type AdminGroup,
  type AdminMessage,
  type AdminUser,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "管理者パネル｜RINE" },
      {
        name: "description",
        content:
          "RINE の管理者パネル。通報対応・ユーザー管理・荒らし投稿削除・ルーム管理・一斉アナウンスをまとめて行えます。",
      },
      { property: "og:title", content: "管理者パネル｜RINE" },
      { property: "og:description", content: "通報対応・利用停止・投稿削除・アナウンス配信。" },
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
  const [reportFilter, setReportFilter] = useState<"all" | "open" | "reviewing" | "resolved">("all");
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [userFilter, setUserFilter] = useState<"all" | "banned" | "admin">("all");

  const [stats, setStats] = useState<Awaited<ReturnType<typeof adminStats>> | null>(null);

  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [groupQuery, setGroupQuery] = useState("");
  const [openOnly, setOpenOnly] = useState(true);

  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [msgQuery, setMsgQuery] = useState("");
  const [msgLoading, setMsgLoading] = useState(false);

  const [announcement, setAnnouncement] = useState("");
  const [sendingAnnounce, setSendingAnnounce] = useState(false);

  const unlock = useServerFn(unlockAdmin);
  const listUsers = useServerFn(adminListUsers);
  const setRole = useServerFn(adminSetRole);
  const setBan = useServerFn(adminSetBan);
  const wipeMessages = useServerFn(adminDeleteUserMessages);
  const loadStats = useServerFn(adminStats);
  const listGroups = useServerFn(adminListGroups);
  const removeGroup = useServerFn(adminDeleteGroup);
  const setGroupOpen = useServerFn(adminSetGroupOpen);
  const clearGroupMessages = useServerFn(adminClearGroupMessages);
  const searchMessages = useServerFn(adminSearchMessages);
  const removeMessage = useServerFn(adminDeleteMessage);
  const broadcastAnnouncement = useServerFn(adminBroadcastToOpenGroups);

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

  const loadGroups = useCallback(
    async (q: string, onlyOpen: boolean) => {
      try {
        setGroups(await listGroups({ data: { q, openOnly: onlyOpen } }));
      } catch (e) {
        toast.error(errorMessage(e));
      }
    },
    [listGroups],
  );

  const loadMessages = useCallback(
    async (q: string) => {
      setMsgLoading(true);
      try {
        const res = await searchMessages({ data: { q } });
        setMessages(res);
      } catch (e) {
        toast.error(errorMessage(e));
      } finally {
        setMsgLoading(false);
      }
    },
    [searchMessages],
  );

  const loadAll = useCallback(async () => {
    await Promise.all([
      loadReports(),
      loadUsers(""),
      loadGroups("", true),
      loadMessages(""),
      loadStats({}).then(setStats).catch(() => {}),
    ]);
  }, [loadReports, loadUsers, loadGroups, loadMessages, loadStats]);

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
    const reason = prompt("停止の理由を入力してください", "利用規約違反・迷惑行為");
    if (reason === null) return;
    const daysText = prompt("停止する日数（空欄または0で無期限停止）", "7");
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

  const deleteGroup = async (g: AdminGroup) => {
    if (!confirm(`ルーム「${g.name}」を完全に削除しますか？\n投稿やメンバーも消去されます（元に戻せません）`)) return;
    try {
      await removeGroup({ data: { groupId: g.id } });
      toast.success("ルームを削除しました");
      await loadGroups(groupQuery, openOnly);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const hideGroup = async (g: AdminGroup) => {
    try {
      await setGroupOpen({ data: { groupId: g.id, isOpen: !g.is_open } });
      toast.success(g.is_open ? "非公開にしました" : "公開しました");
      await loadGroups(groupQuery, openOnly);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const clearGroup = async (g: AdminGroup) => {
    if (!confirm(`ルーム「${g.name}」の投稿をすべて削除しますか？`)) return;
    try {
      await clearGroupMessages({ data: { groupId: g.id } });
      toast.success("投稿を削除しました");
      await loadGroups(groupQuery, openOnly);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const deleteSingleMessage = async (msg: AdminMessage) => {
    if (!confirm(`この投稿を削除しますか？\n「${msg.content.slice(0, 30)}...」`)) return;
    try {
      await removeMessage({ data: { kind: msg.kind, id: msg.id } });
      toast.success("投稿を削除しました");
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const deleteUserAllMessages = async (userId: string, displayName: string) => {
    if (!confirm(`${displayName} さんの投稿（個人トーク＋オプチャ）をすべて削除しますか？（元に戻せません）`)) return;
    try {
      await wipeMessages({ data: { userId } });
      toast.success("投稿を全削除しました");
      await loadMessages(msgQuery);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const handleSendAnnouncement = async () => {
    const text = announcement.trim();
    if (!text) return;
    if (!confirm(`全オープンチャットへ以下のアナウンスを一斉配信しますか？\n\n${text}`)) return;
    setSendingAnnounce(true);
    try {
      const res = await broadcastAnnouncement({ data: { content: text } });
      toast.success(`${res.count} 件のオープンチャットへアナウンスを配信しました`);
      setAnnouncement("");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSendingAnnounce(false);
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
              placeholder="管理者パスワード"
              onKeyDown={(e) => {
                if (e.key === "Enter" && password) void submitPassword();
              }}
            />
          </div>
          <Button
            className="w-full"
            onClick={() => void submitPassword()}
            disabled={busy || !password.trim()}
          >
            {busy ? "確認中…" : "ロック解除"}
          </Button>
        </div>
      </AppShell>
    );
  }

  const filteredReports = reports.filter((r) => {
    if (reportFilter === "all") return true;
    return r.status === reportFilter;
  });

  const filteredUsers = users.filter((u) => {
    if (userFilter === "banned") return u.banned;
    if (userFilter === "admin") return u.role === "admin" || u.role === "moderator";
    return true;
  });

  return (
    <AppShell
      title="管理者パネル"
      headerAction={
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs text-muted-foreground"
          onClick={() => void loadAll()}
        >
          <RefreshCw className="size-3.5" />
          更新
        </Button>
      }
    >
      <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-5 text-xs">
            <TabsTrigger value="overview">概要</TabsTrigger>
            <TabsTrigger value="reports" className="relative">
              通報
              {reports.filter((r) => r.status === "open").length > 0 && (
                <span className="ml-1 rounded-full bg-destructive px-1.5 py-0.2 text-[10px] text-destructive-foreground">
                  {reports.filter((r) => r.status === "open").length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="users">ユーザー</TabsTrigger>
            <TabsTrigger value="messages">投稿監視</TabsTrigger>
            <TabsTrigger value="groups">ルーム</TabsTrigger>
          </TabsList>

          {/* 1. 概要タブ */}
          <TabsContent value="overview" className="space-y-6 pt-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">総ユーザー数</p>
                <p className="mt-1 text-2xl font-bold">{stats?.users ?? 0}</p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">ルーム数 (公開/全体)</p>
                <p className="mt-1 text-2xl font-bold">
                  {stats?.openGroups ?? 0}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    / {stats?.groups ?? 0}
                  </span>
                </p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">本日送信メッセージ</p>
                <p className="mt-1 text-2xl font-bold">{stats?.todayMessages ?? 0}</p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">累計メッセージ</p>
                <p className="mt-1 text-2xl font-bold">{stats?.messages ?? 0}</p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">未対応の通報</p>
                <p className={`mt-1 text-2xl font-bold ${(stats?.openReports ?? 0) > 0 ? "text-destructive" : ""}`}>
                  {stats?.openReports ?? 0}
                </p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">利用停止中ユーザー</p>
                <p className="mt-1 text-2xl font-bold">{stats?.bans ?? 0}</p>
              </div>
            </div>

            {/* 一斉アナウンス */}
            <div className="rounded-xl border bg-card p-4 sm:p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Megaphone className="size-5 text-primary" />
                <h3 className="font-semibold text-sm">全オープンチャットへの一斉アナウンス配信</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                公開中のすべてのオープンチャットに「【📢 運営アナウンス】」として送信されます。
              </p>
              <Textarea
                placeholder="重要なお知らせやメンテナンス予告を入力..."
                rows={3}
                value={announcement}
                onChange={(e) => setAnnouncement(e.target.value)}
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() => void handleSendAnnouncement()}
                  disabled={sendingAnnounce || !announcement.trim()}
                  className="gap-1.5"
                >
                  <Megaphone className="size-3.5" />
                  {sendingAnnounce ? "配信中…" : "一斉配信する"}
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* 2. 通報タブ */}
          <TabsContent value="reports" className="space-y-4 pt-4">
            <div className="flex gap-1.5 border-b pb-2 text-xs">
              {(["all", "open", "reviewing", "resolved"] as const).map((st) => (
                <Button
                  key={st}
                  variant={reportFilter === st ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setReportFilter(st)}
                >
                  {st === "all" ? "すべて" : STATUS_LABEL[st]}
                  {st === "open" && reports.filter((r) => r.status === "open").length > 0 && (
                    <span className="ml-1 text-[10px]">({reports.filter((r) => r.status === "open").length})</span>
                  )}
                </Button>
              ))}
            </div>

            {filteredReports.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">該当する通報はありません</p>
            ) : (
              <div className="space-y-3">
                {filteredReports.map((r) => {
                  const reporter = profiles[r.reporter_id];
                  const reported = profiles[r.reported_id];
                  return (
                    <div key={r.id} className="rounded-xl border bg-card p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                r.status === "open"
                                  ? "destructive"
                                  : r.status === "reviewing"
                                  ? "secondary"
                                  : "outline"
                              }
                            >
                              {STATUS_LABEL[r.status] ?? r.status}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{formatListTime(r.created_at)}</span>
                          </div>
                          <p className="text-sm font-semibold">理由: {r.reason}</p>
                        </div>
                        <div className="flex gap-1">
                          {(["open", "reviewing", "resolved"] as const).map((st) => (
                            <Button
                              key={st}
                              variant={r.status === st ? "secondary" : "ghost"}
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => void setStatus(r.id, st)}
                            >
                              {STATUS_LABEL[st]}
                            </Button>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-lg bg-muted/50 p-2.5 text-xs space-y-1">
                        <p><span className="text-muted-foreground">通報者:</span> {reporter?.display_name ?? r.reporter_id}</p>
                        <p><span className="text-muted-foreground">対象者:</span> <span className="font-semibold">{reported?.display_name ?? r.reported_id}</span> ({reported?.friend_code ?? r.reported_code ?? "ID不明"})</p>
                        {r.detail && <p><span className="text-muted-foreground">詳細:</span> {r.detail}</p>}
                        {r.context && <p><span className="text-muted-foreground">通報時の文脈:</span> {r.context}</p>}
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1 border-t">
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => {
                            const u = users.find((x) => x.id === r.reported_id);
                            if (u) {
                              void toggleBan(u);
                            } else {
                              const days = prompt("停止する日数（空欄または0で無期限停止）", "7");
                              if (days === null) return;
                              void setBan({
                                data: {
                                  userId: r.reported_id,
                                  banned: true,
                                  reason: `通報対応 (${r.reason})`,
                                  days: Number(days) || 0,
                                },
                              }).then(() => toast.success("対象者を停止しました"));
                            }
                          }}
                        >
                          <Ban className="size-3" />
                          対象者を停止
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 text-destructive hover:bg-destructive/10"
                          onClick={() => void deleteUserAllMessages(r.reported_id, reported?.display_name ?? "対象者")}
                        >
                          <Trash2 className="size-3" />
                          対象者の投稿を全削除
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* 3. ユーザー管理タブ */}
          <TabsContent value="users" className="space-y-4 pt-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-2 flex-1 max-w-sm">
                <Input
                  placeholder="名前・ID・フレンドコードで検索..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void loadUsers(query)}
                  className="h-8 text-xs"
                />
                <Button size="sm" className="h-8 px-3" onClick={() => void loadUsers(query)}>
                  <Search className="size-3.5" />
                </Button>
              </div>
              <div className="flex gap-1">
                {(["all", "banned", "admin"] as const).map((f) => (
                  <Button
                    key={f}
                    variant={userFilter === f ? "default" : "ghost"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setUserFilter(f)}
                  >
                    {f === "all" ? "全員" : f === "banned" ? "停止中" : "管理者"}
                  </Button>
                ))}
              </div>
            </div>

            {filteredUsers.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">該当するユーザーはいません</p>
            ) : (
              <div className="space-y-2">
                {filteredUsers.map((u) => (
                  <div key={u.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border bg-card p-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="size-10">
                        {u.avatar_url && <AvatarImage src={u.avatar_url} />}
                        <AvatarFallback>{initials(u.display_name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm truncate">{u.display_name}</p>
                          {u.role && (
                            <Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-[10px]">
                              {u.role === "admin" ? "管理者" : "モデレーター"}
                            </Badge>
                          )}
                          {u.banned && (
                            <Badge variant="destructive" className="text-[10px]">
                              利用停止中
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          ID: {u.friend_code} {u.username ? `(@${u.username})` : ""} · 登録: {formatListTime(u.created_at)}
                        </p>
                        {u.banned && u.ban_reason && (
                          <p className="text-xs text-destructive">
                            理由: {u.ban_reason} {u.ban_until ? `(${new Date(u.ban_until).toLocaleDateString()}まで)` : "(無期限)"}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 self-end sm:self-center">
                      <Button
                        variant={u.banned ? "outline" : "destructive"}
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => void toggleBan(u)}
                      >
                        <Ban className="size-3" />
                        {u.banned ? "解除" : "停止"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => {
                          const nextRole = u.role === "admin" ? null : u.role === "moderator" ? "admin" : "moderator";
                          void changeRole(u, nextRole);
                        }}
                      >
                        <ShieldCheck className="size-3" />
                        {u.role === "admin" ? "権限剥奪" : u.role === "moderator" ? "管理者に昇格" : "モデレーター"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:bg-destructive/10"
                        title="投稿全削除"
                        onClick={() => void deleteUserAllMessages(u.id, u.display_name)}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* 4. 投稿監視タブ */}
          <TabsContent value="messages" className="space-y-4 pt-4">
            <div className="flex gap-2 max-w-sm">
              <Input
                placeholder="本文で検索（荒らしキーワードなど）..."
                value={msgQuery}
                onChange={(e) => setMsgQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void loadMessages(msgQuery)}
                className="h-8 text-xs"
              />
              <Button size="sm" className="h-8 px-3" onClick={() => void loadMessages(msgQuery)} disabled={msgLoading}>
                <Search className="size-3.5" />
              </Button>
            </div>

            {msgLoading ? (
              <p className="py-12 text-center text-sm text-muted-foreground">検索中…</p>
            ) : messages.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">投稿が見つかりませんでした</p>
            ) : (
              <div className="space-y-2">
                {messages.map((m) => (
                  <div key={`${m.kind}-${m.id}`} className="flex items-start justify-between gap-3 rounded-xl border bg-card p-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={m.kind === "group" ? "secondary" : "outline"} className="text-[10px]">
                          {m.kind === "group" ? `オプチャ: ${m.group_name ?? "グループ"}` : "個人DM"}
                        </Badge>
                        <span className="font-semibold text-xs">{m.sender_name}</span>
                        <span className="text-[10px] text-muted-foreground">{formatListTime(m.created_at)}</span>
                      </div>
                      <p className="text-xs break-words whitespace-pre-wrap">{m.content || "(テキストなし)"}</p>
                      {m.media_type && (
                        <p className="text-[10px] text-muted-foreground">📎 メディア: {m.media_type}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:bg-destructive/10 shrink-0"
                      onClick={() => void deleteSingleMessage(m)}
                    >
                      <Trash2 className="size-3" />
                      削除
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* 5. ルーム管理タブ */}
          <TabsContent value="groups" className="space-y-4 pt-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-2 flex-1 max-w-sm">
                <Input
                  placeholder="ルーム名で検索..."
                  value={groupQuery}
                  onChange={(e) => setGroupQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void loadGroups(groupQuery, openOnly)}
                  className="h-8 text-xs"
                />
                <Button size="sm" className="h-8 px-3" onClick={() => void loadGroups(groupQuery, openOnly)}>
                  <Search className="size-3.5" />
                </Button>
              </div>
              <Button
                variant={openOnly ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  const next = !openOnly;
                  setOpenOnly(next);
                  void loadGroups(groupQuery, next);
                }}
              >
                {openOnly ? "公開中のみ表示" : "非公開含むすべて表示"}
              </Button>
            </div>

            {groups.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">ルームが見つかりませんでした</p>
            ) : (
              <div className="space-y-2">
                {groups.map((g) => (
                  <div key={g.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border bg-card p-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={g.is_open ? "default" : "outline"} className="text-[10px]">
                          {g.is_open ? "公開オプチャ" : "非公開"}
                        </Badge>
                        <p className="font-semibold text-sm truncate">{g.name}</p>
                      </div>
                      {g.description && <p className="text-xs text-muted-foreground truncate">{g.description}</p>}
                      <p className="text-[10px] text-muted-foreground">
                        オーナー: {g.owner_name} · メンバー: {g.members}人 · 投稿数: {g.messages}件 · 作成: {formatListTime(g.created_at)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 self-end sm:self-center">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => void hideGroup(g)}
                      >
                        <EyeOff className="size-3" />
                        {g.is_open ? "非公開にする" : "公開する"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:bg-destructive/10 gap-1"
                        onClick={() => void clearGroup(g)}
                      >
                        <Trash2 className="size-3" />
                        投稿全削除
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => void deleteGroup(g)}
                      >
                        <Trash2 className="size-3" />
                        ルーム削除
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
