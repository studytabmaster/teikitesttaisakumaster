import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  UserPlus,
  Share2,
  Check,
  X,
  MessageCircle,
  Copy,
  Clock,
  Pin,
  FileText,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { fetchProfiles, fetchProfile } from "@/lib/profileCache";

interface Profile {
  id: string;
  display_name: string;
  status_message: string | null;
  avatar_url: string | null;
  avatar_key?: string | null;
  friend_code: string | null;
  created_at: string;
}

interface FriendRequest {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
  sender?: Profile;
  receiver?: Profile;
}

export const Route = createFileRoute("/friends")({
  component: FriendsPage,
});

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

function FriendsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [friends, setFriends] = useState<Profile[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const load = async () => {
    if (!user) return;

    const myProf = await fetchProfile(user.id);
    if (myProf) setProfile(myProf as Profile);

    // 友だち一覧の取得
    const { data: fships } = await supabase
      .from("friendships")
      .select("friend_id")
      .eq("user_id", user.id);

    const fIds = (fships || []).map((x) => x.friend_id);
    if (fIds.length > 0) {
      const profMap = await fetchProfiles(fIds);
      setFriends(Array.from(profMap.values()) as Profile[]);
    } else {
      setFriends([]);
    }

    // 届いた申請
    const { data: inc } = await supabase
      .from("friend_requests")
      .select("id, sender_id, receiver_id, status, created_at")
      .eq("receiver_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (inc && inc.length > 0) {
      const senderIds = Array.from(new Set(inc.map((r) => r.sender_id)));
      const senderMap = await fetchProfiles(senderIds);
      setIncoming(
        inc.map((r) => ({
          ...r,
          status: r.status as "pending" | "accepted" | "rejected",
          sender: senderMap.get(r.sender_id) as Profile | undefined,
        }))
      );
    } else {
      setIncoming([]);
    }

    // 送った申請
    const { data: out } = await supabase
      .from("friend_requests")
      .select("id, sender_id, receiver_id, status, created_at")
      .eq("sender_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (out && out.length > 0) {
      const recIds = Array.from(new Set(out.map((r) => r.receiver_id)));
      const recMap = await fetchProfiles(recIds);
      setOutgoing(
        out.map((r) => ({
          ...r,
          status: r.status as "pending" | "accepted" | "rejected",
          receiver: recMap.get(r.receiver_id) as Profile | undefined,
        }))
      );
    } else {
      setOutgoing([]);
    }
  };

  useEffect(() => {
    void load();
  }, [user]);

  // 申請を送信
  const handleSendReq = async () => {
    const raw = code.trim();
    if (!raw) {
      toast.error("IDを入力してください");
      return;
    }
    if (!user) return;
    setBusy(true);
    try {
      // データベースのRPC関数で安全に申請
      const { data, error } = await supabase.rpc("send_friend_request_by_code", {
        _code: raw,
      });

      if (error) {
        toast.error(error.message || "申請の送信に失敗しました");
        return;
      }

      toast.success("友だち申請を送信しました！");
      setCode("");
      setOpen(false);
      void load();
    } catch (e: any) {
      toast.error(e?.message || "エラーが発生しました");
    } finally {
      setBusy(false);
    }
  };

  // 申請を承認
  const acceptReq = async (reqId: string) => {
    if (!user) return;
    setActionBusy(reqId);
    try {
      const { error } = await supabase.rpc("accept_friend_request", {
        _request_id: reqId,
      });

      if (error) {
        toast.error("友だち追加に失敗しました: " + error.message);
        return;
      }

      toast.success("友だち申請を承認しました！");
      void load();
    } catch (e: any) {
      toast.error(e?.message || "承認に失敗しました");
    } finally {
      setActionBusy(null);
    }
  };

  // 申請を拒否
  const rejectReq = async (reqId: string) => {
    setActionBusy(reqId);
    try {
      const { error } = await supabase.rpc("reject_friend_request", {
        _request_id: reqId,
      });

      if (error) {
        // RPCがない場合は直接ステータス更新
        await supabase
          .from("friend_requests")
          .update({ status: "rejected" })
          .eq("id", reqId);
      }
      toast.info("申請を拒否しました");
      void load();
    } catch {
      toast.info("申請を拒否しました");
      void load();
    } finally {
      setActionBusy(null);
    }
  };

  // 申請を取り消し
  const cancelReq = async (reqId: string) => {
    setActionBusy(reqId);
    try {
      const { error } = await supabase.rpc("cancel_friend_request", {
        _request_id: reqId,
      });

      if (error) {
        await supabase.from("friend_requests").delete().eq("id", reqId);
      }
      toast.info("申請を取り消しました");
      void load();
    } catch {
      toast.info("申請を取り消しました");
      void load();
    } finally {
      setActionBusy(null);
    }
  };

  const shareMyId = () => {
    if (!profile?.friend_code) return;
    const text = `RINEで友だちになろう！\nフレンドID: ${profile.friend_code}\n${window.location.origin}`;
    if (navigator.share) {
      navigator.share({ title: "RINEのフレンドID", text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(profile.friend_code);
      toast.success("フレンドIDをコピーしました！");
    }
  };

  const filteredFriends = friends.filter((f) =>
    (f.display_name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="mx-auto flex h-full min-h-screen w-full max-w-lg flex-col bg-background pb-20">
      {/* ヘッダー */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <h1 className="text-xl font-bold">友だち</h1>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={shareMyId} title="自分のIDを共有">
            <Share2 className="size-5" />
          </Button>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1 rounded-full bg-primary text-primary-foreground">
                <UserPlus className="size-4" />
                <span>追加</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>友だちを追加</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <div className="text-xs text-muted-foreground">あなたのフレンドID</div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="font-mono text-base font-bold tracking-wider">
                      {profile?.friend_code || "---"}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (profile?.friend_code) {
                          navigator.clipboard.writeText(profile.friend_code);
                          toast.success("コピーしました");
                        }
                      }}
                    >
                      <Copy className="size-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    相手のフレンドIDまたはユーザー名を入力
                  </label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="例: ABC123"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleSendReq();
                      }}
                      autoCapitalize="characters"
                    />
                    <Button onClick={handleSendReq} disabled={busy}>
                      {busy ? "送信中..." : "申請"}
                    </Button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {/* タブ切り替え */}
      <Tabs defaultValue="list" className="flex-1">
        <div className="border-b border-border px-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="list" className="relative">
              友だち ({friends.length})
            </TabsTrigger>
            <TabsTrigger value="requests" className="relative">
              申請
              {incoming.length > 0 && (
                <span className="ml-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                  {incoming.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* 友だちリスト */}
        <TabsContent value="list" className="m-0 p-4 space-y-3">
          {/* Keepメモへの固定ピン留めカード */}
          <Link
            to="/keep"
            className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3.5 transition-colors hover:bg-primary/10"
          >
            <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <FileText className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm">Keepメモ</span>
                <span className="inline-flex items-center gap-0.5 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  <Pin className="size-2.5" /> ピン留め
                </span>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                自分専用のメモ・下書き・URL保存（通信量ゼロ）
              </p>
            </div>
          </Link>

          {/* 検索バー */}
          {friends.length > 3 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="友だちを検索..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
          )}

          {friends.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              友だちがまだいません。<br />右上の「追加」からIDで友だち申請を送ってみましょう！
            </div>
          ) : (
            <div className="space-y-1">
              {filteredFriends.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between rounded-lg p-2.5 transition-colors hover:bg-muted/50"
                >
                  <Link
                    to="/friend/$friendId"
                    params={{ friendId: f.id }}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <Avatar className="size-11">
                      <AvatarImage src={f.avatar_url ?? undefined} alt={f.display_name} />
                      <AvatarFallback className="bg-brand-gradient text-xs text-primary-foreground">
                        {initials(f.display_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{f.display_name}</div>
                      {f.status_message && (
                        <div className="truncate text-xs text-muted-foreground">
                          {f.status_message}
                        </div>
                      )}
                    </div>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigate({ to: "/chat/$friendId", params: { friendId: f.id } })}
                    title="トークを開く"
                  >
                    <MessageCircle className="size-5 text-primary" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* 申請リスト（届いた申請 / 送った申請） */}
        <TabsContent value="requests" className="m-0 p-4 space-y-6">
          {/* 届いた申請 */}
          <div>
            <h2 className="mb-2 text-xs font-bold uppercase text-muted-foreground">
              届いた申請 ({incoming.length})
            </h2>
            {incoming.length === 0 ? (
              <p className="text-xs text-muted-foreground">新着の申請はありません</p>
            ) : (
              <div className="space-y-2">
                {incoming.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between rounded-lg border border-border p-3"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar className="size-10">
                        <AvatarImage src={req.sender?.avatar_url ?? undefined} />
                        <AvatarFallback className="text-xs">
                          {initials(req.sender?.display_name || "?")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">
                          {req.sender?.display_name || "ユーザー"}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {new Date(req.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="default"
                        disabled={actionBusy === req.id}
                        onClick={() => acceptReq(req.id)}
                        className="h-8 gap-1 px-3 text-xs"
                      >
                        <Check className="size-3.5" />
                        承認
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={actionBusy === req.id}
                        onClick={() => rejectReq(req.id)}
                        className="h-8 px-2 text-xs text-muted-foreground"
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 送った申請 */}
          <div>
            <h2 className="mb-2 text-xs font-bold uppercase text-muted-foreground">
              送信済みの申請 ({outgoing.length})
            </h2>
            {outgoing.length === 0 ? (
              <p className="text-xs text-muted-foreground">送信中の申請はありません</p>
            ) : (
              <div className="space-y-2">
                {outgoing.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 p-3"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar className="size-9">
                        <AvatarImage src={req.receiver?.avatar_url ?? undefined} />
                        <AvatarFallback className="text-xs">
                          {initials(req.receiver?.display_name || "?")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {req.receiver?.display_name || "ユーザー"}
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Clock className="size-3" />
                          <span>承認待ち</span>
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={actionBusy === req.id}
                      onClick={() => cancelReq(req.id)}
                      className="h-8 text-xs text-muted-foreground hover:text-destructive"
                    >
                      取消
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
