import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Phone, Share2, UserPlus, Video, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCall } from "@/components/CallProvider";
import { useBlocks } from "@/hooks/useBlocks";
import { AppShell } from "@/components/AppShell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
        content: "RINE の友だちリスト。フレンドID を入力するだけで友だちを追加し、すぐに通話できます。",
      },
      { property: "og:title", content: "友だちリスト｜RINE" },
      { property: "og:description", content: "フレンドID で友だちを追加してトークと通話を始めよう。" },
    ],
  }),
  component: FriendsPage,
});

function FriendsPage() {
  const { user, profile } = useAuth();
  const { startCall } = useCall();
  const { isBlocked } = useBlocks();
  const [friends, setFriends] = useState<Profile[]>([]);
  const [code, setCode] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data: links } = await supabase
      .from("friendships")
      .select("friend_id")
      .eq("user_id", user.id);
    const ids = (links ?? []).map((l) => l.friend_id);
    if (ids.length === 0) return setFriends([]);
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .in("id", ids)
      .order("display_name");
    setFriends((data ?? []) as Profile[]);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const addFriend = async () => {
    if (!code.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("add_friend_by_code", { _code: code.trim() });
    setBusy(false);
    if (error) {
      toast.error(error.message.replace(/^.*?:\s*/, ""));
      return;
    }
    const added = data as unknown as Profile;
    toast.success(`${added?.display_name ?? "友だち"} を追加しました`);
    setCode("");
    setOpen(false);
    void load();
  };

  const shareMyId = async () => {
    const code = profile?.friend_code;
    if (!code) return;
    const text = `RINE で友だちになろう！わたしのID: ${code}\n${window.location.origin}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "RINE", text });
        return;
      }
      await navigator.clipboard.writeText(code);
      toast.success("IDをコピーしました");
    } catch {
      toast.error("コピーできませんでした");
    }
  };

  return (
    <AppShell
      title="友だち"
      action={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="brand" size="sm" className="rounded-full">
              <UserPlus className="mr-1 size-4" />
              追加
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-3xl">
            <DialogHeader>
              <DialogTitle>IDで友だちを検索して追加</DialogTitle>
              <DialogDescription>
                相手のID（8文字）か名前を入力してください。あなたのIDは{" "}
                <span className="font-mono font-bold text-foreground">
                  {profile?.friend_code ?? "..."}
                </span>{" "}
                です。
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
                  if (e.key === "Enter") void addFriend();
                }}
              />
              <Button variant="brand" onClick={addFriend} disabled={busy}>
                {busy ? "検索中" : "追加"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              追加すると、おたがいの友だちリストに入りトーク・通話ができます。
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

      {friends.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
          <UserPlus className="size-12 text-muted-foreground/40" />
          <p className="text-base font-bold">まだ友だちがいません</p>
          <p className="text-sm text-muted-foreground">
            相手のIDを聞いて「追加」から検索するか、
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
            <li key={f.id} className="flex items-center gap-3 px-5 py-4">
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
                  <p className="truncate font-semibold">{f.display_name}</p>
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
    </AppShell>
  );
}
