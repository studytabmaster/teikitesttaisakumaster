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
import { compressImage, makeAvatarDataUrl } from "@/lib/compress";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { withTimeout } from "@/lib/compress";
import { cn } from "@/lib/utils";
import { useRineTheme } from "@/lib/theme";

export const Route = createFileRoute("/chat/$friendId")({
  head: () => ({
    meta: [
      { title: "トークルーム｜RINE" },
      {
        name: "description",
        content:
          "RINE のトークルーム。友だちとリアルタイムのメッセージ送受信、写真・動画の共有、音声・ビデオ通話ができます。",
      },
      { property: "og:title", content: "トークルーム｜RINE" },
      { property: "og:description", content: "リアルタイムのトークとワンタップ通話。" },
    ],
  }),
  component: ChatPage,
});

function formatDatePill(iso: string): string {
  const d = new Date(iso);
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const date = d.getDate();
  const day = weekdays[d.getDay()];
  return `${year}年${month}月${date}日(${day})`;
}

function isSameDay(aIso: string, bIso: string): boolean {
  const a = new Date(aIso);
  const b = new Date(bIso);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

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
  const [theme] = useRineTheme();
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const liveRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastSendTimeRef = useRef<number>(0);

  const isLineTheme = theme === "line";

  const broadcastMessage = (m: Message) => {
    void liveRef.current?.send({ type: "broadcast", event: "msg", payload: m });
  };

  useEffect(() => {
    const sync = () => setPending(getOutboxFor("direct", friendId));
    sync();
    return onOutboxChange(sync);
  }, [friendId]);

  useEffect(() => {
    if (!user) return;

    fetchProfile(friendId).then((p) => {
      if (p) setFriend(p);
    });

    supabase
      .from("messages")
      .select("*")
      .or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${user.id})`,
      )
      .order("created_at", { ascending: false })
      .limit(80)
      .then(({ data }) => {
        if (data) {
          const list = (data as Message[]).reverse();
          setMessages(list);
          const otherSenderIds = Array.from(
            new Set(list.map((m) => m.sender_id).filter((id) => id !== user.id)),
          );
          if (otherSenderIds.length > 0) {
            void fetchProfiles(otherSenderIds);
          }
        }
      });

    void supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("sender_id", friendId)
      .eq("receiver_id", user.id)
      .is("read_at", null);

    const channelName = pairChannelName(user.id, friendId);
    const channel = supabase.channel(channelName);
    liveRef.current = channel;

    channel
      .on("broadcast", { event: "msg" }, ({ payload }) => {
        const m = payload as Message;
        if (
          (m.sender_id === user.id && m.receiver_id === friendId) ||
          (m.sender_id === friendId && m.receiver_id === user.id)
        ) {
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          if (m.sender_id === friendId) {
            void supabase
              .from("messages")
              .update({ read_at: new Date().toISOString() })
              .eq("id", m.id);
            void liveRef.current?.send({
              type: "broadcast",
              event: "read",
              payload: { ids: [m.id], read_at: new Date().toISOString() },
            });
          }
        }
      })
      .on("broadcast", { event: "read" }, ({ payload }) => {
        const { ids, read_at } = payload as { ids: string[]; read_at: string };
        const set = new Set(ids);
        setMessages((prev) =>
          prev.map((x) => (set.has(x.id) ? { ...x, read_at: x.read_at ?? read_at } : x)),
        );
      })
      .on("broadcast", { event: "del" }, ({ payload }) => {
        const { id } = payload as { id: string };
        setMessages((prev) =>
          prev.filter((x) => x.id !== id).map((x) => (x.reply_to_id === id ? { ...x, reply_to_id: null } : x)),
        );
      })
      .subscribe();

    return () => {
      liveRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [user, friendId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  const jumpTo = (id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightId(id);
      setTimeout(() => setHighlightId((cur) => (cur === id ? null : cur)), 1500);
    } else {
      toast.info("返信先のメッセージは見つかりませんでした");
    }
  };

  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);

  const loadOlder = async () => {
    if (!user || loadingOlder || !messages.length) return;
    setLoadingOlder(true);
    const oldest = messages[0].created_at;
    const { data } = await supabase
      .from("messages")
      .select("*")
      .or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${user.id})`,
      )
      .lt("created_at", oldest)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!data || data.length === 0) {
      setHasOlder(false);
    } else {
      const older = (data as Message[]).reverse();
      setMessages((prev) => [...older, ...prev]);
    }
    setLoadingOlder(false);
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !text.trim() || blocked) return;

    const now = Date.now();
    if (now - lastSendTimeRef.current < 200) {
      return;
    }
    lastSendTimeRef.current = now;

    const content = maskProfanity(text.trim());
    const parentId = replyTo?.id ?? null;
    setText("");
    setReplyTo(null);

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const optimistic: Message = {
      id: tempId,
      sender_id: user.id,
      receiver_id: friendId,
      content,
      image_url: null,
      media_type: null,
      reply_to_id: parentId,
      read_at: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    broadcastMessage(optimistic);

    if (!navigator.onLine) {
      enqueueMessage({
        kind: "direct",
        targetId: friendId,
        content,
        replyToId: parentId,
      });
      return;
    }

    const { data, error } = await supabase
      .from("messages")
      .insert({
        sender_id: user.id,
        receiver_id: friendId,
        content,
        reply_to_id: parentId,
      })
      .select()
      .single();

    if (error) {
      setMessages((prev) => prev.filter((x) => x.id !== tempId));
      enqueueMessage({
        kind: "direct",
        targetId: friendId,
        content,
        replyToId: parentId,
      });
      toast.error("送信に失敗しました（再接続時に自動送信します）");
      return;
    }

    if (data) {
      setMessages((prev) => prev.map((x) => (x.id === tempId ? (data as Message) : x)));
    }
  };

  const sendMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user || blocked) return;

    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isImage && !isVideo) {
      toast.error("画像か動画を選んでください");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast.error("ファイルは 20MB 以内にしてください");
      return;
    }

    setUploading(true);
    let path = "";

    if (isVideo) {
      const ext = file.name.split(".").pop() || "mp4";
      path = `${user.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("chat-images").upload(path, file);
      if (uploadError) {
        toast.error("動画のアップロードに失敗しました");
        setUploading(false);
        return;
      }
    } else {
      try {
        let uploadPromise: Promise<string>;
        if (file.size <= 800 * 1024) {
          uploadPromise = makeAvatarDataUrl(file).then((dataUrl) => uploadToCloudinary(dataUrl, "chat"));
        } else {
          uploadPromise = compressImage(file).then((blob) => {
            const ext = "jpg";
            const storagePath = `${user.id}/${Date.now()}.${ext}`;
            return supabase.storage
              .from("chat-images")
              .upload(storagePath, blob, { contentType: "image/jpeg" })
              .then(({ error: uploadError }) => {
                if (uploadError) throw uploadError;
                return storagePath;
              });
          });
        }
        path = await withTimeout(uploadPromise, 8000);
      } catch {
        try {
          const fallbackPath = `${user.id}/${Date.now()}.${file.name.split(".").pop() || "jpg"}`;
          const { error: fallbackErr } = await supabase.storage.from("chat-images").upload(fallbackPath, file);
          if (fallbackErr) throw fallbackErr;
          path = fallbackPath;
        } catch {
          toast.error("画像のアップロードに失敗しました");
          setUploading(false);
          return;
        }
      }
    }

    setUploading(false);
    const parentId = replyTo?.id ?? null;
    setReplyTo(null);

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const optimistic: Message = {
      id: tempId,
      sender_id: user.id,
      receiver_id: friendId,
      content: "",
      image_url: path,
      media_type: isVideo ? "video" : "image",
      reply_to_id: parentId,
      read_at: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    broadcastMessage(optimistic);

    supabase
      .from("messages")
      .insert({
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
    <div
      className={cn(
        "mx-auto flex h-screen w-full max-w-lg flex-col transition-colors",
        isLineTheme ? "bg-[#849ebf]" : "bg-chat",
      )}
    >
      <header
        className={cn(
          "flex items-center gap-2 border-b border-border px-3 py-3 backdrop-blur",
          isLineTheme ? "bg-[#849ebf]/95 text-white border-white/20" : "bg-background/95",
        )}
      >
        <Button asChild variant="ghost" size="icon" aria-label="戻る" className={isLineTheme ? "text-white hover:bg-white/10" : ""}>
          <Link to="/">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <Link
          to="/friend/$friendId"
          params={{ friendId }}
          className="flex min-w-0 flex-1 items-center gap-2"
        >
          <Avatar className="size-9 border border-white/20">
            <AvatarImage src={friend?.avatar_url ?? undefined} alt={friend?.display_name ?? ""} />
            <AvatarFallback className="bg-brand-gradient text-xs text-primary-foreground">
              {initials(friend?.display_name ?? "?")}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            <span className={cn("block truncate font-semibold leading-tight", isLineTheme && "text-white")}>
              {friend?.display_name ?? "..."}
              <StaffBadge userId={friend?.id} />
            </span>
            <span className={cn("block font-mono text-[11px] leading-tight", isLineTheme ? "text-white/80" : "text-muted-foreground")}>
              ID: {friend?.friend_code ?? "········"}
            </span>
          </span>
        </Link>

        <Button
          variant="ghost"
          size="icon"
          aria-label="音声通話を開始"
          disabled={blocked}
          className={isLineTheme ? "text-white hover:bg-white/10" : ""}
          onClick={() => {
            if (!friend) return;
            startCall(friend.id, friend.display_name, friend.avatar_url, false);
          }}
        >
          <Phone className="size-5 text-primary" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="ビデオ通話を開始"
          disabled={blocked}
          className={isLineTheme ? "text-white hover:bg-white/10" : ""}
          onClick={() => {
            if (!friend) return;
            startCall(friend.id, friend.display_name, friend.avatar_url, true);
          }}
        >
          <Video className="size-5 text-primary" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="メニュー" className={isLineTheme ? "text-white hover:bg-white/10" : ""}>
              <MoreVertical className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to="/friend/$friendId" params={{ friendId }}>
                プロフィールを見る
              </Link>
            </DropdownMenuItem>
            <ReportDialog
              targetUserId={friendId}
              targetUserName={friend?.display_name ?? "ユーザー"}
              trigger={
                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                  <Flag className="mr-2 size-4 text-destructive" />
                  通報する
                </DropdownMenuItem>
              }
            />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={async () => {
                if (blocked) {
                  if (await unblock(friendId)) toast.success("ブロックを解除しました");
                } else {
                  if (
                    window.confirm(
                      `${friend?.display_name ?? "この相手"}をブロックしますか？メッセージの送受信ができなくなります。`,
                    )
                  ) {
                    if (await block(friendId)) toast.success("ブロックしました");
                  }
                }
              }}
            >
              <Ban className="mr-2 size-4" />
              {blocked ? "ブロックを解除" : "ブロックする"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <p className={cn("py-10 text-center text-sm", isLineTheme ? "text-white/80" : "text-foreground/50")}>
            メッセージを送ってトークを始めましょう
          </p>
        )}

        {hasOlder && messages.length >= 80 && (
          <div className="flex justify-center">
            <Button
              variant={isLineTheme ? "secondary" : "outline"}
              size="sm"
              disabled={loadingOlder}
              onClick={loadOlder}
              className={isLineTheme ? "bg-black/30 text-white hover:bg-black/40 border-0" : ""}
            >
              {loadingOlder ? "読み込み中…" : "過去のメッセージを見る"}
            </Button>
          </div>
        )}

        {messages.map((m, index) => {
          const mine = m.sender_id === user?.id;
          const prev = index > 0 ? messages[index - 1] : null;
          const showDatePill = !prev || !isSameDay(prev.created_at, m.created_at);

          if (m.media_type === "missed_call") {
            const isVideoCall = m.content === "video";
            return (
              <div key={m.id}>
                {showDatePill && (
                  <div className="flex justify-center my-3">
                    <span className="rounded-full bg-black/25 px-3 py-1 text-xs font-medium text-white shadow-sm">
                      {formatDatePill(m.created_at)}
                    </span>
                  </div>
                )}
                <div className="flex justify-center py-1">
                  <span className="flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1 text-[11px] text-muted-foreground shadow-soft">
                    <PhoneMissed className="size-3.5 text-destructive" />
                    {formatTime(m.created_at)} {isVideoCall ? "ビデオ通話" : "音声通話"}の
                    {mine ? "不在着信（応答なし）" : "不在着信"}
                  </span>
                </div>
              </div>
            );
          }

          const parent = m.reply_to_id ? messages.find((x) => x.id === m.reply_to_id) : null;

          return (
            <div key={m.id}>
              {showDatePill && (
                <div className="flex justify-center my-3">
                  <span className="rounded-full bg-black/25 px-3 py-1 text-xs font-medium text-white shadow-sm">
                    {formatDatePill(m.created_at)}
                  </span>
                </div>
              )}
              <div
                id={`msg-${m.id}`}
                className={cn(
                  "flex items-end gap-1 rounded-2xl transition-colors",
                  mine && "flex-row-reverse",
                  highlightId === m.id && "bg-primary/10",
                )}
              >
                {!mine && (
                  <Avatar className="mb-1 size-8 shrink-0">
                    <AvatarImage src={friend?.avatar_url ?? undefined} alt={friend?.display_name ?? ""} />
                    <AvatarFallback className="bg-brand-gradient text-[10px] text-primary-foreground">
                      {initials(friend?.display_name ?? "?")}
                    </AvatarFallback>
                  </Avatar>
                )}

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
                            isLineTheme
                              ? mine
                                ? "bg-[#85e24a] text-[#111111] font-medium rounded-br-sm"
                                : "bg-white text-[#111111] font-medium rounded-bl-sm"
                              : mine
                                ? "bubble-out rounded-br-sm"
                                : "bubble-in rounded-bl-sm",
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
                    "flex flex-col pb-1 text-[10px]",
                    isLineTheme ? "text-white/80" : "text-foreground/50",
                    mine ? "items-end" : "items-start",
                  )}
                >
                  {mine && m.read_at && (
                    <span className={cn(isLineTheme ? "text-white font-bold" : "text-foreground/60")}>既読</span>
                  )}
                  {formatTime(m.created_at)}
                </span>

                <button
                  type="button"
                  aria-label="このメッセージに返信"
                  onClick={() => setReplyTo(m)}
                  className={cn(
                    "mb-1 rounded-full p-1 transition-colors",
                    isLineTheme
                      ? "text-white/50 hover:bg-white/10 hover:text-white"
                      : "text-foreground/30 hover:bg-foreground/10 hover:text-primary",
                  )}
                >
                  <Reply className="size-3.5" />
                </button>
                {mine && (
                  <button
                    type="button"
                    aria-label="送信を取り消す"
                    onClick={() => void unsend(m)}
                    className={cn(
                      "mb-1 rounded-full p-1 transition-colors",
                      isLineTheme
                        ? "text-white/50 hover:bg-white/10 hover:text-red-200"
                        : "text-foreground/30 hover:bg-foreground/10 hover:text-destructive",
                    )}
                  >
                    <Undo2 className="size-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {pending.map((p) => (
          <div key={p.id} className="flex flex-row-reverse items-end gap-1 opacity-60">
            <div
              className={cn(
                "max-w-[72%] rounded-2xl rounded-br-sm px-3.5 py-2 text-sm shadow-soft",
                isLineTheme ? "bg-[#85e24a] text-black font-medium" : "bubble-out",
              )}
            >
              <p className="whitespace-pre-wrap break-words">{p.content}</p>
            </div>
            <span className={cn("pb-1 text-[10px]", isLineTheme ? "text-white/70" : "text-foreground/50")}>
              送信待ち
            </span>
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
            <div className="flex items-center justify-between border-t border-border bg-muted/60 px-4 py-2 text-xs">
              <div className="min-w-0 flex-1">
                <span className="font-semibold text-primary">
                  {replyTo.sender_id === user?.id ? "自分" : (friend?.display_name ?? "相手")} のメッセージに返信中
                </span>
                <p className="truncate text-muted-foreground">
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
                className="size-6"
                onClick={() => setReplyTo(null)}
              >
                <X className="size-4" />
              </Button>
            </div>
          )}

          <form
            onSubmit={send}
            className="flex items-center gap-2 border-t border-border bg-background/95 px-3 py-2 backdrop-blur"
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={sendMedia}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              aria-label="画像・動画を送信"
            >
              <ImagePlus className="size-5" />
            </Button>
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={uploading ? "送信中…" : "メッセージを入力"}
              disabled={uploading}
              className="flex-1 rounded-full bg-muted/50 text-sm"
              maxLength={2000}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!text.trim() || uploading}
              className="size-9 rounded-full bg-brand-gradient text-primary-foreground"
              aria-label="送信"
            >
              <Send className="size-4" />
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
