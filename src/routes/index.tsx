import { StaffBadge } from "@/components/StaffBadge";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bookmark,
  Check,
  Copy,
  MailOpen,
  MessageCircleMore,
  MoreVertical,
  Search,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfiles } from "@/lib/profileCache";
import { cleanupOldData } from "@/lib/cleanup.functions";
import { requestNotificationPermission } from "@/lib/notify";
import { useAuth } from "@/hooks/useAuth";
import { useBlocks } from "@/hooks/useBlocks";
import { AppShell } from "@/components/AppShell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatListTime, formatTime, initials, type Message, type Profile } from "@/lib/rine";
import { useRineTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RINE｜ブラウザで使えるトーク・通話アプリ" },
      {
        name: "description",
        content:
          "RINE はブラウザだけで動くメッセージアプリ。IDで友だち追加して、リアルタイムのトークと音声・ビデオ通話が楽しめます。",
      },
      { property: "og:title", content: "RINE｜ブラウザで使えるトーク・通話アプリ" },
      {
        property: "og:description",
        content: "IDで友だち追加、リアルタイムのトークと無料の音声・ビデオ通話。",
      },
    ],
  }),
  component: TalksPage,
});

type Row = { friend: Profile; last?: Message | undefined; unread: number };

function TalksPage() {
  const { user, profile } = useAuth();
  const { blockedIds } = useBlocks();
  const [theme] = useRineTheme();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const rowsRef = useRef<Row[]>([]);
  rowsRef.current = rows;

  // 通知の許可は最初のタップ時に一度だけ聞く
  useEffect(() => {
    const ask = () => {
      void requestNotificationPermission();
      window.removeEventListener("pointerdown", ask);
    };
    window.addEventListener("pointerdown", ask);
    return () => window.removeEventListener("pointerdown", ask);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      const { data: links } = await supabase
        .from("friendships")
        .select("friend_id")
        .eq("user_id", user.id);
      const ids = (links ?? []).map((l) => l.friend_id);
      if (ids.length === 0) {
        if (!cancelled) {
          setRows([]);
          setLoading(false);
        }
        return;
      }
      const [{ data: profiles }, { data: msgs }] = await Promise.all([
        fetchProfiles(ids).then((data) => ({ data })),
        supabase
          .from("messages")
          .select("id,sender_id,receiver_id,content,image_url,media_type,read_at,created_at")
          .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
      const lastByFriend = new Map<string, Message>();
      const unreadByFriend = new Map<string, number>();
      for (const m of (msgs ?? []) as Message[]) {
        const other = m.sender_id === user.id ? m.receiver_id : m.sender_id;
        if (!lastByFriend.has(other)) lastByFriend.set(other, m);
        if (m.receiver_id === user.id && !m.read_at) {
          unreadByFriend.set(other, (unreadByFriend.get(other) ?? 0) + 1);
        }
      }
      const next = ((profiles ?? []) as Profile[])
        .map((p) => ({
          friend: p,
          last: lastByFriend.get(p.id),
          unread: unreadByFriend.get(p.id) ?? 0,
        }))
        .sort((a, b) => (b.last?.created_at ?? "").localeCompare(a.last?.created_at ?? ""));
      if (!cancelled) {
        setRows(next);
        setLoading(false);
      }
    };

    void load();

    // 古いデータの掃除は1日1回だけ実行（DBコスト削減）
    try {
      const key = "rine-last-cleanup";
      const last = localStorage.getItem(key);
      const today = new Date().toISOString().slice(0, 10);
      if (last !== today) {
        localStorage.setItem(key, today);
        void cleanupOldData();
      }
    } catch {
      // localStorage が使えない環境ではスキップ
    }

    // 連続した更新をまとめて再読み込みし、サーバー負荷を抑える
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleLoad = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void load();
      }, 300);
    };

    const channel = supabase
      .channel("talks-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `receiver_id=eq.${user.id}` },
        scheduleLoad,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships", filter: `user_id=eq.${user.id}` },
        scheduleLoad,
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [user]);

  const visible = useMemo(
    () => rows.filter((r) => !blockedIds.includes(r.friend.id)),
    [rows, blockedIds],
  );

  // LINE風リアルタイム検索（友だちの名前・ID・直近メッセージをフィルタリング）
  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return visible;
    return visible.filter(({ friend, last }) => {
      const name = (friend.display_name ?? "").toLowerCase();
      const code = (friend.friend_code ?? "").toLowerCase();
      const content = (last?.content ?? "").toLowerCase();
      return name.includes(q) || code.includes(q) || content.includes(q);
    });
  }, [visible, searchQuery]);

  const empty = !loading && visible.length === 0;
  const totalUnread = visible.reduce((sum, r) => sum + r.unread, 0);

  const setThreadRead = async (friendId: string, read: boolean) => {
    if (!user) return;
    let error = null;
    if (read) {
      const res = await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("sender_id", friendId)
        .eq("receiver_id", user.id)
        .is("read_at", null);
      error = res.error;
    } else {
      const { data: latest } = await supabase
        .from("messages")
        .select("id")
        .eq("sender_id", friendId)
        .eq("receiver_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!latest) {
        toast.error("未読にできるメッセージがありません");
        return;
      }
      const res = await supabase
        .from("messages")
        .update({ read_at: null })
        .eq("id", latest.id);
      error = res.error;
    }
    if (error) {
      toast.error("変更できませんでした");
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        r.friend.id === friendId
          ? {
              ...r,
              unread: read ? 0 : Math.max(r.unread, 1),
              last:
                r.last && r.last.sender_id === friendId
                  ? { ...r.last, read_at: read ? new Date().toISOString() : null }
                  : r.last,
            }
          : r,
      ),
    );
    toast.success(read ? "既読にしました" : "未読にしました");
  };

  const isLine = theme === "line";

  return (
    <AppShell
      title={totalUnread > 0 ? `トーク (${totalUnread})` : "トーク"}
      action={
        <div className="flex items-center gap-1.5">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
            title="Keepメモ（自分専用のメモ帳）"
          >
            <Link to="/keep">
              <Bookmark className="mr-1 size-3.5 text-amber-500" />
              Keep
            </Link>
          </Button>
          {totalUnread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={async () => {
                for (const r of visible.filter((x) => x.unread > 0)) {
                  await setThreadRead(r.friend.id, true);
                }
              }}
            >
              <MailOpen className="mr-1 size-3.5" />
              既読
            </Button>
          )}
        </div>
      }
    >
      {/* LINE風 検索バー */}
      {!empty && (
        <div className="sticky top-0 z-10 border-b bg-background/95 px-4 py-2.5 backdrop-blur-sm">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="検索"
              className={cn(
                "h-9 w-full rounded-xl pl-9 pr-8 text-sm outline-none transition-colors",
                "bg-muted/60 text-foreground placeholder:text-muted-foreground focus:bg-muted focus:ring-1 focus:ring-primary/40",
              )}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 flex size-5 items-center justify-center rounded-full bg-muted-foreground/20 text-muted-foreground hover:bg-muted-foreground/30"
                aria-label="検索クリア"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {empty ? (
        <div className="flex flex-col items-center gap-5 px-6 py-12 text-center">
          <MessageCircleMore className="size-14 text-muted-foreground/40" />
          <div>
            <p className="text-base font-bold">まだトークがありません</p>
            <p className="mt-1 text-sm text-muted-foreground">
              下の3ステップで、はじめての友だちとトークできます。
            </p>
          </div>

          <ol className="w-full max-w-sm space-y-3 text-left">
            <StepCard
              step={1}
              title="アカウントをつくる"
              body="名前とパスワードだけで登録できます。メールアドレスは必要ありません。"
              done={Boolean(user)}
            />
            <StepCard
              step={2}
              title="自分のIDを相手に伝える"
              body="下のIDをコピーして、友だちに送ってください。相手からも追加してもらえます。"
              done={Boolean(profile?.friend_code)}
            >
              <div className="mt-2 flex items-center gap-2">
                <p className="select-all rounded-xl bg-background px-3 py-1.5 font-mono text-lg font-black tracking-widest">
                  {profile?.friend_code ?? "········"}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!profile?.friend_code}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(profile?.friend_code ?? "");
                      toast.success("IDをコピーしました");
                    } catch {
                      toast.error("コピーできませんでした");
                    }
                  }}
                >
                  <Copy className="mr-1 size-3.5" />
                  コピー
                </Button>
              </div>
            </StepCard>
            <StepCard
              step={3}
              title="相手のIDで検索して追加"
              body="「友だち」タブを開き、相手のIDを入力して検索すると追加できます。"
            >
              <Button asChild variant="brand" size="pill" className="mt-2">
                <Link to="/friends">
                  <UserPlus className="mr-1 size-4" />
                  IDで友だちを追加する
                </Link>
              </Button>
            </StepCard>
          </ol>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          「{searchQuery}」に一致するトークはありません
        </div>
      ) : (
        /* LINE風 2段レイアウト・リスト */
        <ul className="divide-y divide-border/60">
          {filteredRows.map(({ friend, last, unread }) => {
            const mineLast = last?.sender_id === user?.id;
            return (
              <li
                key={friend.id}
                className="group flex items-center transition-colors hover:bg-muted/40 active:bg-muted/60"
              >
                {/* 左側：LINE仕様アバター */}
                <Link
                  to="/friend/$friendId"
                  params={{ friendId: friend.id }}
                  className="shrink-0 py-3.5 pl-4 pr-3"
                  aria-label={`${friend.display_name} のプロフィール`}
                >
                  <Avatar className="size-[50px] ring-1 ring-border/30">
                    <AvatarImage
                      src={friend.avatar_url ?? undefined}
                      alt={friend.display_name}
                      className="object-cover"
                    />
                    <AvatarFallback
                      className={cn(
                        "font-bold text-white",
                        isLine ? "bg-[#06C755]" : "bg-brand-gradient",
                      )}
                    >
                      {initials(friend.display_name)}
                    </AvatarFallback>
                  </Avatar>
                </Link>

                {/* 中央〜右側：上段（名前＋時刻）、下段（本文＋未読バッジ） */}
                <Link
                  to="/chat/$friendId"
                  params={{ friendId: friend.id }}
                  className="flex min-w-0 flex-1 flex-col justify-center py-3.5 pr-2"
                >
                  {/* 上段：名前 ＆ 時刻 */}
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={cn(
                        "truncate text-[15px]",
                        unread > 0 ? "font-bold text-foreground" : "font-semibold text-foreground/90",
                      )}
                    >
                      {friend.display_name}
                      <StaffBadge userId={friend.id} />
                    </p>
                    {last && (
                      <span className="shrink-0 text-[11px] text-muted-foreground/80">
                        {formatListTime(last.created_at)}
                      </span>
                    )}
                  </div>

                  {/* 下段：最新メッセージ ＆ 未読バッジ（LINEグリーン） */}
                  <div className="mt-0.5 flex items-center justify-between gap-3">
                    <p
                      className={cn(
                        "truncate text-[13px] leading-relaxed",
                        unread > 0 ? "font-medium text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {last ? (
                        last.media_type === "missed_call" ? (
                          <span className="text-destructive">📞 不在着信 {formatTime(last.created_at)}</span>
                        ) : last.image_url ? (
                          <span>{mineLast ? "自分: " : ""}📷 画像を送信しました</span>
                        ) : (
                          <span>
                            {mineLast ? "自分: " : ""}
                            {last.content}
                          </span>
                        )
                      ) : (
                        <span className="italic text-muted-foreground/70">
                          {friend.status_message || "トークを始めましょう"}
                        </span>
                      )}
                    </p>

                    <div className="flex shrink-0 items-center gap-1">
                      {unread > 0 ? (
                        <span
                          className={cn(
                            "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-center text-[11px] font-bold leading-none text-white shadow-sm",
                            isLine ? "bg-[#06C755]" : "bg-primary",
                          )}
                        >
                          {unread > 99 ? "99+" : unread}
                        </span>
                      ) : mineLast && last?.read_at ? (
                        <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                          <Check className="size-3 text-[#06C755]" />
                          既読
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>

                {/* 3点メニュー */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="mr-2 size-8 shrink-0 text-muted-foreground hover:text-foreground"
                      aria-label={`${friend.display_name} のトーク操作`}
                    >
                      <MoreVertical className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => void setThreadRead(friend.id, unread === 0 ? false : true)}
                    >
                      {unread > 0 ? "既読にする" : "未読にする"}
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/friend/$friendId" params={{ friendId: friend.id }}>
                        プロフィール・ブロック
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}

function StepCard({
  step,
  title,
  body,
  done,
  children,
}: {
  step: number;
  title: string;
  body: string;
  done?: boolean;
  children?: ReactNode;
}) {
  return (
    <li className="flex gap-3 rounded-2xl bg-muted/60 p-4">
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-black",
          done ? "bg-primary text-primary-foreground" : "bg-background text-foreground/70",
        )}
      >
        {done ? <Check className="size-4" /> : step}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold">{title}</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{body}</p>
        {children}
      </div>
    </li>
  );
}
