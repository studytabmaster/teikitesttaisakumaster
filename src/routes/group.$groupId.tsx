import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Ban,
  Check,
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
import { forgetMediaUrl } from "@/lib/mediaUrl";
import { deleteGroupMessage } from "./group.functions";
import { useAuth } from "@/hooks/useAuth";
import { ChatMedia } from "@/components/ChatMedia";
import { ReportDialog } from "@/components/ReportDialog";
import { useBlocks } from "@/hooks/useBlocks";
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
import { compressImage } from "@/lib/compress";
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

/**
 * 荒らし対策
 *
 * 普通の日本語メッセージには影響しにくいように、
 * 「異常に同じ文字が続く」「制御・ゼロ幅文字が大量に入る」
 * 「極端に記号だけが続く」といったケースだけを検知する。
 */
function hasAbnormalCharacterFlood(content: string): boolean {
  if (!content) return false;

  // ゼロ幅文字・不可視系文字。
  // 通常の日本語入力ではほぼ使われないため、大量使用のみブロック。
  const invisibleMatches = content.match(
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g,
  );

  if (invisibleMatches && invisibleMatches.length >= 8) {
    return true;
  }

  // 同じ文字を異常に連続させるケース。
  // 20文字以上の同一文字連続を荒らしとみなす。
  if (/(.)\1{19,}/u.test(content)) {
    return true;
  }

  // 同じ2～4文字の組み合わせを大量に繰り返すケース。
  if (/(.{1,4})\1{9,}/u.test(content)) {
    return true;
  }

  // 記号だけの極端な連続。
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

/**
 * 連投の異常なバーストだけを検知。
 *
 * 普通の会話では余裕を持たせ、
 * 短時間に大量の送信が発生した場合だけ制限する。
 */
function isBurstSend(
  history: number[],
  now: number,
): boolean {
  const recent = history.filter((time) => now - time <= 5000);

  // 5秒以内に8通以上なら異常な高速連投と判断。
  return recent.length >= 8;
}

function GroupChatPage() {
  const { groupId } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const liveRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // 直近の送信履歴。
  // 通常の会話では制限せず、異常な高速連投だけ検知する。
  const sendHistoryRef = useRef<number[]>([]);

  // 同一文面の連続送信検知用。
  const lastContentRef = useRef<string>("");
  const sameContentCountRef = useRef(0);
  const sameContentWindowRef = useRef(0);

  // 送信後の短時間クールダウン。
  const blockedUntilRef = useRef(0);

  // 送った内容をメンバーの画面へ即座に届ける（DB反映を待たない）
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

  const inThisCall =
    callStatus !== "idle" && activeCallGroup === groupId;

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

    const { data } = await supabase
      .from("profiles")
      .select("*")
      .in("id", ids);

    setMembers((data ?? []) as Profile[]);
  }, [groupId]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const load = async () => {
      const [{ data: g }, { data: msgs }] = await Promise.all([
        supabase
          .from("groups")
          .select("*")
          .eq("id", groupId)
          .maybeSingle(),

        supabase
          .from("group_messages")
          .select("*")
          .eq("group_id", groupId)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      if (cancelled) return;

      setGroup((g as Group) ?? null);

      // 新しい順に取って表示用に昇順へ戻す
      setMessages(
        (((msgs ?? []) as GroupMessage[])
          .slice()
          .reverse()) as GroupMessage[],
      );

      void loadMembers();
    };

    void load();

    const loadReads = async () => {
      const { data } = await supabase
        .from("group_reads")
        .select("group_id,user_id,last_read_at")
        .eq("group_id", groupId);

      if (!cancelled) {
        setReads((data ?? []) as GroupRead[]);
      }
    };

    void loadReads();

    const channel = supabase
      .channel(`group-${groupId}`, {
        config: {
          broadcast: {
            self: false,
          },
        },
      })
      .on("broadcast", { event: "msg" }, ({ payload }) => {
        const m = {
          ...(payload as GroupMessage),
          created_at: new Date().toISOString(),
        };

        setMessages((prev) =>
          prev.some((x) => x.id === m.id)
            ? prev
            : [...prev, m],
        );
      })
      .on("broadcast", { event: "del" }, ({ payload }) => {
        const id = (payload as { id?: string })?.id;

        if (!id) return;

        setMessages((prev) =>
          prev.filter((x) => x.id !== id),
        );
      })
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_messages",
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          const m = payload.new as GroupMessage;

          setMessages((prev) =>
            prev.some((x) => x.id === m.id)
              ? prev
              : [...prev, m],
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "group_messages",
        },
        (payload) => {
          const removed = payload.old as { id?: string };

          if (!removed?.id) return;

          setMessages((prev) =>
            prev.filter((x) => x.id !== removed.id),
          );
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
          void loadReads();
        },
      )
      .subscribe();

    liveRef.current = channel;

    return () => {
      cancelled = true;
      liveRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [user, groupId, loadMembers]);

  // トークを開いている間は既読を更新する
  useEffect(() => {
    if (!user) return;

    void supabase
      .from("group_reads")
      .upsert(
        {
          group_id: groupId,
          user_id: user.id,
          last_read_at: new Date().toISOString(),
        },
        {
          onConflict: "group_id,user_id",
        },
      );
  }, [user, groupId, messages.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);

  // 引用元のメッセージまでスクロールして一瞬光らせる
  const jumpTo = (id: string) => {
    const el = document.getElementById(`msg-${id}`);

    if (!el) {
      toast("元のメッセージは古いため表示できません");
      return;
    }

    el.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });

    setHighlightId(id);

    window.setTimeout(() => {
      setHighlightId(null);
    }, 1600);
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();

    const content = text.trim();

    if (!content || !user) return;

    // 最大500文字
    if (content.length > 500) {
      toast.error(
        "メッセージは500文字以内で入力してください",
      );
      return;
    }

    const now = Date.now();

    // 異常な高速連投による一時停止中
    if (now < blockedUntilRef.current) {
      const remain = Math.ceil(
        (blockedUntilRef.current - now) / 1000,
      );

      toast(
        `連続送信が多いため、あと${remain}秒ほど待ってください`,
        {
          duration: 1800,
        },
      );

      return;
    }

    // 特殊文字・同一文字の異常な繰り返し
    if (hasAbnormalCharacterFlood(content)) {
      toast.error(
        "同じ文字や特殊文字を大量に繰り返すメッセージは送信できません",
      );
      return;
    }

    // 直近5秒間の送信履歴を整理
    sendHistoryRef.current = sendHistoryRef.current.filter(
      (time) => now - time <= 5000,
    );

    // 普通の連続送信は許可。
    // 5秒以内に8通以上など、明らかな高速連投だけ制限する。
    if (isBurstSend(sendHistoryRef.current, now)) {
      blockedUntilRef.current = now + 5000;

      toast(
        "短時間にたくさん送信されています。少し待ってください",
        {
          duration: 2200,
        },
      );

      return;
    }

    // 同じ内容の高速連投だけ検知。
    if (content === lastContentRef.current) {
      const elapsed = now - sameContentWindowRef.current;

      if (elapsed <= 10000) {
        sameContentCountRef.current += 1;
      } else {
        sameContentCountRef.current = 1;
        sameContentWindowRef.current = now;
      }
    } else {
      lastContentRef.current = content;
      sameContentCountRef.current = 1;
      sameContentWindowRef.current = now;
    }

    // 同じ文章を10秒以内に5回以上送った場合だけ制限
    if (sameContentCountRef.current >= 5) {
      blockedUntilRef.current = now + 5000;
      sameContentCountRef.current = 0;

      toast(
        "同じメッセージの連続送信が多いため、少し待ってください",
        {
          duration: 2200,
        },
      );

      return;
    }

    sendHistoryRef.current.push(now);

    setText("");

    const clean = maskProfanity(content);
    const parentId = replyTo?.id ?? null;

    setReplyTo(null);

    if (clean !== content) {
      toast("不適切な言葉は伏字になります");
    }

    if (
      typeof navigator !== "undefined" &&
      !navigator.onLine
    ) {
      enqueueMessage({
        kind: "group",
        senderId: user.id,
        targetId: groupId,
        content: clean,
      });

      toast("オフラインのため、つながったら送信します");
      return;
    }

    // 先に自分の画面へ表示し、メンバーへも即配信する
    const optimistic: GroupMessage = {
      id: crypto.randomUUID(),
      group_id: groupId,
      sender_id: user.id,
      content: clean,
      image_url: null,
      media_type: null,
      created_at: new Date().toISOString(),
      reply_to_id: parentId,
    };

    setMessages((prev) => [...prev, optimistic]);

    broadcastMessage(optimistic);

    // 保存は裏で行う
    const { error } = await supabase
      .from("group_messages")
      .insert({
        id: optimistic.id,
        group_id: groupId,
        sender_id: user.id,
        content: clean,
        reply_to_id: parentId,
      });

    if (error) {
      setMessages((prev) =>
        prev.filter((x) => x.id !== optimistic.id),
      );

      enqueueMessage({
        kind: "group",
        senderId: user.id,
        targetId: groupId,
        content: clean,
      });

      toast(
        "送信できなかったので、送信待ちに入れました",
      );
    }
  };

  const pickMedia = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];

    e.target.value = "";

    if (!file || !user) return;

    const isVideo = file.type.startsWith("video/");

    if (
      !file.type.startsWith("image/") &&
      !isVideo
    ) {
      toast.error(
        "画像または動画を選んでください",
      );
      return;
    }

    setUploading(true);

    // 画像はアップロード前に自動圧縮
    const upload = isVideo
      ? file
      : await compressImage(file);

    const limit = isVideo ? 10 : 5;

    if (upload.size > limit * 1024 * 1024) {
      setUploading(false);

      toast.error(
        `${isVideo ? "動画" : "画像"}は${limit}MBまでです`,
      );

      return;
    }

    const ext =
      upload.name.split(".").pop() ||
      (isVideo ? "mp4" : "jpg");

    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("chat-images")
      .upload(path, upload, {
        contentType: upload.type,
        cacheControl: "31536000",
      });

    if (upErr) {
      setUploading(false);

      toast.error(
        "アップロードできませんでした",
      );

      return;
    }

    setUploading(false);

    const optimistic: GroupMessage = {
      id: crypto.randomUUID(),
      group_id: groupId,
      sender_id: user.id,
      content: "",
      image_url: path,
      media_type: isVideo ? "video" : "image",
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [
      ...prev,
      optimistic,
    ]);

    broadcastMessage(optimistic);

    void supabase
      .from("group_messages")
      .insert({
        id: optimistic.id,
        group_id: groupId,
        sender_id: user.id,
        content: "",
        image_url: path,
        media_type: isVideo ? "video" : "image",
      })
      .then(({ error }) => {
        if (error) {
          setMessages((prev) =>
            prev.filter(
              (x) => x.id !== optimistic.id,
            ),
          );

          toast.error("送信できませんでした");
        }
      });
  };

  const handleDelete = async (
    m: GroupMessage,
  ) => {
    const isOwn = m.sender_id === user?.id;

    const confirmMsg = isOwn
      ? "このメッセージを取り消します。元に戻せません。よろしいですか？"
      : "【管理者権限】このメッセージを削除します。参加者全員の画面から削除されます。よろしいですか？";

    if (!window.confirm(confirmMsg)) return;

    try {
      await deleteGroupMessage({
        data: {
          messageId: m.id,
          groupId,
        },
      });

      if (m.image_url) {
        forgetMediaUrl(m.image_url);
      }

      if (replyTo?.id === m.id) {
        setReplyTo(null);
      }

      setMessages((prev) =>
        prev
          .filter((x) => x.id !== m.id)
          .map((x) =>
            x.reply_to_id === m.id
              ? {
                  ...x,
                  reply_to_id: null,
                }
              : x,
          ),
      );

      void liveRef.current?.send({
        type: "broadcast",
        event: "del",
        payload: {
          id: m.id,
        },
      });

      toast.success(
        isOwn
          ? "取り消しました"
          : "メッセージを削除しました",
      );
    } catch (err: any) {
      toast.error(
        err?.message ||
          "削除できませんでした",
      );
    }
  };

  const backTo = group?.is_open
    ? "/open"
    : "/groups";

  const leave = async () => {
    if (!user || isOwner) return;

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
      group?.is_open
        ? "ルームを退出しました"
        : "グループを退出しました",
    );

    void navigate({
      to: backTo,
    });
  };

  const deleteGroup = async () => {
    if (!user || !isOwner) return;

    const { error } = await supabase
      .from("groups")
      .delete()
      .eq("id", groupId);

    if (error) {
      toast.error("削除できませんでした");
      return;
    }

    toast.success(
      group?.is_open
        ? "ルームを削除しました"
        : "グループを削除しました",
    );

    void navigate({
      to: backTo,
    });
  };

  if (loading) return null;

  return (
    <div className="mx-auto flex h-screen w-full max-w-lg flex-col bg-chat">
      <header className="flex items-center gap-2 border-b border-border bg-background/95 px-3 py-3 backdrop-blur">
        <Button
          asChild
          variant="ghost"
          size="icon"
          aria-label="戻る"
        >
          <Link
            to={
              group?.is_open
                ? "/open"
                : "/groups"
            }
          >
            <ArrowLeft className="size-5" />
          </Link>
        </Button>

        <Avatar className="size-9">
          <AvatarImage
            src={
              group?.avatar_url ??
              undefined
            }
            alt={group?.name ?? ""}
          />

          <AvatarFallback className="bg-brand-gradient text-xs text-primary-foreground">
            {initials(
              group?.name ?? "?",
            )}
          </AvatarFallback>
        </Avatar>

        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold leading-tight">
            {group?.name ?? "..."}
          </span>

          <span className="block text-[11px] leading-tight text-muted-foreground">
            {group?.is_open
              ? "オープンチャット・"
              : ""}
            メンバー {members.length} 人
          </span>
        </span>

        <Button
          variant="ghost"
          size="icon"
          aria-label="ルーム通話（音声）"
          disabled={inThisCall}
          onClick={() =>
            void joinCall(
              groupId,
              group?.name ?? "ルーム",
              false,
            )
          }
        >
          <Phone className="size-5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          aria-label="ルーム通話（ビデオ）"
          disabled={inThisCall}
          onClick={() =>
            void joinCall(
              groupId,
              group?.name ?? "ルーム",
              true,
            )
          }
        >
          <Video className="size-5" />
        </Button>

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
          <p className="py-10 text-center text-sm text-foreground/50">
            最初のメッセージを送ってみましょう
          </p>
        )}

        {messages.map((m) => {
          const mine =
            m.sender_id === user?.id;

          const sender = members.find(
            (p) => p.id === m.sender_id,
          );

          const readCount =
            reads.filter(
              (r) =>
                r.user_id !==
                  m.sender_id &&
                new Date(
                  r.last_read_at,
                ) >=
                  new Date(
                    m.created_at,
                  ),
            ).length;

          if (
            m.media_type ===
            "call_start"
          ) {
            return (
              <div
                key={m.id}
                className="flex justify-center py-1"
              >
                <button
                  type="button"
                  onClick={() =>
                    void joinCall(
                      groupId,
                      group?.name ??
                        "ルーム",
                      m.content ===
                        "video",
                    )
                  }
                  className="flex items-center gap-2 rounded-full bg-background/90 px-4 py-2 text-xs font-semibold text-foreground shadow-soft"
                >
                  {m.content ===
                  "video" ? (
                    <Video className="size-4" />
                  ) : (
                    <Phone className="size-4" />
                  )}

                  {sender?.display_name ??
                    "メンバー"}{" "}
                  さんが
                  {m.content ===
                  "video"
                    ? "ビデオ"
                    : "音声"}
                  通話を開始・
                  <span className="text-primary">
                    参加する
                  </span>

                  <span className="font-normal text-foreground/50">
                    {formatTime(
                      m.created_at,
                    )}
                  </span>
                </button>
              </div>
            );
          }

          const parent =
            m.reply_to_id
              ? messages.find(
                  (x) =>
                    x.id ===
                    m.reply_to_id,
                )
              : null;

          const parentSender =
            parent
              ? members.find(
                  (p) =>
                    p.id ===
                    parent.sender_id,
                )
              : null;

          const replyCount =
            messages.filter(
              (x) =>
                x.reply_to_id ===
                m.id,
            ).length;

          return (
            <div
              key={m.id}
              id={`msg-${m.id}`}
              className={cn(
                "flex items-end gap-1.5 rounded-2xl transition-colors",
                mine &&
                  "flex-row-reverse",
                highlightId ===
                  m.id &&
                  "bg-primary/10",
              )}
            >
              {!mine && (
                <Link
                  to="/friend/$friendId"
                  params={{ friendId: sender?.id ?? "" }}
                  className="transition-opacity hover:opacity-75"
                >
                  <Avatar className="size-7 cursor-pointer">
                    <AvatarImage
                      src={sender?.avatar_url ?? undefined}
                      alt={sender?.display_name ?? ""}
                    />
                    <AvatarFallback className="text-[10px]">
                      {initials(sender?.display_name ?? "?")}
                    </AvatarFallback>
                  </Avatar>
                </Link>
              )}


              <div
                className={cn(
                  "max-w-[72%]",
                  mine
                    ? "items-end"
                    : "items-start",
                )}
              >
                {!mine &&
                  sender && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        asChild
                      >
                        <button
                          type="button"
                          className="mb-0.5 block text-left text-[11px] text-foreground/60"
                        >
                          {
                            sender.display_name
                          }

                          <span className="ml-1 font-mono text-[9px] text-foreground/40">
                            ID:
                            {
                              sender.friend_code
                            }
                          </span>
                        </button>
                      </DropdownMenuTrigger>

                      <DropdownMenuContent align="start">
                        <DropdownMenuLabel className="font-mono text-[11px]">
                          ID:{" "}
                          {
                            sender.friend_code
                          }
                        </DropdownMenuLabel>

                        <DropdownMenuSeparator />

                        <DropdownMenuItem
                          onSelect={async () => {
                            if (
                              isBlocked(
                                sender.id,
                              )
                            )
                              return;

                            if (
                              await block(
                                sender.id,
                              )
                            ) {
                              toast.success(
                                "ブロックしました",
                              );
                            }
                          }}
                        >
                          <Ban className="mr-2 size-4" />

                          {isBlocked(
                            sender.id,
                          )
                            ? "ブロック中"
                            : "この人をブロック"}
                        </DropdownMenuItem>

                        <ReportDialog
                          targetId={
                            sender.id
                          }
                          targetName={
                            sender.display_name
                          }
                          targetCode={
                            sender.friend_code
                          }
                          context="group"
                          groupId={groupId}
                          trigger={
                            <DropdownMenuItem
                              onSelect={(e) =>
                                e.preventDefault()
                              }
                            >
                              <Flag className="mr-2 size-4" />
                              この人を通報
                            </DropdownMenuItem>
                          }
                        />
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}

                {!mine &&
                  !sender && (
                    <p className="mb-0.5 text-[11px] text-foreground/60">
                      メンバー
                    </p>
                  )}

                {parent && (
                  <button
                    type="button"
                    onClick={() =>
                      jumpTo(
                        parent.id,
                      )
                    }
                    className={cn(
                      "mb-1 block w-full max-w-full rounded-xl border-l-2 border-primary/60 bg-background/70 px-2.5 py-1.5 text-left",
                      mine &&
                        "border-l-0 border-r-2",
                    )}
                  >
                    <span className="block truncate text-[10px] font-semibold text-primary">
                      {parentSender?.display_name ??
                        "メンバー"}{" "}
                      への返信
                    </span>

                    <span className="block truncate text-[11px] text-foreground/60">
                      {parent.image_url
                        ? parent.media_type ===
                          "video"
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
                          mine
                            ? "bubble-out rounded-br-sm"
                            : "bubble-in rounded-bl-sm",
                        ),
                  )}
                >
                  {m.image_url ? (
                    <ChatMedia
                      path={m.image_url}
                      mediaType={
                        m.media_type
                      }
                    />
                  ) : (
                    <p className="whitespace-pre-wrap break-words">
                      {m.content}
                    </p>
                  )}
                </div>

                {replyCount > 0 && (
                  <p
                    className={cn(
                      "mt-0.5 text-[10px] text-primary",
                      mine &&
                        "text-right",
                    )}
                  >
                    返信{" "}
                    {replyCount} 件
                  </p>
                )}
              </div>

              <span
                className={cn(
                  "mb-1 flex flex-col text-[10px] text-foreground/50",
                  mine
                    ? "items-end"
                    : "items-start",
                )}
              >
                {readCount > 0 && (
                  <span className="text-foreground/60">
                    既読 {readCount}
                  </span>
                )}

                {formatTime(
                  m.created_at,
                )}
              </span>

              <button
                type="button"
                aria-label="このメッセージに返信"
                onClick={() =>
                  setReplyTo(m)
                }
                className="mb-1 rounded-full p-1 text-foreground/30 transition-colors hover:bg-foreground/10 hover:text-primary"
              >
                <Reply className="size-3.5" />
              </button>

              {(mine ||
                isOwner) && (
                <button
                  type="button"
                  aria-label={
                    mine
                      ? "送信を取り消す"
                      : "メッセージを削除"
                  }
                  title={
                    mine
                      ? "送信を取り消す"
                      : "管理者として削除"
                  }
                  onClick={() =>
                    void handleDelete(
                      m,
                    )
                  }
                  className="mb-1 rounded-full p-1 text-foreground/30 transition-colors hover:bg-foreground/10 hover:text-destructive"
                >
                  {mine ? (
                    <Undo2 className="size-3.5" />
                  ) : (
                    <Trash2 className="size-3.5 text-destructive/70 hover:text-destructive" />
                  )}
                </button>
              )}
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
              {members.find(
                (p) =>
                  p.id ===
                  replyTo.sender_id,
              )?.display_name ??
                "メンバー"}{" "}
              さんに返信
            </p>

            <p className="truncate text-xs text-muted-foreground">
              {replyTo.image_url
                ? replyTo.media_type ===
                  "video"
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
            onClick={() =>
              setReplyTo(null)
            }
          >
            <X className="size-4" />
          </Button>
        </div>
      )}

      <form
        onSubmit={send}
        className="flex items-center gap-2 border-t border-border bg-background/95 px-3 py-3 backdrop-blur"
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
          onClick={() =>
            fileRef.current?.click()
          }
        >
          <ImagePlus className="size-5" />
        </Button>

        <Input
          value={text}
          onChange={(e) =>
            setText(e.target.value)
          }
          placeholder="メッセージを入力"
          className="rounded-full"
        />

        <Button
          type="submit"
          size="icon"
          className="rounded-full"
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
  const [description, setDescription] =
    useState("");
  const [approval, setApproval] =
    useState(true);

  const [friends, setFriends] =
    useState<Profile[]>([]);
  const [requests, setRequests] =
    useState<JoinRequest[]>([]);
  const [requesters, setRequesters] =
    useState<Record<string, Profile>>(
      {},
    );

  const isOpenRoom =
    !!group?.is_open;

  useEffect(() => {
    setName(group?.name ?? "");
    setDescription(
      group?.description ?? "",
    );
    setApproval(
      group?.requires_approval ??
        true,
    );
  }, [
    group?.name,
    group?.description,
    group?.requires_approval,
  ]);

  useEffect(() => {
    if (
      !open ||
      !user ||
      isOpenRoom
    )
      return;

    void (async () => {
      const { data: rows } =
        await supabase
          .from("friendships")
          .select("friend_id")
          .eq(
            "user_id",
            user.id,
          );

      const ids = (rows ?? []).map(
        (r) => r.friend_id,
      );

      if (ids.length === 0) {
        setFriends([]);
        return;
      }

      const { data } =
        await supabase
          .from("profiles")
          .select("*")
          .in("id", ids);

      setFriends(
        (data ?? []) as Profile[],
      );
    })();
  }, [
    open,
    user,
    isOpenRoom,
  ]);

  const loadRequests =
    useCallback(async () => {
      if (
        !isOwner ||
        !isOpenRoom
      ) {
        setRequests([]);
        return;
      }

      const { data } =
        await supabase
          .from("group_join_requests")
          .select("*")
          .eq(
            "group_id",
            groupId,
          )
          .eq(
            "status",
            "pending",
          )
          .order(
            "created_at",
            {
              ascending: true,
            },
          )
          .limit(100);

      const list =
        (data ?? []) as JoinRequest[];

      setRequests(list);

      const ids = Array.from(
        new Set(
          list.map(
            (r) => r.user_id,
          ),
        ),
      );

      if (ids.length === 0) {
        setRequesters({});
        return;
      }

      const { data: profs } =
        await supabase
          .from("profiles")
          .select("*")
          .in("id", ids);

      const map: Record<
        string,
        Profile
      > = {};

      for (const p of (profs ??
        []) as Profile[]) {
        map[p.id] = p;
      }

      setRequesters(map);
    }, [
      groupId,
      isOwner,
      isOpenRoom,
    ]);

  useEffect(() => {
    if (open) {
      void loadRequests();
    }
  }, [
    open,
    loadRequests,
  ]);

  const saveRoom = async () => {
    if (!isOwner) return;

    const trimmed =
      maskProfanity(
        name.trim(),
      );

    if (!trimmed) return;

    const patch = isOpenRoom
      ? {
          name: trimmed,
          description:
            maskProfanity(
              description.trim(),
            ),
          requires_approval:
            approval,
        }
      : {
          name: trimmed,
        };

    const { data, error } =
      await supabase
        .from("groups")
        .update(patch)
        .eq("id", groupId)
        .select()
        .single();

    if (error) {
      toast.error(
        "保存できませんでした",
      );
      return;
    }

    toast.success("保存しました");

    onChanged(
      data as Group,
    );
  };

  const review = async (
    request: JoinRequest,
    approve: boolean,
  ) => {
    const { error } =
      await supabase.rpc(
        "approve_join_request",
        {
          _request_id:
            request.id,
          _approve: approve,
        },
      );

    if (error) {
      toast.error(
        error.message.replace(
          /^.*?:\s*/,
          "",
        ),
      );
      return;
    }

    toast.success(
      approve
        ? "参加を承認しました"
        : "申請を却下しました",
    );

    void loadRequests();

    onChanged();
  };

  const addMember = async (
    id: string,
  ) => {
    const { error } =
      await supabase
        .from("group_members")
        .insert({
          group_id: groupId,
          user_id: id,
        });

    if (error) {
      toast.error(
        "メンバーを追加できませんでした",
      );
      return;
    }

    toast.success(
      "メンバーを追加しました",
    );

    onChanged();
  };

  const removeMember = async (
    id: string,
  ) => {
    if (
      !isOwner ||
      id === group?.owner_id
    )
      return;

    const { error } =
      await supabase
        .from("group_members")
        .delete()
        .eq(
          "group_id",
          groupId,
        )
        .eq(
          "user_id",
          id,
        );

    if (error) {
      toast.error(
        "メンバーを削除できませんでした",
      );
      return;
    }

    toast.success(
      "メンバーを削除しました",
    );

    onChanged();
  };

  const candidates =
    friends.filter(
      (f) =>
        !members.some(
          (m) => m.id === f.id,
        ),
    );

  const dirty =
    name.trim() !==
      (group?.name ?? "") ||
    (isOpenRoom &&
      (description.trim() !==
        (group?.description ??
          "") ||
        approval !==
          (group?.requires_approval ??
            true)));

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={
            isOpenRoom
              ? "ルーム設定"
              : "グループ設定"
          }
        >
          <Settings className="size-5" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isOpenRoom
              ? "ルーム設定"
              : "グループ設定"}
          </DialogTitle>

          <DialogDescription>
            {isOwner
              ? isOpenRoom
                ? "作成者は名前と説明、参加方法の変更と、参加申請の承認ができます。"
                : "作成者はグループ名の変更とメンバーの削除ができます。"
              : isOpenRoom
                ? "このルームの設定変更は作成者のみです。"
                : "メンバーの追加はどなたでもできます。名前の変更とメンバー削除は作成者のみです。"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-sm font-semibold">
            {isOpenRoom
              ? "ルーム名"
              : "グループ名"}
          </p>

          <Input
            value={name}
            onChange={(e) =>
              setName(e.target.value)
            }
            disabled={!isOwner}
            maxLength={40}
          />

          {isOpenRoom && (
            <>
              <p className="text-sm font-semibold">
                説明
              </p>

              <Textarea
                value={description}
                onChange={(e) =>
                  setDescription(
                    e.target.value,
                  )
                }
                disabled={!isOwner}
                maxLength={200}
                placeholder="どんな話をするルームかを書きましょう"
              />

              <div className="flex items-center justify-between rounded-2xl bg-muted/60 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">
                    参加に承認が必要
                  </p>

                  <p className="text-[11px] text-muted-foreground">
                    オフにすると誰でもすぐ参加できます
                  </p>
                </div>

                <Switch
                  checked={approval}
                  onCheckedChange={
                    setApproval
                  }
                  disabled={!isOwner}
                />
              </div>
            </>
          )}

          {isOwner && (
            <Button
              className="w-full"
              onClick={saveRoom}
              disabled={
                !name.trim() ||
                !dirty
              }
            >
              保存
            </Button>
          )}
        </div>

        {isOwner &&
          isOpenRoom && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">
                参加申請（
                {requests.length}）
              </p>

              {requests.length ===
              0 ? (
                <p className="text-xs text-muted-foreground">
                  承認待ちの申請はありません。
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {requests.map(
                    (req) => {
                      const p =
                        requesters[
                          req.user_id
                        ];

                      return (
                        <li
                          key={
                            req.id
                          }
                          className="flex items-center gap-2 px-3 py-2"
                        >
                          <Avatar className="size-8">
                            <AvatarImage
                              src={
                                p?.avatar_url ??
                                undefined
                              }
                              alt={
                                p?.display_name ??
                                ""
                              }
                            />

                            <AvatarFallback className="text-[10px]">
                              {initials(
                                p?.display_name ??
                                  "?",
                              )}
                            </AvatarFallback>
                          </Avatar>

                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">
                              {p?.display_name ??
                                "ユーザー"}
                            </span>

                            <span className="block font-mono text-[10px] text-muted-foreground">
                              ID:{" "}
                              {p?.friend_code ??
                                "········"}
                            </span>
                          </span>

                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="承認する"
                            onClick={() =>
                              void review(
                                req,
                                true,
                              )
                            }
                          >
                            <Check className="size-4 text-primary" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="却下する"
                            onClick={() =>
                              void review(
                                req,
                                false,
                              )
                            }
                          >
                            <X className="size-4 text-destructive" />
                          </Button>
                        </li>
                      );
                    },
                  )}
                </ul>
              )}
            </div>
          )}

        <div className="space-y-2">
          <p className="text-sm font-semibold">
            メンバー（
            {members.length}）
          </p>

          <ul className="divide-y divide-border rounded-xl border border-border">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-2 px-3 py-2"
              >
                <Avatar className="size-8">
                  <AvatarImage
                    src={
                      m.avatar_url ??
                      undefined
                    }
                    alt={
                      m.display_name
                    }
                  />

                  <AvatarFallback className="text-[10px]">
                    {initials(
                      m.display_name,
                    )}
                  </AvatarFallback>
                </Avatar>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    {m.display_name}
                  </span>

                  <span className="block font-mono text-[10px] text-muted-foreground">
                    ID:{" "}
                    {m.friend_code}
                  </span>
                </span>

                {group?.owner_id ===
                m.id ? (
                  <span className="text-[10px] text-muted-foreground">
                    作成者
                  </span>
                ) : (
                  isOwner && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="メンバーを削除"
                      onClick={() =>
                        void removeMember(
                          m.id,
                        )
                      }
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  )
                )}
              </li>
            ))}
          </ul>
        </div>

        {!isOpenRoom && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">
              友だちを追加
            </p>

            {candidates.length ===
            0 ? (
              <p className="text-xs text-muted-foreground">
                追加できる友だちがいません。
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {candidates.map(
                  (f) => (
                    <li
                      key={f.id}
                      className="flex items-center gap-2 px-3 py-2"
                    >
                      <Avatar className="size-8">
                        <AvatarImage
                          src={
                            f.avatar_url ??
                            undefined
                          }
                          alt={
                            f.display_name
                          }
                        />

                        <AvatarFallback className="text-[10px]">
                          {initials(
                            f.display_name,
                          )}
                        </AvatarFallback>
                      </Avatar>

                      <span className="min-w-0 flex-1 truncate text-sm">
                        {f.display_name}
                      </span>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          void addMember(
                            f.id,
                          )
                        }
                      >
                        <UserPlus className="mr-1 size-4" />
                        追加
                      </Button>
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
        )}

        {isOwner ? (
          <Button
            variant="ghost"
            className="w-full text-destructive"
            onClick={
              onDeleteGroup
            }
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

            {isOpenRoom
              ? "ルームを退出"
              : "グループを退出"}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
