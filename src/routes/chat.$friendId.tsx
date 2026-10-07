import { StaffBadge } from "@/components/StaffBadge";
import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Ban,
  Flag,
  ImagePlus,
  MoreVertical,
  Phone,
  PhoneMissed,
  Reply,
  Send,
  Undo2,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfile, fetchProfiles } from "@/lib/profileCache";
import { forgetMediaUrl } from "@/lib/mediaUrl";
import { useAuth } from "@/hooks/useAuth";
import { useCall } from "@/components/CallProvider";
import { useBlocks } from "@/hooks/useBlocks";
import { ReportDialog } from "@/components/ReportDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChatMedia } from "@/components/ChatMedia";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatTime, initials, type Message, type Profile } from "@/lib/rine";
import { maskProfanity } from "@/lib/profanity";
import { enqueueMessage, getOutboxFor, onOutboxChange, type PendingMessage } from "@/lib/outbox";
import { pairChannelName } from "@/lib/realtime";
import { compressImage } from "@/lib/compress";
import { cn } from "@/lib/utils";
import { uploadToCloudinary, isLateNightJST } from "@/lib/cloudinary";

export const Route = createFileRoute("/chat/$friendId")({
  head: () => ({
    meta: [
      { title: "トークルーム｜RINE" },
      {
        name: "description",
        content: "RINE のトークルーム。リアルタイムでメッセージを送り、そのまま音声・ビデオ通話も。",
      },
      { property: "og:title", content: "トークルーム｜RINE" },
      { property: "og:description", content: "リアルタイムのトークとワンタップ通話。" },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const { friendId } = Route.useParams();
  const { user, loading } = useAuth();
  const { startCall } = useCall();
  const { isBlocked, block, unblock } = useBlocks();
  const blocked = isBlocked(friendId);
  const [friend, setFriend] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const liveRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastSendTimeRef = useRef<number>(0);

  // 送った内容を相手の画面へ即座に届ける（DB 反映を待たない）
  const broadcastMessage = (m: Message) => {
    void liveRef.current?.send({ type: "broadcast", event: "msg", payload: m });
  };

  // オフラインで送信待ちになったメッセージ
  useEffect(() => {
    const sync = () => setPending(getOutboxFor("direct", friendId));
    sync();
    return onOutboxChange(sync);
  }, [friendId]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      const [{ data: p }, { data: msgs }] = await Promise.all([
        fetchProfile(friendId).then((data) => ({ data })),
        supabase
          .from("messages")
          .select("*")
          .or(
            `and(sender_id.eq.${user.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${user.id})`,
          )
          .order("created_at", { ascending: false })
          // 転送量とクラウド利用量を抑えるため、直近の分だけ読み込む
          .limit(80),
      ]);
      if (cancelled) return;
      setFriend((p as Profile) ?? null);
      // 新しい順に取って表示用に昇順へ戻す（転送量を抑える）
      setMessages((((msgs ?? []) as Message[]).slice().reverse()) as Message[]);
    };

    void load();

    const upsert = (m: Message) =>
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));

    const channel = supabase
      .channel(pairChannelName("dm", user.id, friendId), {
        config: { broadcast: { self: false } },
      })
      // 相手が送った瞬間に直接届く経路（DB 経由より速く、通信量も少ない）
      .on("broadcast", { event: "msg" }, ({ payload }) => {
        // 相手端末の時計ズレを避けるため、受け取った時刻で表示する
        upsert({ ...(payload as Message), created_at: new Date().toISOString() });
      })
      .on("broadcast", { event: "del" }, ({ payload }) => {
        const id = (payload as { id?: string })?.id;
        if (!id) return;
        setMessages((prev) => prev.filter((x) => x.id !== id));
      })
      // 念のための保険：自分宛ての受信だけをサーバー側で絞る
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${user.id}`,
        },
        (payload) => {
          const m = payload.new as Message;
          if (m.sender_id !== friendId) return;
          upsert(m);
        },
      )
      // 既読などの更新: 相手宛てに送った自分のメッセージ
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `sender_id=eq.${user.id}`,
        },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
        },
      )
      // 削除は相手からの直接通知（del）で反映。全員分の削除通知は受け取らない
      .subscribe();
    liveRef.current = channel;

    return () => {
      cancelled = true;
      liveRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [user, friendId]);

  // 受信したメッセージを既読にする
  useEffect(() => {
    if (!user) return;
    const unread = messages.filter((m) => m.receiver_id === user.id && !m.read_at);
    if (unread.length === 0) return;
    void supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .in(
        "id",
        unread.map((m) => m.id),
      );
  }, [messages, user]);

  // 過去分はボタンを押したときだけ読み込む（自動では取りに行かないのでコスト増なし）
  const [hasOlder, setHasOlder] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const skipScrollRef = useRef(false);
  const loadOlder = async () => {
    if (!user || messages.length === 0) return;
    setLoadingOlder(true);
    const { data } = await supabase
      .from("messages")
      .select("*")
      .or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${user.id})`,
      )
      .lt("created_at", messages[0]!.created_at)
      .order("created_at", { ascending: false })
      .limit(50);
    const older = ((data ?? []) as Message[]).slice().reverse();
    if (older.length < 50) setHasOlder(false);
    skipScrollRef.current = true;
    setMessages((prev) => [...older.filter((o) => !prev.some((p) => p.id === o.id)), ...prev]);
    setLoadingOlder(false);
  };

  useEffect(() => {
    if (skipScrollRef.current) {
      skipScrollRef.current = false;
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 引用をタップしたら元のメッセージまで移動して光らせる
  const jumpTo = (id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightId(id);
    setTimeout(() => setHighlightId((cur) => (cur === id ? null : cur)), 1600);
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = text.trim();
    if (!content || !user) return;
    if (blocked) {
      toast.error("ブロック中の相手には送信できません");
      return;
    }

    // 深夜帯（JST 1:00〜6:00）の連投制限（3秒間隔）
    if (isLateNightJST()) {
      const now = Date.now();
      if (now - lastSendTimeRef.current < 3000) {
        toast.error("深夜帯（1:00〜6:00）はサーバー負荷軽減のため3秒間隔で送信してください");
        return;
      }
      lastSendTimeRef.current = now;
    }

    setText("");
    const clean = maskProfanity(content);
    const parentId = replyTo?.id ?? null;
    setReplyTo(null);
    if (clean !== content) toast("不適切な言葉は伏字になります");
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      enqueueMessage({ kind: "direct", senderId: user.id, targetId: friendId, content: clean });
      toast("オフラインのため、つながったら送信します");
      return;
    }
    // 先に自分の画面へ表示し、相手へも即配信する（DBの応答を待たない）
    const optimistic: Message = {
      id: crypto.randomUUID(),
      sender_id: user.id,
      receiver_id: friendId,
      content: clean,
      image_url: null,
      media_type: null,
      read_at: null,
      created_at: new Date().toISOString(),
      reply_to_id: parentId,
    };
    setMessages((prev) => [...prev, optimistic]);
    broadcastMessage(optimistic);
    // 保存は裏で行う。失敗したら送信待ちへ
    const { error } = await supabase.from("messages").insert({
      id: optimistic.id,
      sender_id: user.id,
      receiver_id: friendId,
      content: clean,
      reply_to_id: parentId,
    });
    if (error) {
      setMessages((prev) => prev.filter((x) => x.id !== optimistic.id));
      enqueueMessage({ kind: "direct", senderId: user.id, targetId: friendId, content: clean });
      toast("送信できなかったので、送信待ちに入れました");
    }
  };

  const pickMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    if (blocked) {
      toast.error("ブロック中の相手には送信できません");
      return;
    }
    const isVideo = file.type.startsWith("video/");
    if (!file.type.startsWith("image/") && !isVideo) {
      toast.error("画像または動画を選んでください");
      return;
    }
    setUploading(true);
    // 画像はアップロード前に自動圧縮してサイズを節約
    const upload = isVideo ? file : await compressImage(file);
    const limit = isVideo ? 10 : 5;
    if (upload.size > limit * 1024 * 1024) {
      setUploading(false);
      toast.error(`${isVideo ? "動画" : "画像"}は${limit}MBまでです`);
      return;
    }

    // Cloudinaryに直接アップロード（Supabaseストレージの転送量を完全回避）
    let path = "";
    try {
      path = await uploadToCloudinary(upload);
    } catch {
      setUploading(false);
      toast.error("アップロードできませんでした");
      return;
    }

    const parentId = replyTo?.id ?? null;
    setReplyTo(null);
    const optimistic: Message = {
      id: crypto.randomUUID(),
      sender_id: user.id,
      receiver_id: friendId,
      content: "",
      image_url: path,
      media_type: isVideo ? "video" : "image",
      read_at: null,
      created_at: new Date().toISOString(),
      reply_to_id: parentId,
    };
    setUploading(false);
    // 即表示・即配信し、保存は裏で行う
    setMessages((prev) => [...prev, optimistic]);
    broadcastMessage(optimistic);
    void supabase
      .from("messages")
      .insert({
        id: optimistic.id,
        sender_id: user.id,
        receiver_id: friendId,
        content: "",
        image_url: path,
        media_type: isVideo ? "video" : "image",
        reply_to_id: parentId,
      })
      .then(({ error }) => {
        if (error) {
          setMessages((prev) => prev.filter((x) => x.id !== optimistic.id));
          toast.error("送信できませんでした");
        }
      });
  };

  const unsend = async (m: Message) => {
    if (!window.confirm("このメッセージを完全に削除します。元に戻せません。よろしいですか？")) return;
    // Supabaseストレージ保存の古い画像の場合のみStorage削除（Cloudinary URLはスキップ）
    if (m.image_url) {
      if (!m.image_url.startsWith("http://") && !m.image_url.startsWith("https://")) {
        const { error: fileError } = await supabase.storage.from("chat-images").remove([m.image_url]);
        if (fileError) {
          toast.error("ファイルを削除できませんでした");
          return;
        }
      }
      forgetMediaUrl(m.image_url);
    }
    const { error } = await supabase.from("messages").delete().eq("id", m.id);
    if (error) {
      toast.error("送信を取り消せませんでした");
      return;
    }
    if (replyTo?.id === m.id) setReplyTo(null);
    setMessages((prev) =>
      prev.filter((x) => x.id !== m.id).map((x) => (x.reply_to_id === m.id ? { ...x, reply_to_id: null } : x)),
    );
    void liveRef.current?.send({ type: "broadcast", event: "del", payload: { id: m.id } });
    toast.success("完全に削除しました");
  };

  if (loading) return null;

  return (
    <div className="mx-auto flex h-screen w-full max-w-lg flex-col bg-chat">
      <header className="flex items-center gap-2 border-b border-border bg-background/95 px-3 py-3 backdrop-blur">
        <Button asChild variant="ghost" size="icon" aria-label="戻る">
          <Link to="/">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <Link
          to="/friend/$friendId"
          params={{ friendId }}
          className="flex min-w-0 flex-1 items-center gap-2"
        >
          <Avatar className="size-9">
            <AvatarImage src={friend?.avatar_url ?? undefined} alt={friend?.display_name ?? ""} />
            <AvatarFallback className="bg-brand-gradient text-xs text-primary-foreground">
              {initials(friend?.display_name ?? "?")}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            <span className="block truncate font-semibold leading-tight">
              {friend?.display_name ?? "..."}
              <StaffBadge userId={friend?.id} />
            </span>
            <span className="block font-mono text-[11px] leading-tight text-muted-foreground">
              ID: {friend?.friend_code ?? "········"}
            </span>
          </span>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          aria-label="音声通話"
          disabled={!friend || blocked}
          onClick={() => friend && startCall(friend, false)}
        >
          <Phone className="size-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="ビデオ通話"
          disabled={!friend || blocked}
          onClick={() => friend && startCall(friend, true)}
        >
          <Video className="size-5" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="メニュー">
              <MoreVertical className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={async () => {
                if (blocked) {
                  if (await unblock(friendId)) toast.success("ブロックを解除しました");
                } else if (await block(friendId)) {
                  toast.success("ブロックしました");
                }
              }}
            >
              <Ban className="mr-2 size-4" />
              {blocked ? "ブロックを解除" : "ブロックする"}
            </DropdownMenuItem>
            {friend && (
              <ReportDialog
                targetId={friend.id}
                targetName={friend.display_name}
                trigger={
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <Flag className="mr-2 size-4" />
                    通報する
                  </DropdownMenuItem>
                }
              />
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-foreground/50">
            メッセージを送ってトークを始めましょう
          </p>
        )}

        {hasOlder && messages.length >= 80 && (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" disabled={loadingOlder} onClick={loadOlder}>
              {loadingOlder ? "読み込み中…" : "過去のメッセージを見る"}
            </Button>
          </div>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === user?.id;
          if (m.media_type === "missed_call") {
            const isVideoCall = m.content === "video";
            return (
              <div key={m.id} className="flex justify-center py-1">
                <span className="flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1 text-[11px] text-muted-foreground shadow-soft">
                  <PhoneMissed className="size-3.5 text-destructive" />
                  {formatTime(m.created_at)} {isVideoCall ? "ビデオ通話" : "音声通話"}の
                  {mine ? "不在着信（応答なし）" : "不在着信"}
                </span>
              </div>
            );
          }
          const parent = m.reply_to_id ? messages.find((x) => x.id === m.reply_to_id) : null;
          return (
            <div
              key={m.id}
              id={`msg-${m.id}`}
              className={cn(
                "flex items-end gap-1 rounded-2xl transition-colors",
                mine && "flex-row-reverse",
                highlightId === m.id && "bg-primary/10",
              )}
            >
              <div className="max-w-[72%]">
                {parent && (
                  <button
                    type="button"
                    onClick={() => jumpTo(parent.id)}
                    className={cn(
                      "mb-1 block w-full max-w-full rounded-xl border-l-2 border-primary/60 bg-background/70 px-2.5 py-1.5 text-left",
                      mine && "border-l-0 border-r-2",
                    )}
                  >
                    <span className="block truncate text-[10px] font-semibold text-primary">
                      {parent.sender_id === user?.id ? "自分" : (friend?.display_name ?? "相手")} への返信
                    </span>
                    <span className="block truncate text-[11px] text-foreground/60">
                      {parent.image_url
                        ? parent.media_type === "video"
                          ? "動画"
                          : "写真"
                        : parent.content}
                    </span>
                  </button>
                )}
                <div
                  className={cn(
                    "shadow-soft",
                    m.image_url
                      ? "overflow-hidden rounded-2xl"
                      : cn(
                          "rounded-2xl px-3.5 py-2 text-sm",
                          mine ? "bubble-out rounded-br-sm" : "bubble-in rounded-bl-sm",
                        ),
                  )}
                >
                  {m.image_url ? (
                    <ChatMedia path={m.image_url} mediaType={m.media_type} />
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  )}
                </div>
              </div>
              <span
                className={cn(
                  "flex flex-col pb-1 text-[10px] text-foreground/50",
                  mine ? "items-end" : "items-start",
                )}
              >
                {mine && m.read_at && <span className="text-foreground/60">既読</span>}
                {formatTime(m.created_at)}
              </span>
              <button
                type="button"
                aria-label="このメッセージに返信"
                onClick={() => setReplyTo(m)}
                className="mb-1 rounded-full p-1 text-foreground/30 transition-colors hover:bg-foreground/10 hover:text-primary"
              >
                <Reply className="size-3.5" />
              </button>
              {mine && (
                <button
                  type="button"
                  aria-label="送信を取り消す"
                  onClick={() => void unsend(m)}
                  className="mb-1 rounded-full p-1 text-foreground/30 transition-colors hover:bg-foreground/10 hover:text-destructive"
                >
                  <Undo2 className="size-3.5" />
                </button>
              )}
            </div>
          );
        })}

        {pending.map((p) => (
          <div key={p.id} className="flex flex-row-reverse items-end gap-1 opacity-60">
            <div className="bubble-out max-w-[72%] rounded-2xl rounded-br-sm px-3.5 py-2 text-sm shadow-soft">
              <p className="whitespace-pre-wrap break-words">{p.content}</p>
            </div>
            <span className="pb-1 text-[10px] text-foreground/50">送信待ち</span>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {blocked ? (
        <div className="border-t border-border bg-background px-5 py-4 text-center text-sm text-muted-foreground">
          この相手をブロック中です。メッセージの送受信はできません。
          <button
            type="button"
            className="ml-1 font-semibold text-primary hover:underline"
            onClick={async () => {
              if (await unblock(friendId)) toast.success("ブロックを解除しました");
            }}
          >
            解除する
          </button>
        </div>
      ) : (
        <>
          {replyTo && (
            <div className="flex items-center gap-2 border-t border-border bg-muted/60 px-3 py-2">
              <Reply className="size-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-primary">
                  {replyTo.sender_id === user?.id ? "自分の" : `${friend?.display_name ?? "相手"} さんの`}
                  メッセージに返信
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {replyTo.image_url
                    ? replyTo.media_type === "video"
                      ? "動画"
                      : "写真"
                    : replyTo.content}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="返信をやめる"
                onClick={() => setReplyTo(null)}
              >
                <X className="size-4" />
              </Button>
            </div>
          )}
          <form
            onSubmit={send}
            className="flex items-center gap-2 border-t border-border bg-background px-3 py-3"
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={pickMedia}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-full"
              aria-label="画像・動画を送る"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus className="size-5" />
            </Button>
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="メッセージを入力"
              className="rounded-full"
            />

            <Button type="submit" variant="brand" size="icon" className="rounded-full" aria-label="送信">
              <Send className="size-4" />
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
