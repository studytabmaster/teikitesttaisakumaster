import {
  adminPublishAnnouncement,
  adminCloseAnnouncement,
  getActiveAnnouncement,
} from "@/lib/admin.functions";
import { Plus, Gift, Trophy, Crown, Sparkles, UserCheck } from "lucide-react";
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
  adminGetInviteLeaderboard,
  unlockAdmin,
  type AdminGroup,
  type AdminMessage,
  type AdminUser,
  type InviteLeaderboardItem,
} from "@/lib/admin.functions";
import { RankBadge } from "@/components/RankBadge";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "管理者パネル｜RINE" },
      {
        name: "description",
        content:
          "RINE の管理者パネル。通報対応・ユーザー管理・招待ランキング・荒らし投稿削除・ルーム管理をまとめて行えます。",
      },
      { property: "og:title", content: "管理者パネル｜RINE" },
      { property: "og:description", content: "通報対応・利用停止・投稿削除・招待集計・アナウンス配信。" },
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

  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [msgQuery, setMsgQuery] = useState("");
  const [searchingMsg, setSearchingMsg] = useState(false);

  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [groupQuery, setGroupQuery] = useState("");
  const [openOnly, setOpenOnly] = useState(false);

  const [announcement, setAnnouncement] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [enablePoll, setEnablePoll] = useState(false);
  const [sendingAnnounce, setSendingAnnounce] = useState(false);

  // 招待ランキングステート
  const [leaderboard, setLeaderboard] = useState<InviteLeaderboardItem[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);

  const [stats, setStats] = useState<{
    users: number;
    groups: number;
    openGroups: number;
    messages: number;
    todayMessages: number;
    openReports: number;
    bans: number;
    invites: number;
  } | null>(null);

  const unlock = useServerFn(unlockAdmin);
  const getStats = useServerFn(adminStats);
  const listUsers = useServerFn(adminListUsers);
  const setBan = useServerFn(adminSetBan);
  const setRole = useServerFn(adminSetRole);
  const searchMsgs = useServerFn(adminSearchMessages);
  const removeMessage = useServerFn(adminDeleteMessage);
  const wipeMessages = useServerFn(adminDeleteUserMessages);
  const listGroups = useServerFn(adminListGroups);
  const setGroupOpen = useServerFn(adminSetGroupOpen);
  const clearGroupMessages = useServerFn(adminClearGroupMessages);
  const removeGroup = useServerFn(adminDeleteGroup);
  const publishAnnouncement = useServerFn(adminPublishAnnouncement);
  const closeAnnouncement = useServerFn(adminCloseAnnouncement);
  const broadcastOpen = useServerFn(adminBroadcastToOpenGroups);
  const fetchLeaderboard = useServerFn(adminGetInviteLeaderboard);

  const loadReports = useCallback(async () => {
    const { data, error } = await supabase
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (!error && data) {
      setReports(data as Report[]);
      const ids = Array.from(
        new Set(data.flatMap((r) => [r.reporter_id, r.reported_id]).filter(Boolean)),
      );
      if (ids.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, display_name, username, friend_code, avatar_url, status_message")
          .in("id", ids);
        const map: Record<string, Profile> = {};
        for (const p of profs ?? []) map[p.id] = p as Profile;
        setProfiles(map);
      }
    }
  }, []);

  const loadUsers = useCallback(
    async (q?: string) => {
      try {
        const rows = await listUsers({ data: { q } });
        setUsers(rows);
      } catch (e) {
        toast.error(errorMessage(e));
      }
    },
    [listUsers],
  );

  const loadGroups = useCallback(
    async (q?: string, onlyOpen?: boolean) => {
      try {
        const rows = await listGroups({ data: { q, openOnly: onlyOpen } });
        setGroups(rows);
      } catch (e) {
        toast.error(errorMessage(e));
      }
    },
    [listGroups],
  );

  const loadInvites = useCallback(async () => {
    setLoadingInvites(true);
    try {
      const data = await fetchLeaderboard();
      setLeaderboard(data);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoadingInvites(false);
    }
  }, [fetchLeaderboard]);

  const refreshAll = useCallback(async () => {
    try {
      const s = await getStats();
      setStats(s);
    } catch {
      // noop
    }
    await Promise.all([loadReports(), loadUsers(), loadGroups(), loadInvites()]);
  }, [getStats, loadReports, loadUsers, loadGroups, loadInvites]);

  useEffect(() => {
    if (!user) {
      setAllowed(false);
      return;
    }
    void supabase
      .rpc("has_role", { _user_id: user.id, _role: "admin" })
      .then(async ({ data }) => {
        if (data === true) {
          setAllowed(true);
          await refreshAll();
        } else {
          setAllowed(false);
        }
      });
  }, [user, refreshAll]);

  const submitPassword = async () => {
    if (!password.trim()) return;
    setBusy(true);
    try {
      await unlock({ data: { password } });
      toast.success("管理者として認証されました");
      setAllowed(true);
      setPassword("");
      await refreshAll();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const updateReportStatus = async (reportId: string, status: string) => {
    const { error } = await supabase.from("reports").update({ status }).eq("id", reportId);
    if (error) {
      toast.error("更新できませんでした");
      return;
    }
    setReports((prev) => prev.map((r) => (r.id === reportId ? { ...r, status } : r)));
    toast.success("対応状況を更新しました");
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
    if (!confirm(`ルーム「${g.name}」を完全に削除しますか？\n投稿やメンバーも消去されます`)) return;
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

  const handleSendAnnouncement = async () => {
    const text = announcement.trim();
    if (!text) return;
    const options = enablePoll ? pollOptions.filter((o) => o.trim().length > 0) : [];
    if (enablePoll && options.length < 2) {
      toast.error("投票を行う場合は選択肢を2つ以上入力してください");
      return;
    }
    if (!confirm("全ユーザーの画面上部にアナウンスを固定表示しますか？")) return;
    setSendingAnnounce(true);
    try {
      await publishAnnouncement({ data: { content: text, pollOptions: options } });
      toast.success("全ユーザーの画面上部へアナウンスを公開しました");
      setAnnouncement("");
      setPollOptions(["", ""]);
      setEnablePoll(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSendingAnnounce(false);
    }
  };

  const handleForceReloadAll = async () => {
    if (!confirm("全接続中ユーザーの画面を【強制再読み込み】しますか？\nアプデ直後の反映に有効です。")) return;
    try {
      const channel = supabase.channel("system-control");
      await channel.subscribe();
      await channel.send({
        type: "broadcast",
        event: "force_reload",
        payload: { at: new Date().toISOString() },
      });
      toast.success("全画面の一斉再読み込み信号を送信しました！");
    } catch (err: any) {
      toast.error("送信に失敗しました: " + (err.message || ""));
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

  return (
    <AppShell title="管理者パネル">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <ShieldCheck className="size-6 text-primary" /> 管理者コントロールパネル
            </h1>
            <p className="text-xs text-muted-foreground">
              通報対応・ユーザー管理・招待ランキング・一斉通知
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleForceReloadAll}
              className="text-xs font-bold gap-1"
            >
              <RefreshCw className="size-3.5" /> 全員の画面を再読み込み
            </Button>
            <Button variant="outline" size="sm" onClick={() => void refreshAll()} className="gap-1 text-xs">
              <RefreshCw className="size-3.5" /> 最新に更新
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid grid-cols-5 w-full max-w-2xl">
            <TabsTrigger value="overview">概要</TabsTrigger>
            <TabsTrigger value="invites" className="gap-1">
              <Gift className="size-3.5 text-primary" /> 招待・ランク
            </TabsTrigger>
            <TabsTrigger value="users">ユーザー</TabsTrigger>
            <TabsTrigger value="reports">
              通報 {(stats?.openReports ?? 0) > 0 && `(${stats?.openReports})`}
            </TabsTrigger>
            <TabsTrigger value="groups">オプチャ</TabsTrigger>
          </TabsList>

          {/* 概要タブ */}
          <TabsContent value="overview" className="space-y-6 pt-2">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">総ユーザー数</p>
                <p className="mt-1 text-2xl font-black">{stats?.users ?? 0}</p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">累計招待成立数</p>
                <p className="mt-1 text-2xl font-black text-primary">{stats?.invites ?? 0}</p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">本日送信メッセージ</p>
                <p className="mt-1 text-2xl font-black">{stats?.todayMessages ?? 0}</p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">未対応の通報</p>
                <p className={`mt-1 text-2xl font-black ${(stats?.openReports ?? 0) > 0 ? "text-destructive" : ""}`}>
                  {stats?.openReports ?? 0}
                </p>
              </div>
            </div>

            {/* アナウンス送信カード */}
            <div className="rounded-xl border bg-card p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Megaphone className="size-5 text-primary" />
                  <h3 className="font-semibold text-sm">全ユーザー画面上部へのアナウンス固定配信</h3>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void closeAnnouncement()}
                  className="text-xs text-destructive hover:bg-destructive/10"
                >
                  終了する
                </Button>
              </div>
              <Textarea
                placeholder="お知らせ本文を入力..."
                rows={2}
                value={announcement}
                onChange={(e) => setAnnouncement(e.target.value)}
                className="text-sm"
              />
              <Button onClick={handleSendAnnouncement} disabled={sendingAnnounce} size="sm" className="w-full text-xs font-bold">
                アナウンスを配信する
              </Button>
            </div>
          </TabsContent>

          {/* 招待・ランクタブ */}
          <TabsContent value="invites" className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold flex items-center gap-2">
                  <Trophy className="size-5 text-yellow-500" /> 招待ランキング TOP 100
                </h3>
                <p className="text-xs text-muted-foreground">
                  友だちを多く招待してコミュニティを広げているユーザーの一覧です。
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={loadInvites} disabled={loadingInvites} className="text-xs">
                再集計
              </Button>
            </div>

            <div className="rounded-2xl border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/60 border-b text-muted-foreground font-semibold">
                    <tr>
                      <th className="py-2.5 px-4 w-12 text-center">順位</th>
                      <th className="py-2.5 px-4">ユーザー</th>
                      <th className="py-2.5 px-4">フレンドID</th>
                      <th className="py-2.5 px-4 text-center">招待人数</th>
                      <th className="py-2.5 px-4">現在ランク</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {leaderboard.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-muted-foreground">
                          {loadingInvites ? "集計中…" : "招待実績はまだありません"}
                        </td>
                      </tr>
                    ) : (
                      leaderboard.map((item, index) => (
                        <tr key={item.user_id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-4 text-center font-bold">
                            {index === 0 && <span className="text-yellow-500 font-black text-sm">🥇 1</span>}
                            {index === 1 && <span className="text-slate-400 font-black text-sm">🥈 2</span>}
                            {index === 2 && <span className="text-amber-600 font-black text-sm">🥉 3</span>}
                            {index > 2 && <span className="text-muted-foreground">{index + 1}</span>}
                          </td>
                          <td className="py-3 px-4 font-bold flex items-center gap-2">
                            <Avatar className="size-7">
                              <AvatarImage src={item.avatar_url || undefined} />
                              <AvatarFallback>{initials(item.display_name)}</AvatarFallback>
                            </Avatar>
                            <span className="truncate max-w-[140px]">{item.display_name}</span>
                          </td>
                          <td className="py-3 px-4 font-mono text-muted-foreground">
                            {item.friend_code}
                          </td>
                          <td className="py-3 px-4 text-center font-black text-primary text-sm">
                            {item.invite_count} 人
                          </td>
                          <td className="py-3 px-4">
                            <RankBadge count={Number(item.invite_count)} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          {/* ユーザー管理タブ */}
          <TabsContent value="users" className="space-y-4 pt-2">
            <div className="flex gap-2">
              <Input
                placeholder="名前・フレンドIDで検索..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void loadUsers(query)}
                className="text-xs"
              />
              <Button onClick={() => void loadUsers(query)} size="sm" className="text-xs">
                検索
              </Button>
            </div>
            <div className="space-y-2">
              {users.map((u) => (
                <div key={u.id} className="flex items-center justify-between p-3 rounded-xl border bg-card text-xs">
                  <div className="flex items-center gap-2.5">
                    <Avatar className="size-8">
                      <AvatarImage src={u.avatar_url || undefined} />
                      <AvatarFallback>{initials(u.display_name)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-1.5 font-bold">
                        <span>{u.display_name}</span>
                        {u.role && <Badge variant="outline">{u.role}</Badge>}
                        {u.banned && <Badge variant="destructive">停止中</Badge>}
                      </div>
                      <p className="text-[10px] text-muted-foreground font-mono">ID: {u.friend_code}</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => toggleBan(u)} className="h-7 text-[11px]">
                      {u.banned ? "解除" : "停止"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => changeRole(u, u.role === "admin" ? null : "admin")}
                      className="h-7 text-[11px]"
                    >
                      {u.role === "admin" ? "管理者解除" : "管理者に"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* 通報タブ */}
          <TabsContent value="reports" className="space-y-3 pt-2">
            {reports.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">通報はありません</p>
            ) : (
              reports.map((r) => (
                <div key={r.id} className="p-3 rounded-xl border bg-card text-xs space-y-2">
                  <div className="flex justify-between items-center">
                    <Badge variant={r.status === "open" ? "destructive" : "secondary"}>
                      {STATUS_LABEL[r.status] || r.status}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                  </div>
                  <p><strong>理由:</strong> {r.reason}</p>
                  <p className="text-muted-foreground">{r.detail}</p>
                  <div className="flex gap-1.5 pt-1">
                    <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => updateReportStatus(r.id, "resolved")}>
                      対応済みにする
                    </Button>
                  </div>
                </div>
              ))
            )}
          </TabsContent>

          {/* オプチャタブ */}
          <TabsContent value="groups" className="space-y-3 pt-2">
            {groups.map((g) => (
              <div key={g.id} className="flex justify-between items-center p-3 rounded-xl border bg-card text-xs">
                <div>
                  <p className="font-bold">{g.name}</p>
                  <p className="text-[10px] text-muted-foreground">オーナー: {g.owner_name} / メンバー: {g.members}人</p>
                </div>
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => hideGroup(g)} className="h-7 text-[11px]">
                    {g.is_open ? "非公開" : "公開"}
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => deleteGroup(g)} className="h-7 text-[11px]">
                    削除
                  </Button>
                </div>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
