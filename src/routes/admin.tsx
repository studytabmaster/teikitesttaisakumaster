import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Ban,
  Eye,
  EyeOff,
  Filter,
  Gift,
  Globe,
  KeyRound,
  Lock,
  Megaphone,
  MessageSquare,
  Radio,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Trophy,
  VolumeX,
  X,
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
import { formatListTime, initials } from "@/lib/rine";
import {
  adminBroadcastToRooms,
  adminClearGroupMessages,
  adminCloseAnnouncement,
  adminDeleteGroup,
  adminDeleteMessage,
  adminDeleteUserMessages,
  adminGetInviteLeaderboard,
  adminListGroups,
  adminListUsers,
  adminPublishAnnouncement,
  adminSearchMessages,
  adminSetBan,
  adminSetGroupOpen,
  adminSetMute,
  adminSetRole,
  adminStats,
  getMyStaffRole,
  unlockAdmin,
  type AdminGroup,
  type AdminMessage,
  type AdminUser,
  type InviteLeaderboardItem,
} from "@/lib/admin.functions";
import { RankBadge } from "@/components/RankBadge";
import { PasscodeManager } from "@/components/PasscodeManager";
import { StaffList } from "@/components/StaffList";
import { ReportsPanel } from "@/components/ReportsPanel";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "管理者パネル｜RINE" },
      {
        name: "description",
        content:
          "RINE の管理者パネル。全ルーム一斉通知・通報対応・ユーザー管理・招待ランキング・荒らし投稿削除・ルーム管理をまとめて行えます。",
      },
      { property: "og:title", content: "管理者パネル｜RINE" },
      { property: "og:description", content: "一斉通知・通報対応・利用停止・投稿削除・招待集計。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

function errorMessage(e: unknown) {
  return e instanceof Error && e.message ? e.message : "うまくいきませんでした";
}

function AdminPage() {
  const { user } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [myRole, setMyRole] = useState<"admin" | "moderator" | null>(null);
  const isAdmin = myRole === "admin";
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // ユーザー管理
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [userFilter, setUserFilter] = useState<"all" | "banned" | "muted" | "staff">("all");

  // メッセージ横断検索・削除
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [msgQuery, setMsgQuery] = useState("");
  const [searchingMsg, setSearchingMsg] = useState(false);

  // ルーム管理
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [groupQuery, setGroupQuery] = useState("");
  const [openOnly, setOpenOnly] = useState(false);

  // 画面最上部固定アナウンス
  const [announcement, setAnnouncement] = useState("");
  const [sendingAnnounce, setSendingAnnounce] = useState(false);

  // 【新機能】全ルーム一斉通知
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastTarget, setBroadcastTarget] = useState<"open_only" | "all">("open_only");
  const [broadcastAsSystem, setBroadcastAsSystem] = useState(false);
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  // 招待ランキング
  const [leaderboard, setLeaderboard] = useState<InviteLeaderboardItem[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);

  // 統計情報
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

  // Server functions
  const unlock = useServerFn(unlockAdmin);
  const fetchMyRole = useServerFn(getMyStaffRole);
  const getStats = useServerFn(adminStats);
  const listUsers = useServerFn(adminListUsers);
  const setBan = useServerFn(adminSetBan);
  const setMute = useServerFn(adminSetMute);
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
  const broadcastToRooms = useServerFn(adminBroadcastToRooms);
  const fetchLeaderboard = useServerFn(adminGetInviteLeaderboard);

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

  const refreshAll = useCallback(
    async (admin = false) => {
      try {
        const s = await getStats();
        setStats(s);
      } catch {
        // noop
      }
      await Promise.all([loadUsers(query), loadGroups(groupQuery, openOnly), ...(admin ? [loadInvites()] : [])]);
    },
    [getStats, loadUsers, loadGroups, loadInvites, query, groupQuery, openOnly],
  );

  useEffect(() => {
    if (!user) {
      setAllowed(false);
      return;
    }
    void fetchMyRole()
      .catch(() => null)
      .then(async (role) => {
        setMyRole(role);
        if (role) {
          setAllowed(true);
          await refreshAll(role === "admin");
        } else {
          setAllowed(false);
        }
      });
  }, [user, refreshAll, fetchMyRole]);

  const submitPassword = async () => {
    if (!password.trim()) return;
    setBusy(true);
    try {
      const res = await unlock({ data: { password } });
      toast.success(res.role === "admin" ? "管理者として認証されました" : "モデレーターとして認証されました");
      setMyRole(res.role);
      setAllowed(true);
      setPassword("");
      await refreshAll(res.role === "admin");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleMute = async (u: AdminUser) => {
    let minutes = 0;
    if (!u.muted_until) {
      const t = prompt("ミュートする時間（分）。例: 10 / 60 / 1440（1日）", "60");
      if (t === null) return;
      minutes = Number(t);
      if (!Number.isFinite(minutes) || minutes <= 0) return;
    } else if (!confirm(`${u.display_name} さんのミュートを解除しますか？`)) return;
    try {
      await setMute({ data: { userId: u.id, minutes } });
      toast.success(minutes ? `${minutes}分ミュートしました` : "ミュートを解除しました");
      await loadUsers(query);
    } catch (e) {
      toast.error(errorMessage(e));
    }
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

  const handleWipeUserMessages = async (u: AdminUser) => {
    if (!confirm(`【警告】${u.display_name} さんの送信した投稿（DM・オプチャ）をすべて完全に削除しますか？\n荒らし対策用です。`))
      return;
    try {
      await wipeMessages({ data: { userId: u.id } });
      toast.success(`${u.display_name} さんの投稿を全件削除しました`);
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

  // メッセージ検索
  const handleSearchMessages = async () => {
    const q = msgQuery.trim();
    if (!q) return;
    setSearchingMsg(true);
    try {
      const res = await searchMsgs({ data: { q } });
      setMessages(res);
      if (res.length === 0) toast("該当する投稿は見つかりませんでした");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSearchingMsg(false);
    }
  };

  const handleDeleteSingleMessage = async (msg: AdminMessage) => {
    if (!confirm("この投稿を削除しますか？")) return;
    try {
      await removeMessage({ data: { kind: msg.kind, id: msg.id } });
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      toast.success("投稿を削除しました");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  // ルーム管理
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
    if (!confirm(`ルーム「${g.name}」内の全投稿を削除しますか？`)) return;
    try {
      await clearGroupMessages({ data: { groupId: g.id } });
      toast.success("投稿を全件消去しました");
      await loadGroups(groupQuery, openOnly);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  // 最上部固定アナウンス
  const handleSendAnnouncement = async () => {
    const text = announcement.trim();
    if (!text) return;
    if (!confirm("全ユーザーの画面上部にアナウンスを固定表示しますか？")) return;
    setSendingAnnounce(true);
    try {
      await publishAnnouncement({ data: { content: text } });
      toast.success("全ユーザーの画面上部へアナウンスを配信しました");
      setAnnouncement("");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSendingAnnounce(false);
    }
  };

  // 【新機能】全ルームへの一斉通知送信
  const handleBroadcastToRooms = async () => {
    const text = broadcastMessage.trim();
    if (!text) {
      toast.error("通知メッセージを入力してください");
      return;
    }

    const targetLabel = broadcastTarget === "open_only" ? "全オープンチャット（公開ルーム）" : "すべてのグループ・ルーム全件";
    const modeLabel = broadcastAsSystem ? "公式システム通知（中央帯）" : "通常チャット（運営バッジ付）";

    if (!confirm(`【一斉通知の確認】\n対象: ${targetLabel}\n形式: ${modeLabel}\n\n本当に一斉送信しますか？`)) {
      return;
    }

    setSendingBroadcast(true);
    try {
      const res = await broadcastToRooms({
        data: {
          message: text,
          target: broadcastTarget,
          asSystem: broadcastAsSystem,
        },
      });
      toast.success(`${res.count} 件のルームへ一斉通知を送信完了しました！`);
      setBroadcastMessage("");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSendingBroadcast(false);
    }
  };

  // 強制再読み込み
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
      toast.error("送信に失敗しました: " + (err?.message || ""));
    }
  };

  // ユーザーフィルター適用
  const filteredUsers = users.filter((u) => {
    if (userFilter === "banned") return u.banned;
    if (userFilter === "muted") {
      return u.muted_until && new Date(u.muted_until).getTime() > Date.now();
    }
    if (userFilter === "staff") return !!u.role;
    return true;
  });

  if (allowed === null) {
    return (
      <AppShell title="管理者パネル">
        <p className="px-6 py-16 text-center text-sm text-muted-foreground">権限を確認中…</p>
      </AppShell>
    );
  }

  if (!allowed) {
    return (
      <AppShell title="管理者パネル">
        <div className="mx-auto mt-16 max-w-sm space-y-4 px-6 text-center">
          <KeyRound className="mx-auto size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            管理者から受け取ったパスワード（ADM- または MOD-）を入力すると、このアカウントで管理者パネルを開けます。
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
      <div className="mx-auto w-full max-w-5xl min-w-0 space-y-6 overflow-x-hidden px-4 py-6 sm:px-6">
        {/* ヘッダー */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <ShieldCheck className="size-6 text-primary" /> 管理者コントロールパネル
            </h1>
            <p className="text-xs text-muted-foreground">
              全ルーム一斉通知・通報対応・ユーザー管理・招待ランキング・荒らし投稿削除
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
            <Button variant="outline" size="sm" onClick={() => void refreshAll(isAdmin)} className="gap-1 text-xs">
              <RefreshCw className="size-3.5" /> 最新に更新
            </Button>
          </div>
        </div>

        {/* タブナビゲーション */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 overflow-x-auto [&>button]:flex-1 [&>button]:min-w-[95px] [&>button]:whitespace-nowrap">
            <TabsTrigger value="overview">概要</TabsTrigger>
            <TabsTrigger value="broadcast" className="gap-1 font-semibold text-primary">
              <Radio className="size-3.5" /> 一斉通知
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="invites" className="gap-1">
                <Gift className="size-3.5 text-primary" /> 招待・ランク
              </TabsTrigger>
            )}
            <TabsTrigger value="users">ユーザー</TabsTrigger>
            <TabsTrigger value="reports">
              通報 {(stats?.openReports ?? 0) > 0 && `(${stats?.openReports})`}
            </TabsTrigger>
            <TabsTrigger value="groups">オプチャ</TabsTrigger>
            <TabsTrigger value="messages" className="gap-1">
              <Search className="size-3.5" /> 投稿検索
            </TabsTrigger>
            {isAdmin && <TabsTrigger value="staff">スタッフ</TabsTrigger>}
          </TabsList>

          <p className="text-xs text-muted-foreground">
            あなたの権限: <span className="font-bold text-foreground">{isAdmin ? "管理者" : "モデレーター"}</span>
            {!isAdmin && "（通報対応・ユーザー停止・メッセージ検索削除・オプチャ管理が可能です）"}
          </p>

          {/* 1. 概要タブ */}
          <TabsContent value="overview" className="space-y-6 pt-2">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">総ユーザー数</p>
                <p className="mt-1 text-2xl font-black">{stats?.users ?? 0}</p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">公開オプチャ数</p>
                <p className="mt-1 text-2xl font-black text-primary">{stats?.openGroups ?? 0}</p>
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

            {/* 画面上部への固定アナウンス配信カード */}
            {isAdmin && (
              <div className="rounded-xl border bg-card p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Megaphone className="size-5 text-primary" />
                    <h3 className="font-semibold text-sm">全ユーザー画面上部への固定アナウンス配信</h3>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void closeAnnouncement()}
                    className="text-xs text-destructive hover:bg-destructive/10"
                  >
                    配信中のアナウンスを終了
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  全ユーザーの画面上部にバーとして固定表示されます。メンテナンス予告や重要なお知らせに最適です。
                </p>
                <Textarea
                  placeholder="全ユーザー画面上部に表示するアナウンス本文を入力..."
                  rows={2}
                  value={announcement}
                  onChange={(e) => setAnnouncement(e.target.value)}
                  className="text-sm"
                />
                <Button
                  onClick={handleSendAnnouncement}
                  disabled={sendingAnnounce || !announcement.trim()}
                  size="sm"
                  className="w-full text-xs font-bold gap-1.5"
                >
                  <Megaphone className="size-3.5" /> 上部アナウンスを公開する
                </Button>
              </div>
            )}
          </TabsContent>

          {/* 2. 【新機能】一斉通知タブ */}
          <TabsContent value="broadcast" className="space-y-4 pt-2">
            <div className="rounded-2xl border bg-card p-4 sm:p-6 space-y-4">
              <div className="flex items-center gap-2 border-b pb-3">
                <Radio className="size-5 text-primary animate-pulse" />
                <div>
                  <h3 className="text-base font-bold">全ルームへの一斉通知（ブロードキャスト）</h3>
                  <p className="text-xs text-muted-foreground">
                    稼働中のルームへ直接、運営からのメッセージやシステム通知を一括配信します。
                  </p>
                </div>
              </div>

              {/* 配信対象の選択 */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-foreground">1. 配信先の対象</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBroadcastTarget("open_only")}
                    className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                      broadcastTarget === "open_only"
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <Globe className="size-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold">全オープンチャットのみ（推奨）</p>
                      <p className="text-[11px] text-muted-foreground">
                        公開されているすべてのオープンチャットに一括配信します（約 {stats?.openGroups ?? 0} 部屋）。
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBroadcastTarget("all")}
                    className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                      broadcastTarget === "all"
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <Lock className="size-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold">すべてのルーム（非公開グループ含む）</p>
                      <p className="text-[11px] text-muted-foreground">
                        全ユーザーが作成した全グループチャット（約 {stats?.groups ?? 0} 部屋）へ配信します。
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* 配信形式 */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-foreground">2. メッセージの表示形式</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={!broadcastAsSystem ? "default" : "outline"}
                    onClick={() => setBroadcastAsSystem(false)}
                    className="text-xs"
                  >
                    💬 通常メッセージ（運営アイコン・スタッフバッジ付き）
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={broadcastAsSystem ? "default" : "outline"}
                    onClick={() => setBroadcastAsSystem(true)}
                    className="text-xs"
                  >
                    🔔 公式システム通知（中央帯バッジ）
                  </Button>
                </div>
              </div>

              {/* 本文入力 */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-foreground">3. 通知メッセージ本文</Label>
                <Textarea
                  placeholder="一斉通知するメッセージ本文を入力してください（例：【重要なお知らせ】本日24時よりサーバー設備更新を行います...）"
                  rows={4}
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  className="text-xs leading-relaxed"
                />
              </div>

              {/* プレビュー表示 */}
              {broadcastMessage.trim() && (
                <div className="space-y-1.5 rounded-xl border bg-muted/40 p-3">
                  <p className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                    <Eye className="size-3.5" /> 送信プレビュー（ルーム内での見え方）:
                  </p>
                  <div className="rounded-lg bg-background p-3 border shadow-sm">
                    {broadcastAsSystem ? (
                      <div className="flex justify-center py-1">
                        <span className="rounded-full bg-muted px-3.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
                          📢 運営公式通知: {broadcastMessage.trim()}
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px] px-1 py-0">運営</Badge>
                          <span className="text-xs font-bold">RINE運営公式</span>
                        </div>
                        <div className="rounded-2xl rounded-tl-sm bg-muted p-2.5 text-xs whitespace-pre-wrap">
                          📢【運営アナウンス】{"\n"}{broadcastMessage.trim()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 送信ボタン */}
              <Button
                onClick={handleBroadcastToRooms}
                disabled={sendingBroadcast || !broadcastMessage.trim()}
                className="w-full text-xs font-bold gap-2 py-5"
              >
                <Send className="size-4" />
                {sendingBroadcast ? "各ルームへ一斉送信中…" : "確認して全ルームへ一斉送信する"}
              </Button>
            </div>
          </TabsContent>

          {/* 3. 招待・ランクタブ */}
          {isAdmin && (
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
          )}

          {/* 4. ユーザー管理タブ */}
          <TabsContent value="users" className="space-y-4 pt-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Input
                  placeholder="名前・フレンドIDで検索..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void loadUsers(query)}
                  className="pr-8 text-xs"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      void loadUsers("");
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="検索クリア"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              <Button onClick={() => void loadUsers(query)} size="sm" className="text-xs">
                検索
              </Button>
            </div>

            {/* 状態フィルター */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Filter className="size-3" /> 絞り込み:
              </span>
              {(
                [
                  { key: "all", label: "すべて" },
                  { key: "banned", label: "停止中のみ" },
                  { key: "muted", label: "ミュート中のみ" },
                  { key: "staff", label: "スタッフのみ" },
                ] as const
              ).map((f) => (
                <Button
                  key={f.key}
                  size="sm"
                  variant={userFilter === f.key ? "secondary" : "ghost"}
                  onClick={() => setUserFilter(f.key)}
                  className="h-7 text-xs px-2.5"
                >
                  {f.label}
                </Button>
              ))}
            </div>

            <div className="space-y-2">
              {filteredUsers.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">該当するユーザーはいません</p>
              ) : (
                filteredUsers.map((u) => {
                  const remainingMinutes = u.muted_until
                    ? Math.max(0, Math.ceil((new Date(u.muted_until).getTime() - Date.now()) / (60 * 1000)))
                    : 0;
                  const isMuted = remainingMinutes > 0;

                  return (
                    <div
                      key={u.id}
                      className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border bg-card text-xs hover:border-border/80 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar className="size-8 shrink-0">
                          <AvatarImage src={u.avatar_url || undefined} />
                          <AvatarFallback>{initials(u.display_name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 font-bold">
                            <span className="truncate max-w-[150px]">{u.display_name}</span>
                            {u.role && <Badge variant="outline">{u.role}</Badge>}
                            {u.banned && <Badge variant="destructive">停止中</Badge>}
                            {isMuted && (
                              <Badge
                                variant="secondary"
                                className="border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400 font-medium"
                              >
                                🔇 ミュート中（残り{remainingMinutes}分）
                              </Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground font-mono">ID: {u.friend_code}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleBan(u)}
                          className={`h-7 text-[11px] ${u.banned ? "text-destructive" : ""}`}
                        >
                          {u.banned ? "停止解除" : "停止"}
                        </Button>
                        <Button
                          variant={isMuted ? "secondary" : "outline"}
                          size="sm"
                          onClick={() => void toggleMute(u)}
                          className={`h-7 text-[11px] ${isMuted ? "border-amber-500/40 text-amber-700 dark:text-amber-400" : ""}`}
                        >
                          {isMuted ? "ミュート解除" : "ミュート"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleWipeUserMessages(u)}
                          className="h-7 text-[11px] text-destructive hover:bg-destructive/10"
                          title="このユーザーの投稿をすべて削除"
                        >
                          <Trash2 className="size-3 mr-1" /> 投稿全消去
                        </Button>
                        {isAdmin && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => changeRole(u, u.role === "moderator" ? null : "moderator")}
                              className="h-7 text-[11px]"
                            >
                              {u.role === "moderator" ? "モデ解除" : "モデ付与"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => changeRole(u, u.role === "admin" ? null : "admin")}
                              className="h-7 text-[11px]"
                            >
                              {u.role === "admin" ? "管理者解除" : "管理者に"}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </TabsContent>

          {/* 5. 通報対応タブ */}
          <TabsContent value="reports" className="space-y-3 pt-2">
            <ReportsPanel onChanged={() => void refreshAll(isAdmin)} />
          </TabsContent>

          {/* 6. オプチャ（グループ）管理タブ */}
          <TabsContent value="groups" className="space-y-3 pt-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Input
                  placeholder="ルーム名・説明文で検索..."
                  value={groupQuery}
                  onChange={(e) => setGroupQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void loadGroups(groupQuery, openOnly)}
                  className="pr-8 text-xs"
                />
                {groupQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setGroupQuery("");
                      void loadGroups("", openOnly);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="検索クリア"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              <Button onClick={() => void loadGroups(groupQuery, openOnly)} size="sm" className="text-xs">
                検索
              </Button>
            </div>

            <div className="space-y-2">
              {groups.map((g) => (
                <div
                  key={g.id}
                  className="flex flex-wrap justify-between items-center gap-2 p-3 rounded-xl border bg-card text-xs hover:border-border/80 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-bold flex items-center gap-1.5">
                      <span className="truncate max-w-[200px]">{g.name}</span>
                      <Badge variant={g.is_open ? "outline" : "secondary"}>
                        {g.is_open ? "公開オプチャ" : "非公開"}
                      </Badge>
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      オーナー: {g.owner_name} / メンバー: {g.members}人 / 累計投稿: {g.messages}件
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => hideGroup(g)} className="h-7 text-[11px]">
                      {g.is_open ? "非公開にする" : "公開する"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => clearGroup(g)}
                      className="h-7 text-[11px] text-destructive hover:bg-destructive/10"
                    >
                      投稿全消去
                    </Button>
                    {isAdmin && (
                      <Button variant="destructive" size="sm" onClick={() => deleteGroup(g)} className="h-7 text-[11px]">
                        ルーム削除
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* 7. 投稿検索・削除タブ */}
          <TabsContent value="messages" className="space-y-4 pt-2">
            <div className="flex gap-2">
              <Input
                placeholder="迷惑投稿・禁止ワード・URLなどを検索..."
                value={msgQuery}
                onChange={(e) => setMsgQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleSearchMessages()}
                className="text-xs"
              />
              <Button onClick={handleSearchMessages} disabled={searchingMsg} size="sm" className="text-xs">
                {searchingMsg ? "検索中…" : "検索"}
              </Button>
            </div>

            <div className="space-y-2">
              {messages.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  キーワードを入力して「検索」を押すと、直近の投稿から該当箇所を抽出します。
                </p>
              ) : (
                messages.map((m) => (
                  <div
                    key={`${m.kind}-${m.id}`}
                    className="flex flex-wrap items-start justify-between gap-2 p-3 rounded-xl border bg-card text-xs hover:border-border/80 transition-colors"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          {m.kind === "direct" ? "1対1 DM" : `オプチャ: ${m.group_name}`}
                        </Badge>
                        <span className="font-bold text-foreground">{m.sender_name}</span>
                        <span className="text-[10px] text-muted-foreground">{formatListTime(m.created_at)}</span>
                      </div>
                      <p className="text-xs break-words bg-muted/40 p-2 rounded-lg whitespace-pre-wrap">{m.content}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleDeleteSingleMessage(m)}
                      className="h-7 text-[11px] text-destructive hover:bg-destructive/10 shrink-0"
                    >
                      <Trash2 className="size-3.5 mr-1" /> 削除
                    </Button>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          {/* 8. スタッフ管理タブ */}
          {isAdmin && (
            <TabsContent value="staff" className="pt-2 space-y-6">
              <StaffList />
              <PasscodeManager />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </AppShell>
  );
}
