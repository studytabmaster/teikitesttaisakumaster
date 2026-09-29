import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Ban,
  EyeOff,
  KeyRound,
  Megaphone,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Users,
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

  const deleteUserAllMessages = async (u: AdminUser) => {
    if (!confirm(`${u.display_name} さんの投稿（個人トーク＋オプチャ）をすべて削除しますか？（元に戻せません）`)) return;
    try {
      await wipeMessages({ data: { userId: u.id } });
      toast.success("投稿を全削除しました");
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
前の送信が途中で切れてしまいました。安全に貼り替えできるよう、**GitHubでの丸ごと置き換え用コードは次の返信で2ファイルを分けて最後まで出します**。まず `roadmap.md` に「管理者パネル強化」を追加してから、`admin.functions.ts` と `admin.tsx` を完全版で渡します。
