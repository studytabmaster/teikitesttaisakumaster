import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Ban, Check, Clock, Flag, MessageSquare, Phone, UserCheck, UserMinus, UserPlus, Video, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCall } from "@/components/CallProvider";
import { useBlocks } from "@/hooks/useBlocks";
import { ReportDialog } from "@/components/ReportDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { initials, type Profile } from "@/lib/rine";

export const Route = createFileRoute("/friend/$friendId")({
  head: () => ({
    meta: [
      { title: "プロフィール｜RINE" },
      {
        name: "description",
        content: "RINE のユーザープロフィール。ひとことやフレンドIDを確認し、フレンド申請やトーク、通話を開始できます。",
      },
      { property: "og:title", content: "プロフィール｜RINE" },
      { property: "og:description", content: "プロフィールからフレンド申請やトークを開始。" },
    ],
  }),
  component: FriendProfilePage,
});

function FriendProfilePage() {
  const { friendId } = Route.useParams();
  const { user } = useAuth();
  const { startCall } = useCall();
  const navigate = useNavigate();

  const [friend, setFriend] = useState<Profile | null>(null);
  const [isFriend, setIsFriend] = useState(false);
  const [incomingReqId, setIncomingReqId] = useState<string | null>(null);
  const [outgoingReqId, setOutgoingReqId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { isBlocked, block, unblock } = useBlocks();
  const blocked = isBlocked(friendId);
  const isMe = user?.id === friendId;

  const loadStatus = async () => {
    if (!user || !friendId) return;

    // プロフィール情報取得
    const { data: prof } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", friendId)
      .maybeSingle();
    setFriend((prof as Profile) ?? null);

    if (user.id === friendId) return;

    // 友だち状態の判定
    const { data: friendship } = await supabase
      .from("friendships")
      .select("friend_id")
      .eq("user_id", user.id)
      .eq("friend_id", friendId)
      .maybeSingle();
    setIsFriend(Boolean(friendship));

    // 相手から申請が来ているか？
    const { data: inReq } = await supabase
      .from("friend_requests")
      .select("id")
      .eq("sender_id", friendId)
      .eq("receiver_id", user.id)
      .eq("status", "pending")
      .maybeSingle();
    setIncomingReqId(inReq?.id ?? null);

    // 自分から申請中か？
    const { data: outReq } = await supabase
      .from("friend_requests")
      .select("id")
      .eq("sender_id", user.id)
      .eq("receiver_id", friendId)
      .eq("status", "pending")
      .maybeSingle();
    setOutgoingReqId(outReq?.id ?? null);
  };

  useEffect(() => {
    void loadStatus();
  }, [user, friendId]);

  // フレンド申請送信
  const handleSendRequest = async () => {
    if (!friend) return;
    setBusy(true);
    const { error } = await supabase.rpc("send_friend_request_by_id", { _target_id: friend.id });
    setBusy(false);
    if (error) {
      toast.error(error.message.replace(/^.*?:\s*/, ""));
      return;
    }
    toast.success("フレンド申請を送信しました！");
    void loadStatus();
  };

  // 申請承認
  const handleAccept = async () => {
    if (!incomingReqId) return;
    setBusy(true);
    const { error } = await supabase.rpc("accept_friend_request", { _request_id: incomingReqId });
    setBusy(false);
    if (error) {
      toast.error("承認できませんでした");
      return;
    }
    toast.success("友だちになりました！");
    void loadStatus();
  };

  // 申請拒否
  const handleReject = async () => {
    if (!incomingReqId) return;
    setBusy(true);
    await supabase.rpc("reject_friend_request", { _request_id: incomingReqId });
    setBusy(false);
    toast.info("申請をお断りしました");
    void loadStatus();
  };

  // 申請取消
  const handleCancel = async () => {
    if (!outgoingReqId) return;
    setBusy(true);
    await supabase.rpc("cancel_friend_request", { _request_id: outgoingReqId });
    setBusy(false);
    toast.info("申請を取り消しました");
    void loadStatus();
  };

  // 友だち削除
  const remove = async () => {
    if (!user) return;
    await supabase.from("friendships").delete().eq("user_id", user.id).eq("friend_id", friendId);
    toast.success("友だちから削除しました");
    void navigate({ to: "/friends" });
  };

  return (
    <div className="mx-auto min-h-screen w-full max-w-lg bg-background">
      <div className="relative bg-brand-gradient px-6 pb-10 pt-4 text-center text-primary-foreground">
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="absolute left-3 top-3 text-primary-foreground hover:bg-white/20"
          aria-label="戻る"
        >
          <Link to="/friends">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <Avatar className="mx-auto mt-6 size-28 border-4 border-white/30">
          <AvatarImage src={friend?.avatar_url ?? undefined} alt={friend?.display_name ?? ""} />
          <AvatarFallback className="bg-white/20 text-3xl text-primary-foreground">
            {initials(friend?.display_name ?? "?")}
          </AvatarFallback>
        </Avatar>
        <h1 className="mt-4 text-2xl font-bold">{friend?.display_name ?? "..."}</h1>
        <p className="mt-1 text-sm opacity-80">
          {friend?.status_message || "ひとことは設定されていません"}
        </p>
        <p className="mt-3 font-mono text-xs opacity-70">ID: {friend?.friend_code ?? "········"}</p>
      </div>

      {/* アクションボタン（状態に応じて切り替え） */}
      <div className="p-6">
        {isMe ? (
          <Button asChild variant="outline" className="w-full rounded-2xl">
            <Link to="/profile">マイプロフィールを編集</Link>
          </Button>
        ) : isFriend ? (
          <div className="grid grid-cols-3 gap-3">
            <Button asChild variant="secondary" className="h-20 flex-col rounded-2xl">
              <Link to="/chat/$friendId" params={{ friendId }}>
                <MessageSquare className="size-6" />
                <span className="text-xs">トーク</span>
              </Link>
            </Button>
            <Button
              variant="secondary"
              className="h-20 flex-col rounded-2xl"
              disabled={!friend || blocked}
              onClick={() => friend && startCall(friend, false)}
            >
              <Phone className="size-6" />
              <span className="text-xs">音声通話</span>
            </Button>
            <Button
              variant="secondary"
              className="h-20 flex-col rounded-2xl"
              disabled={!friend || blocked}
              onClick={() => friend && startCall(friend, true)}
            >
              <Video className="size-6" />
              <span className="text-xs">ビデオ通話</span>
            </Button>
          </div>
        ) : incomingReqId ? (
          <div className="space-y-3 rounded-2xl border bg-card p-4 text-center">
            <p className="text-sm font-semibold">このユーザーからフレンド申請が届いています</p>
            <div className="flex justify-center gap-2">
              <Button variant="brand" className="rounded-full px-6" disabled={busy} onClick={handleAccept}>
                <Check className="mr-1.5 size-4" />
                承認する
              </Button>
              <Button variant="ghost" className="rounded-full text-muted-foreground" disabled={busy} onClick={handleReject}>
                お断りする
              </Button>
            </div>
          </div>
        ) : outgoingReqId ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border bg-muted/40 p-4 text-center">
            <p className="flex items-center text-sm font-medium text-muted-foreground">
              <Clock className="mr-1.5 size-4" />
              フレンド申請を送信済み（承認待ち）
            </p>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-destructive" disabled={busy} onClick={handleCancel}>
              申請を取り消す
            </Button>
          </div>
        ) : (
          <Button
            variant="brand"
            className="h-12 w-full rounded-2xl text-base shadow-soft"
            disabled={busy || blocked}
            onClick={handleSendRequest}
          >
            <UserPlus className="mr-2 size-5" />
            フレンド申請を送る
          </Button>
        )}
      </div>

      <div className="px-6 pb-2">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <p className="text-xs text-muted-foreground">識別フレンドID（なりすまし対策）</p>
          <p className="mt-1 font-mono text-xl font-bold tracking-[0.25em]">
            {friend?.friend_code ?? "········"}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            このIDは登録時に自動で割り当てられ、本人でも変更できません。表示名が同じ相手でも、このIDが合っていれば本人です。
          </p>
        </div>
      </div>

      {!isMe && (
        <div className="space-y-1 px-6 pb-8">
          {blocked && (
            <p className="rounded-2xl bg-muted px-4 py-3 text-center text-xs text-muted-foreground">
              この相手をブロック中です。メッセージの送受信と通話はできません。
            </p>
          )}
          <Button
            variant="ghost"
            className="w-full"
            onClick={async () => {
              if (!friend) return;
              if (blocked) {
                if (await unblock(friend.id)) toast.success("ブロックを解除しました");
              } else if (await block(friend.id)) {
                toast.success("ブロックしました");
              }
            }}
          >
            <Ban className="mr-1 size-4" />
            {blocked ? "ブロックを解除" : "ブロックする"}
          </Button>
          {friend && (
            <ReportDialog
              targetId={friend.id}
              targetName={friend.display_name}
              trigger={
                <Button variant="ghost" className="w-full">
                  <Flag className="mr-1 size-4" />
                  通報する
                </Button>
              }
            />
          )}
          {isFriend && (
            <Button variant="ghost" className="w-full text-destructive" onClick={remove}>
              <UserMinus className="mr-1 size-4" />
              友だちから削除
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
