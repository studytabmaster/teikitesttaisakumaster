import { StaffBadge } from "@/components/StaffBadge";
import { useCallback, useEffect, useRef, useState } from "react";
import { uploadToCloudinary, isLateNightJST } from "@/lib/cloudinary";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Ban,
  Check,
  Link2,
  Flag,
  ImagePlus,
  LogOut,
  Phone,
  Reply,
  Send,
  Settings,
  Trash2,
  Undo2,
  UserPlus,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfile, fetchProfiles } from "@/lib/profileCache";
import { forgetMediaUrl } from "@/lib/mediaUrl";
import { deleteGroupMessage } from "./group.functions";
import { useAuth } from "@/hooks/useAuth";
import { ChatMedia } from "@/components/ChatMedia";
import { ReportDialog } from "@/components/ReportDialog";
import { useBlocks } from "@/hooks/useBlocks";
import { useRineTheme } from "@/lib/theme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  formatTime,
  initials,
  type Group,
  type GroupMessage,
  type GroupRead,
  type JoinRequest,
  type Profile,
} from "@/lib/rine";
import { maskProfanity } from "@/lib/profanity";
import { enqueueMessage } from "@/lib/outbox";
import { compressImage, makeAvatarDataUrl } from "@/lib/compress";
import { checkProfileAvatarSafety } from "./moderation.functions";
import { useGroupCall } from "@/components/GroupCallProvider";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/group/$groupId")({
  head: () => ({
    meta: [
      { title: "グループトークルーム｜RINE" },
      {
        name: "description",
        content:
          "RINE のグループトークルーム。メンバー全員とリアルタイムでメッセージや画像を共有できます。",
      },
      { property: "og:title", content: "グループトークルーム｜RINE" },
      {
        property: "og:description",
        content: "メンバー全員とリアルタイムでトーク。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GroupChatPage,
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

function hasAbnormalCharacterFlood(content: string): boolean {
  if (!content) return false;

  const invisibleMatches = content.match(
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g,
  );
  if (invisibleMatches && invisibleMatches.length >= 8) {
    return true;
  }

  if (/(.)\1{19,}/u.test(content)) {
    return true;
  }

  if (/(.{1,4})\1{9,}/u.test(content)) {
    return true;
  }

  const visible = content.replace(/\s/g, "");
  if (visible.length >= 30) {
    const symbolCount = (
      visible.match(
        /[!-/:-@[-`{-~！？。、・「」『』【】［］（）〔〕〈〉《》…ー〜～※☆★♪♬♡♥●○◎◇◆△▲▽▼→←↑↓＋－×÷＝≠∞]/gu,
      ) ?? []
    ).length;

    if (symbolCount / visible.length >= 0.92) {
      return true;
    }
  }

  return false;
}

function isBurstSend(history: number[], now: number): boolean {
  const recent = history.filter((time) => now - time <= 5000);
  return recent.length >= 8;
}

function GroupChatPage() {
  const { groupId } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [theme] = useRineTheme();
  const isLineTheme = theme === "line";

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const liveRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const sendHistoryRef = useRef<number[]>([]);
  const lastContentRef = useRef<string>("");
  const sameContentCountRef = useRef(0);
  const sameContentWindowRef = useRef(0);
  const blockedUntilRef = useRef(0);
  const lastSendTimeRef = useRef(0);

  const broadcastMessage = (m: GroupMessage) => {
    void liveRef.current?.send({
      type: "broadcast",
      event: "msg",
      payload: m,
    });
  };

  const [reads, setReads] = useState<GroupRead[]>([]);
  const [replyTo, setReplyTo] = useState<GroupMessage | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const { block, isBlocked } = useBlocks();

  const {
    joinCall,
    status: callStatus,
    groupId: activeCallGroup,
  } = useGroupCall();

  const inThisCall = callStatus !== "idle" && activeCallGroup === groupId;
  const isOwner = !!user && group?.owner_id === user.id;

  const loadMembers = useCallback(async () => {
    const { data: rows } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId);

    const ids = (rows ?? []).map((r) => r.user_id);
    if (ids.length === 0) {
      setMembers([]);
      return;
    }
    const { data } = { data: await fetchProfiles(ids) };
    setMembers((data ?? []) as Profile[]);
  }, [groupId]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const load = async () => {
      const [{ data: g }, { data: msgs }] = await Promise.all([
        supabase.from("groups").select("*").eq("id", groupId).maybeSingle(),
        supabase
          .from("group_messages")
          .select("*")
          .eq("group_id", groupId)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      if (cancelled) return;
      setGroup((g as Group) ?? null);

      if (msgs) {
        const sorted = (msgs as GroupMessage[]).slice().reverse();
        setMessages(sorted);
      }

      void loadMembers();

      const { data: r } = await supabase
        .from("group_reads")
        .select("*")
        .eq("group_id", groupId);

      if (!cancelled && r) {
        setReads(r as GroupRead[]);
      }
    };

    void load();

    const channel = supabase
      .channel(`group-live:${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_messages",
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          const newMsg = payload.new as GroupMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "group_messages",
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          const oldMsg = payload.old as { id: string };
          setMessages((prev) => prev.filter((m) => m.id !== oldMsg.id));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_reads",
          filter: `group_id=eq.${groupId}`,
        },
        () => {
          void supabase
            .from("group_reads")
            .select("*")
            .eq("group_id", groupId)
            .then(({ data }) => {
              if (data) setReads(data as GroupRead[]);
            });
        },
      )
      .on("broadcast", { event: "msg" }, (event) => {
        const incoming = event.payload as GroupMessage;
        if (!incoming || incoming.group_id !== groupId) return;
        setMessages((prev) => {
          if (prev.some((m) => m.id === incoming.id)) return prev;
          return [...prev, incoming];
        });
      })
      .subscribe();

    liveRef.current = channel;

    void supabase.from("group_reads").upsert(
      {
        group_id: groupId,
        user_id: user.id,
        last_read_at: new Date().toISOString(),
      },
      { onConflict: "group_id,user_id" },
    );

    return () => {
      cancelled = true;
      liveRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [groupId, user, loadMembers]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!text.trim() || !user) return;

    const raw = text.trim();
    const content = maskProfanity(raw);
    const now = Date.now();

    if (now < blockedUntilRef.current) {
      const waitSec = Math.ceil((blockedUntilRef.current - now) / 1000);
      toast.error(`少し待ってから送信してください（残り ${waitSec} 秒）`);
      return;
    }

    if (now - lastSendTimeRef.current < 400) {
      toast.error("送信の間隔が短すぎます");
      return;
    }

    if (hasAbnormalCharacterFlood(raw)) {
      blockedUntilRef.current = now + 15000;
      toast.error("メッセージの送信を一時制限しました");
      return;
    }

    if (now - sameContentWindowRef.current > 12000) {
      sameContentWindowRef.current = now;
      sameContentCountRef.current = 1;
      lastContentRef.current = raw;
    } else if (lastContentRef.current === raw) {
      sameContentCountRef.current += 1;
      if (sameContentCountRef.current >= 4) {
        blockedUntilRef.current = now + 30000;
        toast.error("同じメッセージの連続送信を検知しました");
        return;
      }
    } else {
      lastContentRef.current = raw;
      sameContentCountRef.current = 1;
    }

    sendHistoryRef.current = sendHistoryRef.current
      .filter((t) => now - t <= 5000)
      .concat(now);

    if (isBurstSend(sendHistoryRef.current, now)) {
      blockedUntilRef.current = now + 20000;
      toast.error("連続送信が早すぎます。少し時間をおいてください");
      return;
    }

    lastSendTimeRef.current = now;
    const currentReply = replyTo;
    setText("");
    setReplyTo(null);

    const tempId = `temp-${now}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic: GroupMessage = {
      id: tempId,
      group_id: groupId,
      sender_id: user.id,
      content,
      image_url: null,
      media_type: "text",
      reply_to_id: currentReply?.id ?? null,
      created_at: new Date(now).toISOString(),
    };

    setMessages((prev) => [...prev, optimistic]);
    broadcastMessage(optimistic);

    const { data: inserted, error } = await supabase
      .from("group_messages")
      .insert({
        group_id: groupId,
        sender_id: user.id,
        content,
        reply_to_id: currentReply?.id ?? null,
      })
      .select()
      .single();

    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      enqueueMessage({
        type: "group",
        targetId: groupId,
        content,
        replyToId: currentReply?.id ?? null,
      });
      toast.info("オフラインのため送信待ちキューに保存しました");
      return;
    }

    if (inserted) {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? (inserted as GroupMessage) : m)),
      );
    }
  };

  const pickMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (isLateNightJST()) {
      toast.error("深夜1〜6時はサーバー負荷軽減のため画像送信を休止しています");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setUploading(true);
    const isVideo = file.type.startsWith("video/");
    const mediaType = isVideo ? "video" : "image";

    const secureUrl = await uploadToCloudinary(file);
    if (!secureUrl) {
      setUploading(false);
      toast.error("画像をアップロードできませんでした");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    const { error } = await supabase.from("group_messages").insert({
      group_id: groupId,
      sender_id: user.id,
      content: "",
      image_url: secureUrl,
      media_type: mediaType,
      reply_to_id: replyTo?.id ?? null,
    });

    setUploading(false);
    setReplyTo(null);
    if (fileRef.current) fileRef.current.value = "";

    if (error) {
      toast.error("送信できませんでした");
    }
  };

  const handleDelete = async (msg: GroupMessage) => {
    const mine = msg.sender_id === user?.id;
    if (!mine && !isOwner) return;

    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    if (msg.image_url) forgetMediaUrl(msg.image_url);

    if (mine) {
      const { error } = await supabase
        .from("group_messages")
        .delete()
        .eq("id", msg.id);
      if (error) toast.error("送信取消できませんでした");
      return;
    }

    const res = await deleteGroupMessage({ data: { messageId: msg.id } });
    if (!res.ok) {
      toast.error("削除できませんでした");
    }
  };

  const jumpTo = (id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightId(id);
      setTimeout(() => setHighlightId(null), 2000);
    } else {
      toast.info("メッセージが見つかりません");
    }
  };

  const backTo = group?.is_open ? "/open" : "/groups";

  const leave = async () => {
    if (!user || isOwner) return;

    const myName = members.find((m) => m.id === user.id)?.display_name || "メンバー";
    void supabase.from("group_messages").insert({
      group_id: groupId,
      sender_id: user.id,
      content: `${myName}さんが退出しました`,
      media_type: "system",
    });

    const { error } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", user.id);

    if (error) {
      toast.error("退出できませんでした");
      return;
    }

    await supabase
      .from("group_join_requests")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", user.id);

    toast.success(
      group?.is_open ? "ルームを退出しました" : "グループを退出しました",
    );
    void navigate({ to: backTo });
  };

  const deleteGroup = async () => {
    if (!user || !isOwner) return;

    const { error } = await supabase.from("groups").delete().eq("id", groupId);
    if (error) {
      toast.error("削除できませんでした");
      return;
    }

    toast.success(
      group?.is_open ? "ルームを削除しました" : "グループを削除しました",
    );
    void navigate({ to: backTo });
  };

  if (loading) return null;

  return (
    <div
      className={cn(
        "mx-auto flex h-screen w-full max-w-lg flex-col",
        isLineTheme ? "bg-[#849ebf]" : "bg-chat",
      )}
    >
      <header
        className={cn(
          "flex items-center gap-2 border-b px-3 py-3 backdrop-blur",
          isLineTheme
            ? "border-white/15 bg-[#849ebf]/95 text-white"
            : "border-border bg-background/95 text-foreground",
        )}
      >
        <Button
          asChild
          variant="ghost"
          size="icon"
          aria-label="戻る"
          className={isLineTheme ? "text-white hover:bg-white/10" : ""}
        >
          <Link to={group?.is_open ? "/open" : "/groups"}>
            <ArrowLeft className="size-5" />
          </Link>
        </Button>

        <Avatar className="size-9 shrink-0 shadow-sm">
          <AvatarImage src={group?.avatar_url ?? undefined} alt={group?.name} />
          <AvatarFallback className="bg-brand-gradient text-xs text-primary-foreground">
            {initials(group?.name ?? "?")}
          </AvatarFallback>
        </Avatar>

        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold leading-tight">
            {group?.name ?? "..."}
          </span>
          <span
            className={cn(
              "block text-[11px] leading-tight",
              isLineTheme ? "text-white/70" : "text-muted-foreground",
            )}
          >
            {members.length}人のメンバー
          </span>
        </span>

        {inThisCall ? (
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-400">
            <span className="size-2 animate-pulse rounded-full bg-emerald-400" />
            通話中
          </span>
        ) : (
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              aria-label="音声通話を開始"
              title="音声通話を開始"
              className={isLineTheme ? "text-white hover:bg-white/10" : ""}
              onClick={() =>
                void joinCall(groupId, group?.name ?? "ルーム", false)
              }
            >
              <Phone className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="ビデオ通話を開始"
              title="ビデオ通話を開始"
              className={isLineTheme ? "text-white hover:bg-white/10" : ""}
              onClick={() =>
                void joinCall(groupId, group?.name ?? "ルーム", true)
              }
            >
              <Video className="size-4" />
            </Button>
          </div>
        )}

        <GroupSettingsDialog
          groupId={groupId}
          group={group}
          members={members}
          isOwner={isOwner}
          onChanged={(g) => {
            if (g) setGroup(g);
            void loadMembers();
          }}
          onLeave={leave}
          onDeleteGroup={deleteGroup}
        />
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <p
            className={cn(
              "py-10 text-center text-sm",
              isLineTheme ? "text-white/70" : "text-foreground/50",
            )}
          >
            最初のメッセージを送ってみましょう
          </p>
        )}

        {messages.map((m, index) => {
          const mine = m.sender_id === user?.id;
          const sender = members.find((p) => p.id === m.sender_id);
          const prev = index > 0 ? messages[index - 1] : null;
          const showDatePill =
            !prev || !isSameDay(prev.created_at, m.created_at);

          const datePillNode = showDatePill ? (
            <div className="my-3 flex justify-center">
              <span className="rounded-full bg-black/25 px-3 py-1 text-xs font-medium text-white shadow-sm backdrop-blur-sm">
                {formatDatePill(m.created_at)}
              </span>
            </div>
          ) : null;

          if (
            m.media_type === "system" ||
            m.media_type === "system_join" ||
            m.media_type === "system_leave"
          ) {
            return (
              <div key={m.id} className="space-y-1">
                {datePillNode}
                <div className="flex justify-center py-1">
                  <span
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-3.5 py-1 text-[11px] font-medium shadow-sm backdrop-blur-sm",
                      isLineTheme
                        ? "bg-black/25 text-white"
                        : "bg-muted/80 text-muted-foreground",
                    )}
                  >
                    <span className="font-mono opacity-75">
                      {formatTime(m.created_at)}
                    </span>
                    <span>{m.content}</span>
                  </span>
                </div>
              </div>
            );
          }

          if (m.media_type === "call_start") {
            return (
              <div key={m.id} className="space-y-1">
                {datePillNode}
                <div className="flex justify-center py-1">
                  <button
                    type="button"
                    onClick={() =>
                      void joinCall(
                        groupId,
                        group?.name ?? "ルーム",
                        m.content === "video",
                      )
                    }
                    className="flex items-center gap-2 rounded-full bg-background/90 px-4 py-2 text-xs font-semibold text-foreground shadow-soft"
                  >
                    {m.content === "video" ? (
                      <Video className="size-4" />
                    ) : (
                      <Phone className="size-4" />
                    )}
                    {sender?.display_name ?? "メンバー"} さんが
                    {m.content === "video" ? "ビデオ" : "音声"}通話を開始・
                    <span className="text-primary">参加する</span>
                    <span className="font-normal text-foreground/50">
                      {formatTime(m.created_at)}
                    </span>
                  </button>
                </div>
              </div>
            );
          }

          const readCount = reads.filter(
            (r) =>
              r.user_id !== m.sender_id &&
              new Date(r.last_read_at) >= new Date(m.created_at),
          ).length;

          const parent = m.reply_to_id
            ? messages.find((x) => x.id === m.reply_to_id)
            : null;

          const parentSender = parent
            ? members.find((p) => p.id === parent.sender_id)
            : null;

          const replyCount = messages.filter(
            (x) => x.reply_to_id === m.id,
          ).length;

          return (
            <div key={m.id} className="space-y-1">
              {datePillNode}

              <div
                id={`msg-${m.id}`}
                className={cn(
                  "flex items-end gap-1.5 rounded-2xl transition-colors",
                  mine && "flex-row-reverse",
                  highlightId === m.id && "bg-primary/10",
                )}
              >
                {!mine && (
                  <Link
                    to="/friend/$friendId"
                    params={{ friendId: sender?.id ?? "" }}
                    className="transition-opacity hover:opacity-75"
                  >
                    <Avatar className="size-8 cursor-pointer shadow-sm">
                      <AvatarImage
                        src={sender?.avatar_url ?? undefined}
                        alt={sender?.display_name ?? ""}
                      />
                      <AvatarFallback className="text-[11px]">
                        {initials(sender?.display_name ?? "?")}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                )}

                <div
                  className={cn(
                    "max-w-[72%]",
                    mine ? "items-end" : "items-start",
                  )}
                >
                  {!mine && sender && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            "mb-0.5 flex items-center text-left text-[11px] font-medium transition-opacity hover:opacity-80",
                            isLineTheme
                              ? "text-white/90 drop-shadow-sm"
                              : "text-foreground/70",
                          )}
                        >
                          <span>{sender.display_name}</span>
                          <StaffBadge userId={sender.id} size={13} />
                          <span
                            className={cn(
                              "ml-1 font-mono text-[9px]",
                              isLineTheme
                                ? "text-white/60"
                                : "text-foreground/40",
                            )}
                          >
                            ID:{sender.friend_code}
                          </span>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuLabel className="font-mono text-[11px]">
                          ID: {sender.friend_code}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={async () => {
                            if (isBlocked(sender.id)) return;
                            if (await block(sender.id)) {
                              toast.success("ブロックしました");
                            }
                          }}
                        >
                          <Ban className="mr-2 size-4" />
                          {isBlocked(sender.id)
                            ? "ブロック中"
                            : "この人をブロック"}
                        </DropdownMenuItem>
                        <ReportDialog
                          targetId={sender.id}
                          targetName={sender.display_name}
                          targetCode={sender.friend_code}
                          context="group"
                          groupId={groupId}
                          trigger={
                            <DropdownMenuItem
                              onSelect={(e) => e.preventDefault()}
                            >
                              <Flag className="mr-2 size-4" />
                              この人を通報
                            </DropdownMenuItem>
                          }
                        />
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}

                  {!mine && !sender && (
                    <p
                      className={cn(
                        "mb-0.5 text-[11px]",
                        isLineTheme ? "text-white/80" : "text-foreground/60",
                      )}
                    >
                      メンバー
                    </p>
                  )}

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
                        {parentSender?.display_name ?? "メンバー"} への返信
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
                                ? "rounded-br-sm bg-[#85e24a] text-black"
                                : "rounded-bl-sm bg-white text-black"
                              : mine
                                ? "bubble-out rounded-br-sm"
                                : "bubble-in rounded-bl-sm",
                          ),
                    )}
                  >
                    {m.image_url ? (
                      <ChatMedia path={m.image_url} mediaType={m.media_type} />
                    ) : (
                      <p className="whitespace-pre-wrap break-words">
                        {m.content}
                      </p>
                    )}
                  </div>

                  {replyCount > 0 && (
                    <p
                      className={cn(
                        "mt-0.5 text-[10px]",
                        mine ? "text-right" : "",
                        isLineTheme
                          ? "font-medium text-white/90 drop-shadow-sm"
                          : "text-primary",
                      )}
                    >
                      返信 {replyCount} 件
                    </p>
                  )}
                </div>

                <span
                  className={cn(
                    "mb-1 flex flex-col text-[10px]",
                    mine ? "items-end" : "items-start",
                    isLineTheme
                      ? "text-white/85 drop-shadow-sm"
                      : "text-foreground/50",
                  )}
                >
                  {readCount > 0 && (
                    <span
                      className={cn(
                        isLineTheme
                          ? "font-medium text-white/90"
                          : "text-foreground/60",
                      )}
                    >
                      既読 {readCount}
                    </span>
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
                      ? "text-white/60 hover:bg-white/10 hover:text-white"
                      : "text-foreground/30 hover:bg-foreground/10 hover:text-primary",
                  )}
                >
                  <Reply className="size-3.5" />
                </button>

                {(mine || isOwner) && (
                  <button
                    type="button"
                    aria-label={mine ? "送信を取り消す" : "メッセージを削除"}
                    title={mine ? "送信を取り消す" : "管理者として削除"}
                    onClick={() => void handleDelete(m)}
                    className={cn(
                      "mb-1 rounded-full p-1 transition-colors",
                      isLineTheme
                        ? "text-white/60 hover:bg-white/10 hover:text-destructive"
                        : "text-foreground/30 hover:bg-foreground/10 hover:text-destructive",
                    )}
                  >
                    {mine ? (
                      <Undo2 className="size-3.5" />
                    ) : (
                      <Trash2 className="size-3.5 text-destructive/70 hover:text-destructive" />
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      {replyTo && (
        <div className="flex items-center gap-2 border-t border-border bg-muted/60 px-3 py-2">
          <Reply className="size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-primary">
              {members.find((p) => p.id === replyTo.sender_id)?.display_name ??
                "メンバー"}{" "}
              さんに返信
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {replyTo.image_url
                ? replyTo.media_type === "video"
                  ? "動画"
                  : "画像"
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
        className={cn(
          "flex items-center gap-2 border-t px-3 py-3 backdrop-blur",
          isLineTheme
            ? "border-white/15 bg-[#849ebf]/95"
            : "border-border bg-background/95",
        )}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          hidden
          onChange={pickMedia}
        />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="画像・動画を送信"
          disabled={uploading}
          className={isLineTheme ? "text-white hover:bg-white/10" : ""}
          onClick={() => fileRef.current?.click()}
        >
          <ImagePlus className="size-5" />
        </Button>

        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="メッセージを入力"
          className={cn(
            "rounded-full",
            isLineTheme && "border-white/20 bg-white/95 text-black placeholder:text-black/50",
          )}
        />

        <Button
          type="submit"
          size="icon"
          className={cn(
            "rounded-full",
            isLineTheme && "bg-[#06C755] text-white hover:bg-[#05b34c]",
          )}
          aria-label="送信"
        >
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}

function GroupSettingsDialog({
  groupId,
  group,
  members,
  isOwner,
  onChanged,
  onLeave,
  onDeleteGroup,
}: {
  groupId: string;
  group: Group | null;
  members: Profile[];
  isOwner: boolean;
  onChanged: (g?: Group) => void;
  onLeave: () => void;
  onDeleteGroup: () => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isOpenRoom, setIsOpenRoom] = useState(false);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [isAdult, setIsAdult] = useState(false);
  const [saving, setSaving] = useState(false);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [friends, setFriends] = useState<Profile[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);

  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [requestUsers, setRequestUsers] = useState<Record<string, Profile>>({});
  const [loadingRequests, setLoadingRequests] = useState(false);

  const copyInvite = () => {
    const url = `${window.location.origin}/open?join=${groupId}`;
    void navigator.clipboard.writeText(url);
    toast.success("招待リンクをコピーしました");
  };

  useEffect(() => {
    if (open && group) {
      setName(group.name);
      setDescription(group.description ?? "");
      setIsOpenRoom(group.is_open);
      setRequiresApproval(group.requires_approval);
      setIsAdult(group.is_adult);
      setAvatarPreview(group.avatar_url ?? null);
    }
  }, [open, group]);

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;

    const loadFriends = async () => {
      setLoadingFriends(true);
      const { data: rows } = await supabase
        .from("friendships")
        .select("friend_id")
        .eq("user_id", user.id);

      const ids = (rows ?? [])
        .map((r) => r.friend_id)
        .filter((id) => !members.some((m) => m.id === id));

      if (ids.length === 0) {
        if (!cancelled) {
          setFriends([]);
          setLoadingFriends(false);
        }
        return;
      }

      const { data } = { data: await fetchProfiles(ids) };
      if (!cancelled) {
        setFriends((data ?? []) as Profile[]);
        setLoadingFriends(false);
      }
    };

    void loadFriends();

    const loadRequests = async () => {
      if (!isOwner) return;
      setLoadingRequests(true);
      const { data } = await supabase
        .from("group_join_requests")
        .select("*")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false });

      if (cancelled) return;
      const reqList = (data ?? []) as JoinRequest[];
      setRequests(reqList);

      const ids = Array.from(new Set(reqList.map((r) => r.user_id)));
      if (ids.length === 0) {
        setRequestUsers({});
        setLoadingRequests(false);
        return;
      }

      const { data: profs } = { data: await fetchProfiles(ids) };
      if (cancelled) return;

      const map: Record<string, Profile> = {};
      for (const p of profs ?? []) {
        map[p.id] = p;
      }
      setRequestUsers(map);
      setLoadingRequests(false);
    };

    void loadRequests();

    return () => {
      cancelled = true;
    };
  }, [open, user, members, isOwner, groupId]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner || !name.trim()) return;

    setSaving(true);
    const { data, error } = await supabase
      .from("groups")
      .update({
        name: name.trim(),
        description: description.trim() || null,
        is_open: isOpenRoom,
        requires_approval: requiresApproval,
        is_adult: isAdult,
      })
      .eq("id", groupId)
      .select()
      .single();

    setSaving(false);
    if (error) {
      toast.error("保存できませんでした");
      return;
    }

    toast.success("設定を更新しました");
    onChanged(data as Group);
  };

  const onPickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !isOwner) return;

    setAvatarUploading(true);

    try {
      const compressed = await compressImage(file, {
        maxWidth: 256,
        maxHeight: 256,
        quality: 0.85,
        targetBytes: 300 * 1024,
      });

      const safetyDataUrl = await makeAvatarDataUrl(compressed);
      const check = await checkProfileAvatarSafety({
        data: { imageBase64: safetyDataUrl },
      });

      if (!check.safe) {
        toast.error(check.reason ?? "不適切な画像と判定されたため設定できません");
        setAvatarUploading(false);
        if (avatarInputRef.current) avatarInputRef.current.value = "";
        return;
      }

      const secureUrl = await uploadToCloudinary(compressed);
      if (!secureUrl) {
        toast.error("アップロードに失敗しました");
        setAvatarUploading(false);
        if (avatarInputRef.current) avatarInputRef.current.value = "";
        return;
      }

      const { data, error } = await supabase
        .from("groups")
        .update({ avatar_url: secureUrl })
        .eq("id", groupId)
        .select()
        .single();

      if (error) {
        toast.error("アイコンを更新できませんでした");
      } else {
        setAvatarPreview(secureUrl);
        toast.success("アイコンを更新しました");
        onChanged(data as Group);
      }
    } catch {
      toast.error("画像の処理中にエラーが発生しました");
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const review = async (request: JoinRequest, approve: boolean) => {
    const { error } = await supabase.rpc("approve_join_request", {
      _request_id: request.id,
      _approve: approve,
    });

    if (error) {
      toast.error("処理できませんでした");
      return;
    }

    toast.success(approve ? "参加を承認しました" : "申請を却下しました");
    setRequests((prev) => prev.filter((r) => r.id !== request.id));
    if (approve) {
      onChanged();
    }
  };

  const addMember = async (id: string) => {
    const { error } = await supabase.from("group_members").insert({
      group_id: groupId,
      user_id: id,
    });

    if (error) {
      toast.error("追加できませんでした");
      return;
    }

    toast.success("招待しました");
    setFriends((prev) => prev.filter((f) => f.id !== id));
    onChanged();
  };

  const removeMember = async (id: string) => {
    if (!isOwner || id === group?.owner_id) return;

    const { error } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", id);

    if (error) {
      toast.error("退出させられませんでした");
      return;
    }

    toast.success("メンバーを外しました");
    onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="グループ設定">
          <Settings className="size-5" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isOpenRoom ? "ルーム設定" : "グループ設定"}
          </DialogTitle>
          <DialogDescription>
            {isOwner
              ? "アイコンや名前の変更、メンバー管理ができます。"
              : "メンバーの一覧を確認できます。"}
          </DialogDescription>
        </DialogHeader>

        {isOwner && (
          <form onSubmit={save} className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="size-16">
                <AvatarImage src={avatarPreview ?? undefined} alt={name} />
                <AvatarFallback className="bg-brand-gradient text-lg text-primary-foreground">
                  {initials(name || "?")}
                </AvatarFallback>
              </Avatar>

              <div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={onPickAvatar}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={avatarUploading}
                  onClick={() => avatarInputRef.current?.click()}
                >
                  {avatarUploading ? "確認中..." : "アイコンを変更"}
                </Button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                {isOpenRoom ? "ルーム名" : "グループ名"}
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={40}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                説明（任意）
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={200}
                rows={2}
                className="mt-1 resize-none"
              />
            </div>

            <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">オープンチャットにする</p>
                  <p className="text-xs text-muted-foreground">
                    だれでも検索から見つけられるようになります
                  </p>
                </div>
                <Switch
                  checked={isOpenRoom}
                  onCheckedChange={setIsOpenRoom}
                />
              </div>

              {isOpenRoom && (
                <>
                  <div className="flex items-center justify-between border-t border-border/40 pt-3">
                    <div>
                      <p className="text-sm font-semibold">参加を承認制にする</p>
                      <p className="text-xs text-muted-foreground">
                        管理者が承認するまでメッセージは見られません
                      </p>
                    </div>
                    <Switch
                      checked={requiresApproval}
                      onCheckedChange={setRequiresApproval}
                    />
                  </div>

                  <div className="flex items-center justify-between border-t border-border/40 pt-3">
                    <div>
                      <p className="text-sm font-semibold">🔞 年齢制限ルーム</p>
                      <p className="text-xs text-muted-foreground">
                        検索結果に注意ラベルが付きます
                      </p>
                    </div>
                    <Switch
                      checked={isAdult}
                      onCheckedChange={setIsAdult}
                    />
                  </div>
                </>
              )}
            </div>

            <Button
              type="submit"
              variant="brand"
              className="w-full"
              disabled={saving}
            >
              {saving ? "保存中..." : "変更を保存"}
            </Button>
          </form>
        )}

        {isOpenRoom && (
          <div className="rounded-xl border border-border/60 p-3">
            <p className="text-xs font-semibold text-muted-foreground">
              招待リンク
            </p>
            <div className="mt-1 flex items-center gap-2">
              <Input
                readOnly
                value={`${window.location.origin}/open?join=${groupId}`}
                className="font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={copyInvite}
                aria-label="招待リンクをコピー"
              >
                <Link2 className="size-4" />
              </Button>
            </div>
          </div>
        )}

        {isOwner && requiresApproval && (
          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted-foreground">
              参加リクエスト ({requests.length})
            </p>

            {loadingRequests ? (
              <p className="py-2 text-center text-xs text-muted-foreground">
                読み込み中...
              </p>
            ) : requests.length === 0 ? (
              <p className="py-2 text-center text-xs text-muted-foreground">
                リクエストはありません
              </p>
            ) : (
              <ul className="space-y-2">
                {requests.map((r) => {
                  const p = requestUsers[r.user_id];
                  return (
                    <li
                      key={r.id}
                      className="flex items-center gap-2 rounded-lg border border-border/60 p-2"
                    >
                      <Avatar className="size-8">
                        <AvatarImage src={p?.avatar_url ?? undefined} />
                        <AvatarFallback>
                          {initials(p?.display_name ?? "?")}
                        </AvatarFallback>
                      </Avatar>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">
                          {p?.display_name ?? "ユーザー"}
                        </span>
                        <span className="block font-mono text-[10px] text-muted-foreground">
                          ID: {p?.friend_code ?? "..."}
                        </span>
                      </span>

                      <Button
                        size="sm"
                        variant="brand"
                        onClick={() => void review(r, true)}
                      >
                        <Check className="mr-1 size-3" />
                        承認
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void review(r, false)}
                      >
                        <X className="mr-1 size-3" />
                        却下
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-xs font-semibold text-muted-foreground">
            メンバー ({members.length})
          </p>

          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/40"
              >
                <Avatar className="size-8">
                  <AvatarImage src={m.avatar_url ?? undefined} />
                  <AvatarFallback>{initials(m.display_name)}</AvatarFallback>
                </Avatar>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    {m.display_name}
                    <StaffBadge userId={m.id} />
                  </span>
                  <span className="block font-mono text-[10px] text-muted-foreground">
                    ID: {m.friend_code}
                    {m.id === group?.owner_id && " ・ 作成者"}
                  </span>
                </span>

                {isOwner && m.id !== group?.owner_id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-destructive"
                    onClick={() => void removeMember(m.id)}
                  >
                    外す
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>

        {friends.length > 0 && (
          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted-foreground">
              友だちを招待
            </p>

            {loadingFriends ? (
              <p className="py-2 text-center text-xs text-muted-foreground">
                読み込み中...
              </p>
            ) : (
              <ul className="max-h-40 space-y-1 overflow-y-auto">
                {friends.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-muted/40"
                  >
                    <Avatar className="size-7">
                      <AvatarImage src={f.avatar_url ?? undefined} />
                      <AvatarFallback>{initials(f.display_name)}</AvatarFallback>
                    </Avatar>

                    <span className="min-w-0 flex-1 truncate text-sm">
                      {f.display_name}
                    </span>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void addMember(f.id)}
                    >
                      <UserPlus className="mr-1 size-3" />
                      追加
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {isOwner ? (
          <Button
            variant="ghost"
            className="w-full text-destructive"
            onClick={onDeleteGroup}
          >
            <Trash2 className="mr-1 size-4" />
            {isOpenRoom
              ? "ルームを削除（作成者のみ）"
              : "グループを削除（作成者のみ）"}
          </Button>
        ) : (
          <Button
            variant="ghost"
            className="w-full text-destructive"
            onClick={onLeave}
          >
            <LogOut className="mr-1 size-4" />
            {isOpenRoom ? "ルームを退出" : "グループを退出"}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
