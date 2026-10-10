import { StaffBadge } from "@/components/StaffBadge";
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Clock, MessageSquare, Phone, Pin, Share2, UserPlus, Video, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfile, fetchProfiles } from "@/lib/profileCache";
import { useAuth } from "@/hooks/useAuth";
import { useCall } from "@/components/CallProvider";
import { useBlocks } from "@/hooks/useBlocks";
import { AppShell } from "@/components/AppShell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { initials, type Profile } from "@/lib/rine";

export const Route = createFileRoute("/friends")({
  head: () => ({
    meta: [
      { title: "友だちリスト｜RINE" },
      {
        name: "description",
        content: "RINE の友だちリスト。フレンドID を入力して申請を送り、承認されるとトークや通話ができます。",
      },
      { property: "og:title", content: "友だちリスト｜RINE" },
      { property: "og:description", content: "フレンドID で友だち申請を送ってトークと通話を始めよう。" },
    ],
  }),
  component: FriendsPage,
});

type IncomingRequest = {
  id: string;
  sender_id: string;
  created_at: string;
  sender: Profile | null;
};

type OutgoingRequest = {
  id: string;
  receiver_id: string;
  created_at: string;
  receiver: Profile | null;
};

function FriendsPage() {
  const { user, profile } = useAuth();
  const { startCall } = useCall();
  const { isBlocked } = useBlocks();

  const [friends, setFriends] = useState<Profile[]>([]);
  const [incoming, setIncoming] = useState<IncomingRequest[]>([]);
  const [outgoing, setOutgoing] = useState<OutgoingRequest[]>([]);
  const [code, setCode] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;

    // 1. 友だち一覧の取得
    const { data: links } = await supabase
      .from("friendships")
      .select("friend_id")
      .eq("user_id", user.id);
    const ids = (links ?? []).map((l) => l.friend_id);
    if (ids.length > 0) {
      const { data } = { data: await fetchProfiles(ids).then((r) => r.sort((a, b) => a.display_name.localeCompare(b.display_name))) };
      setFriends((data ?? []) as Profile[]);
    } else {
      setFriends([]);
    }

    // 2. 届いた申請の取得
    const { data: inReqs } = await supabase
      .from("friend_requests")
      .select("id, sender_id, created_at")
      .eq("receiver_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (inReqs && inReqs.length > 0) {
      const senderIds = inReqs.map((r) => r.sender_id);
      const { data: senders } = { data: await fetchProfiles(senderIds) };
      const sMap = new Map((senders ?? []).map((s) => [s.id, s as Profile]));
      setIncoming(
        inReqs.map((r) => ({
          ...r,
          sender: sMap.get(r.sender_id) ?? null,
        }))
      );
    } else {
      setIncoming([]);
    }

    // 3. 送信中の申請の取得
    const { data: outReqs } = await supabase
      .from("friend_requests")
      .select("id, receiver_id, created_at")
      .eq("sender_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (outReqs && outReqs.length > 0) {
      const recvIds = outReqs.map((r) => r.receiver_id);
      const { data: receivers } = { data: await fetchProfiles(recvIds) };
      const rMap = new Map((receivers ?? []).map((r) => [r.id, r as Profile]));
      setOutgoing(
        outReqs.map((r) => ({
          ...r,
          receiver: rMap.get(r.receiver_id) ?? null,
        }))
      );
    } else {
      setOutgoing([]);
    }
  };

  useEffect(() => {
    void load();
  }, [user]);

  const sendRequest = async () => {
    if (!user) return;
    const trimmed = code.trim();
    if (!trimmed) {
      toast.error("IDか名前を入力してください");
      return;
    }
    setBusy(true);

    try {
      const clean = trimmed.toUpperCase();
      let target: Profile | null = null;

      if (/^[A-Z0-9]{8}$/.test(clean)) {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("friend_code", clean)
          .maybeSingle();
        target = data as Profile | null;
      }

      if (!target) {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .ilike("display_name", trimmed)
          .limit(1);
        target = (data?.[0] as Profile | null) ?? null;
      }

      if (!target) {
        toast.error("ユーザーが見つかりませんでした");
        return;
      }

      if (target.id === user.id) {
        toast.error("自分自身には申請できません");
        return;
      }

      if (friends.some((f) => f.id === target?.id)) {
        toast.info("すでに友だちです");
        return;
      }

      const { data: existing } = await supabase
        .from("friend_requests")
        .select("id, status")
        .eq("sender_id", user.id)
        .eq("receiver_id", target.id)
        .eq("status", "pending")
        .maybeSingle();

      if (existing) {
        toast.info("すでに申請を送信済みです（相手の承認をお待ちください）");
        return;
      }

      const { error } = await supabase.from("friend_requests").insert({
        sender_id: user.id,
        receiver_id: target.id,
        status: "pending",
      });

      if (error) {
        toast.error("申請の送信に失敗しました: " + error.message);
        return;
      }

      toast.success(`${target.display_name} さんに友だち申請を送りました！`);
      setCode("");
      setOpen(false);
      void load();
    } finally {
      setBusy(false);
    }
  };

  const acceptReq = async (reqId: string) => {
    if (!user) return;
    setActionBusy(reqId);
    try {
      const { data: req } = await supabase
        .from("friend_requests")
        .select("sender_id, receiver_id")
        .eq("id", reqId)
        .single();

      if (!req) return;

      const { error: insErr } = await supabase.from("friendships").insert([
        { user_id: req.receiver_id, friend_id: req.sender_id },
        { user_id: req.sender_id, friend_id: req.receiver_id },
      ]);

      if (insErr) {
        toast.error("友だち追加に失敗しました: " + insErr.message);
        return;
      }

      await supabase
        .from("friend_requests")
        .update({ status: "accepted" })
        .eq("id", reqId);

      toast.success("友だち申請を承認しました！");
      void load();
    } finally {
      setActionBusy(null);
    }
  };

  const rejectReq = async (reqId: string) => {
    setActionBusy(reqId);
    try {
      await supabase
        .from("friend_requests")
        .update({ status: "rejected" })
        .eq("id", reqId);
      toast.info("申請を拒否しました");
      void load();
    } finally {
      setActionBusy(null);
    }
  };

  const cancelReq = async (reqId: string) => {
    setActionBusy(reqId);
    try {
      await supabase.from("friend_requests").delete().eq("id", reqId);
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

  return (
    <AppShell
      title="友だち"
      action={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="icon" variant="ghost" className="rounded-full" aria-label="友だち追加">
              <UserPlus className="size-5" />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>IDで友だちを検索して申請</DialogTitle>
              <DialogDescription>
                相手のID（8文字）か名前を入力してください。相手が承認すると友だちになります。
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="例: A3K9PQ2M / たろう"
                maxLength={20}
                className="font-mono tracking-widest"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void sendRequest();
                }}
              />
              <Button variant="brand" onClick={sendRequest} disabled={busy}>
                {busy ? "送信中" : "申請"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              あなたのIDは <span className="font-mono font-bold text-foreground">{profile?.friend_code ?? "..."}</span> です。
            </p>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="m-4 rounded-2xl bg-muted/60 p-4">
        <p className="text-[11px] font-semibold text-muted-foreground">あなたのID（なりすまし不可）</p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="select-all font-mono text-xl font-black tracking-widest">
            {profile?.friend_code ?? "········"}
          </p>
          <Button variant="outline" size="sm" className="rounded-full" onClick={shareMyId}>
            <Share2 className="mr-1 size-4" />
            IDを送る
          </Button>
        </div>
      </div>

      <Tabs defaultValue="friends" className="w-full">
        <div className="px-4">
          <TabsList className="grid w-full grid-cols-2 rounded-2xl">
            <TabsTrigger value="friends" className="rounded-xl">
              友だち ({friends.length})
            </TabsTrigger>
            <TabsTrigger value="requests" className="relative rounded-xl">
              届いた申請 ({incoming.length})
              {incoming.length > 0 && (
                <span className="ml-1.5 flex size-2 rounded-full bg-destructive" />
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* 友だち一覧タブ */}
        <TabsContent value="friends" className="mt-2">
          {/* Keepメモ（自分専用）カードを最上部にピン留め */}
          <div className="px-4 pt-1 pb-2">
            <Link
              to="/keep"
              className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card p-3 shadow-sm hover:bg-muted/40 transition-colors"
            >
              <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Pin className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold text-sm">Keepメモ</p>
                  <span className="rounded-full bg-muted px-1.5 py-0.2 text-[10px] text-muted-foreground">自分専用</span>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  下書き・リンク・ToDoを端末内に保存（通信量0）
                </p>
              </div>
              <span className="text-xs text-primary font-medium">開く ›</span>
            </Link>
          </div>

          {friends.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-8 py-12 text-center">
              <UserPlus className="size-12 text-muted-foreground/40" />
              <p className="text-base font-bold">まだ友だちがいません</p>
              <p className="text-sm text-muted-foreground">
                相手のIDを聞いて「追加」から申請を送るか、
                <br />
                上の「IDを送る」であなたのIDを教えましょう。
              </p>
              <Button variant="brand" size="pill" onClick={() => setOpen(true)}>
                IDで友だちを検索
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {friends.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-5 py-3">
                  <Link
                    to="/friend/$friendId"
                    params={{ friendId: f.id }}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <Avatar className="size-12">
                      <AvatarImage src={f.avatar_url ?? undefined} alt={f.display_name} />
                      <AvatarFallback className="bg-brand-gradient text-primary-foreground">
                        {initials(f.display_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{f.display_name}<StaffBadge userId={f.id} /></p>
                      <p className="truncate text-sm text-muted-foreground">
                        {isBlocked(f.id) ? "ブロック中" : f.status_message || `ID: ${f.friend_code}`}
                      </p>
                    </div>
                  </Link>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button asChild variant="ghost" size="icon" aria-label="トーク">
                      <Link to="/chat/$friendId" params={{ friendId: f.id }}>
                        <MessageSquare className="size-5" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="音声通話"
                      disabled={isBlocked(f.id)}
                      onClick={() => startCall(f, false)}
                    >
                      <Phone className="size-5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="ビデオ通話"
                      disabled={isBlocked(f.id)}
                      onClick={() => startCall(f, true)}
                    >
                      <Video className="size-5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        {/* 申請一覧タブ */}
        <TabsContent value="requests" className="mt-2 space-y-6">
          <div className="px-4">
            <h3 className="mb-2 text-xs font-bold text-muted-foreground">届いたフレンド申請</h3>
            {incoming.length === 0 ? (
              <p className="rounded-2xl border border-dashed py-8 text-center text-sm text-muted-foreground">
                現在、届いている申請はありません
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-2xl border bg-card">
                {incoming.map((req) => (
                  <li key={req.id} className="flex items-center gap-3 p-3">
                    <Link
                      to="/friend/$friendId"
                      params={{ friendId: req.sender_id }}
                      className="flex min-w-0 flex-1 items-center gap-2.5"
                    >
                      <Avatar className="size-10">
                        <AvatarImage src={req.sender?.avatar_url ?? undefined} />
                        <AvatarFallback>{initials(req.sender?.display_name ?? "?")}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {req.sender?.display_name ?? "ユーザー"}
                        </p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          ID: {req.sender?.friend_code ?? "········"}
                        </p>
                      </div>
                    </Link>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="brand"
                        className="h-8 rounded-full px-3 text-xs"
                        disabled={actionBusy === req.id}
                        onClick={() => acceptReq(req.id)}
                      >
                        <Check className="mr-1 size-3.5" />
                        承認
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 rounded-full px-2.5 text-xs text-muted-foreground"
                        disabled={actionBusy === req.id}
                        onClick={() => rejectReq(req.id)}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {outgoing.length > 0 && (
            <div className="px-4 pb-6">
              <h3 className="mb-2 text-xs font-bold text-muted-foreground">あなたが送信した申請（承認待ち）</h3>
              <ul className="divide-y divide-border rounded-2xl border bg-card">
                {outgoing.map((req) => (
                  <li key={req.id} className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar className="size-8">
                        <AvatarImage src={req.receiver?.avatar_url ?? undefined} />
                        <AvatarFallback>{initials(req.receiver?.display_name ?? "?")}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{req.receiver?.display_name ?? "ユーザー"}</p>
                        <p className="font-mono text-[9px] text-muted-foreground">ID: {req.receiver?.friend_code}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground hover:text-destructive"
                      disabled={actionBusy === req.id}
                      onClick={() => cancelReq(req.id)}
                    >
                      取り消す
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
