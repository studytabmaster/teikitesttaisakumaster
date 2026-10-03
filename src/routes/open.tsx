import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Compass, Plus, Search, Users, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { initials, type Profile } from "@/lib/rine";
import { maskProfanity } from "@/lib/profanity";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/open")({
  head: () => ({
    meta: [
      { title: "オープンチャット｜RINE" },
      {
        name: "description",
        content:
          "RINE のオープンチャット。だれでも入れる公開ルームを検索して参加申請したり、自分のルームを作って仲間を集められます。",
      },
      { property: "og:title", content: "オープンチャット｜RINE" },
      {
        property: "og:description",
        content: "趣味の合う公開ルームを検索して参加。自分のルームも作れます。",
      },
    ],
  }),
  component: OpenChatPage,
});

type OpenRoom = {
  id: string;
  name: string;
  description: string;
  avatar_url: string | null;
  owner_id: string;
  requires_approval: boolean;
  is_adult?: boolean;
  created_at: string;
};

type JoinRequest = {
  id: string;
  group_id: string;
  user_id: string;
  message: string;
  status: string;
  created_at: string;
};

type Tab = "discover" | "joined" | "requests";
let cachedRooms: OpenRoom[] | null = null;
let cachedCounts: Record<string, number> = {};
let lastFetchTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

function OpenChatPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("discover");
  const [query, setQuery] = useState("");
  const [rooms, setRooms] = useState<OpenRoom[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [myRequests, setMyRequests] = useState<JoinRequest[]>([]);
  const [incoming, setIncoming] = useState<JoinRequest[]>([]);
  const [requesters, setRequesters] = useState<Record<string, Profile>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // 新規ルーム作成フォーム
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [approval, setApproval] = useState(true);
  const [adultRoom, setAdultRoom] = useState(false);
  const [isAdult, setIsAdult] = useState(false);
  const [pinkMode, setPinkMode] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [birth, setBirth] = useState("");
  const [agree, setAgree] = useState(false);

  useEffect(() => {
    if (!user) return;
    void supabase
      .from("profiles")
      .select("adult_verified_at")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setIsAdult(!!data?.adult_verified_at));
  }, [user]);

  const verifyAge = async () => {
    if (!birth || !agree) {
      toast.error("生年月日を入力し、注意事項に同意してください");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("confirm_adult", { _birth_date: birth });
    setBusy(false);
    if (error) {
      toast.error(error.message.replace(/^.*?:\s*/, ""));
      return;
    }
    setIsAdult(true);
    setVerifyOpen(false);
    setPinkMode(true);
    cachedRooms = null;
    toast.success("年齢確認が完了しました");
    void load();
  };


    const load = useCallback(async () => {
    if (!user) return;

    // 自分の参加中IDは常に取得して反映（インデックス検索なのでDB負荷ほぼゼロ・確実に入室中を表示）
    const { data: memberships } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", user.id);

    const joinedIds = (memberships ?? []).map((m) => m.group_id);
    setMemberIds(joinedIds);

    const now = Date.now();
    // 人数は参加・退出・削除ですぐ変わるので、毎回まとめて1回で最新を取得する
    const fetchCounts = async (ids: string[]) => {
      if (ids.length === 0) return {} as Record<string, number>;
      const { data } = await supabase.rpc("open_group_member_counts", { _group_ids: ids });
      const map: Record<string, number> = {};
      for (const row of (data ?? []) as { group_id: string; member_count: number }[]) {
        map[row.group_id] = row.member_count;
      }
      return map;
    };

    // ルーム一覧は5分キャッシュ（人数は毎回最新）
    if (cachedRooms && now - lastFetchTime < CACHE_TTL) {
      setRooms(cachedRooms);
      setCounts(cachedCounts);
      setLoading(false);
      const fresh = await fetchCounts(cachedRooms.map((r) => r.id));
      cachedCounts = fresh;
      setCounts(fresh);
      return;
    }

    const [{ data: openRooms }, { data: myJoinedRooms }, { data: reqs }] = await Promise.all([
      supabase
        .from("groups")
        .select("id,name,description,avatar_url,owner_id,requires_approval,is_adult,created_at")
        .eq("is_open", true)
        .order("created_at", { ascending: false })
        .limit(1000),
      joinedIds.length > 0
        ? supabase
            .from("groups")
            .select("id,name,description,avatar_url,owner_id,requires_approval,is_adult,created_at")
            .in("id", joinedIds)
            .eq("is_open", true)
        : Promise.resolve({ data: [] }),
      supabase.from("group_join_requests").select("*").limit(500),
    ]);

    const roomMap = new Map<string, OpenRoom>();
    for (const r of ((openRooms ?? []) as OpenRoom[])) roomMap.set(r.id, r);
    for (const r of ((myJoinedRooms ?? []) as OpenRoom[])) roomMap.set(r.id, r);

    const list = Array.from(roomMap.values());
    setRooms(list);
    setMemberIds(joinedIds);

    const all = (reqs ?? []) as JoinRequest[];
    setMyRequests(all.filter((r) => r.user_id === user.id));
    const mineToReview = all.filter((r) => r.user_id !== user.id && r.status === "pending");
    setIncoming(mineToReview);

    const countMap = await fetchCounts(list.map((r) => r.id));

    cachedRooms = list;
    cachedCounts = countMap;
    lastFetchTime = now;

    setCounts(countMap);
    setLoading(false);
  }, [user]);


   
  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = rooms.filter(
      (r) => !memberIds.includes(r.id) && !!r.is_adult === (pinkMode && isAdult),
    );
    if (!q) return base;
    return base.filter(
      (r) => r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q),
    );
  }, [rooms, memberIds, query, pinkMode, isAdult]);

  const joined = useMemo(() => rooms.filter((r) => memberIds.includes(r.id)), [rooms, memberIds]);

  const requestStatus = (groupId: string) =>
    myRequests.find((r) => r.group_id === groupId)?.status ?? null;

  const join = async (room: OpenRoom) => {
    if (!user) return;
    setBusy(true);
    if (room.requires_approval) {
      const { error } = await supabase
        .from("group_join_requests")
        .insert({ group_id: room.id, user_id: user.id, message: "" });
      setBusy(false);
      if (error) {
        toast.error("申請できませんでした");
        return;
      }
      toast.success("参加を申請しました。承認をお待ちください");
    } else {
      const { error } = await supabase.rpc("join_open_group", { _group_id: room.id });
      setBusy(false);
      if (error) {
        toast.error(error.message.replace(/^.*?:\s*/, ""));
        return;
      }
      toast.success("ルームに参加しました");
    }
    void load();
  };

  const review = async (request: JoinRequest, approve: boolean) => {
    setBusy(true);
    const { error } = await supabase.rpc("approve_join_request", {
      _request_id: request.id,
      _approve: approve,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message.replace(/^.*?:\s*/, ""));
      return;
    }
    toast.success(approve ? "参加を承認しました" : "申請を却下しました");
    void load();
  };

  const create = async () => {
    if (!user) return;
    const clean = maskProfanity(name.trim());
    if (clean.length < 2) {
      toast.error("ルーム名を2文字以上で入力してください");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase
      .from("groups")
      .insert({
        name: clean,
        description: maskProfanity(description.trim()),
        owner_id: user.id,
        is_open: true,
        requires_approval: approval,
        is_adult: isAdult && adultRoom,
      })
      .select("id")
      .maybeSingle();
    if (error || !data) {
      setBusy(false);
      toast.error("ルームを作れませんでした");
      return;
    }
    await supabase.from("group_members").insert({ group_id: data.id, user_id: user.id });
    setBusy(false);
    setCreateOpen(false);
    setName("");
    setDescription("");
    setAdultRoom(false);
    cachedRooms = null;
    toast.success("オープンチャットを作成しました");
    void load();
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: "discover", label: "さがす" },
    { key: "joined", label: `参加中 (${joined.length})` },
    { key: "requests", label: `申請 (${incoming.length})` },
  ];

  return (
    <AppShell
      title="オープンチャット"
      action={
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button variant="brand" size="sm" className="rounded-full">
              <Plus className="mr-1 size-4" />
              作成
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-3xl">
            <DialogHeader>
              <DialogTitle>オープンチャットを作る</DialogTitle>
              <DialogDescription>
                だれでも検索して参加できる公開ルームです。作成者だけが名前・説明を編集し、申請を承認できます。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="room-name">ルーム名</Label>
                <Input
                  id="room-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例: ゲーム好き集まれ"
                  maxLength={40}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="room-desc">説明</Label>
                <Textarea
                  id="room-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="どんな話をするルームかを書きましょう"
                  maxLength={200}
                />
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-muted/60 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">参加に承認が必要</p>
                  <p className="text-[11px] text-muted-foreground">
                    オフにすると誰でもすぐ参加できます
                  </p>
                </div>
                <Switch checked={approval} onCheckedChange={setApproval} />
              </div>
              {isAdult && (
                <div className="flex items-center justify-between rounded-2xl bg-muted/60 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold">🔞 ピンクチャンネルにする</p>
                    <p className="text-[11px] text-muted-foreground">
                      年齢確認済みの18歳以上の人だけに表示されます
                    </p>
                  </div>
                  <Switch checked={adultRoom} onCheckedChange={setAdultRoom} />
                </div>
              )}
              <Button variant="brand" size="pill" className="w-full" disabled={busy} onClick={create}>
                作成する
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="grid grid-cols-3 gap-1 border-b border-border bg-background px-3 py-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-full py-2 text-xs font-bold transition-colors",
              tab === t.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "discover" && (
        <>
          <div className="mx-4 mt-4 flex gap-2">
            <Button
              size="sm"
              variant={!pinkMode ? "brand" : "outline"}
              className="flex-1 rounded-full"
              onClick={() => setPinkMode(false)}
            >
              通常ルーム
            </Button>
            <Button
              size="sm"
              variant={pinkMode ? "brand" : "outline"}
              className="flex-1 rounded-full"
              onClick={() => (isAdult ? setPinkMode(true) : setVerifyOpen(true))}
            >
              🔞 ピンクチャンネル
            </Button>
          </div>
          <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
            <DialogContent className="rounded-3xl">
              <DialogHeader>
                <DialogTitle>🔞 年齢確認</DialogTitle>
                <DialogDescription>
                  ピンクチャンネルは18歳以上の方専用です。生年月日は一度登録すると変更できません。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="birth">生年月日</Label>
                  <Input id="birth" type="date" value={birth} onChange={(e) => setBirth(e.target.value)} />
                </div>
                <ul className="list-disc space-y-1 rounded-2xl bg-muted/60 px-6 py-3 text-[11px] text-muted-foreground">
                  <li>18歳未満の方の利用は禁止です。年齢を偽った場合はBANされます。</li>
                  <li>未成年に関わる内容、無修正画像、売買春・出会いの勧誘、違法行為は禁止です。</li>
                  <li>違反を見つけたら通報してください。</li>
                </ul>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                  18歳以上であり、上記に同意します
                </label>
                <Button variant="brand" size="pill" className="w-full" disabled={busy} onClick={verifyAge}>
                  確認する
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <div className="relative m-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ルーム名や説明で検索"
              className="rounded-full pl-9"
            />
          </div>
          {!loading && filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
              <Compass className="size-12 text-muted-foreground/40" />
              <p className="text-base font-bold">ルームが見つかりません</p>
              <p className="text-sm text-muted-foreground">
                検索の言葉を変えるか、「作成」で自分のオープンチャットを作りましょう。
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((room) => {
                const status = requestStatus(room.id);
                return (
                  <li key={room.id} className="flex items-center gap-3 px-5 py-4">
                    <Avatar className="size-12">
                      <AvatarImage src={room.avatar_url ?? undefined} alt={room.name} />
                      <AvatarFallback className="bg-brand-gradient text-primary-foreground">
                        {initials(room.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">
                        {room.is_adult && <span className="mr-1 text-destructive">🔞</span>}
                        {room.name}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {room.description || "説明はまだありません"}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Users className="size-3" />
                        {counts[room.id] ?? 0}人
                        {room.requires_approval ? "・承認制" : "・だれでも参加"}
                      </p>
                    </div>
                    {status === "pending" ? (
                      <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                        申請中
                      </span>
                    ) : status === "rejected" ? (
                      <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                        却下
                      </span>
                    ) : (
                      <Button
                        variant="brand"
                        size="sm"
                        className="shrink-0 rounded-full"
                        disabled={busy}
                        onClick={() => void join(room)}
                      >
                        {room.requires_approval ? "参加申請" : "参加する"}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {tab === "joined" && (
        <>
          {joined.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
              <Users className="size-12 text-muted-foreground/40" />
              <p className="text-base font-bold">参加中のルームはありません</p>
              <p className="text-sm text-muted-foreground">
                「さがす」タブから気になるルームに参加してみましょう。
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {joined.map((room) => (
                <li key={room.id}>
                  <Link
                    to="/group/$groupId"
                    params={{ groupId: room.id }}
                    className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-muted/60"
                  >
                    <Avatar className="size-12">
                      <AvatarImage src={room.avatar_url ?? undefined} alt={room.name} />
                      <AvatarFallback className="bg-brand-gradient text-primary-foreground">
                        {initials(room.name)}
                      </AvatarFallback>
                    </Avatar>
                                       <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{room.name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {room.description || "トークを始めましょう"}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Users className="size-3" />
                        {counts[room.id] ?? 0}人
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {tab === "requests" && (
        <>
          {incoming.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
              <Check className="size-12 text-muted-foreground/40" />
              <p className="text-base font-bold">承認待ちの申請はありません</p>
              <p className="text-sm text-muted-foreground">
                あなたが作ったルームへの参加申請がここに届きます。
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {incoming.map((req) => {
                const p = requesters[req.user_id];
                const room = rooms.find((r) => r.id === req.group_id);
                return (
                  <li key={req.id} className="flex items-center gap-3 px-5 py-4">
                    <Avatar className="size-11">
                      <AvatarImage src={p?.avatar_url ?? undefined} alt={p?.display_name ?? ""} />
                      <AvatarFallback className="bg-brand-gradient text-primary-foreground">
                        {initials(p?.display_name ?? "?")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{p?.display_name ?? "ユーザー"}</p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">
                        ID: {p?.friend_code ?? "········"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {room?.name ?? "ルーム"} への参加希望
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="brand"
                        size="icon"
                        className="rounded-full"
                        aria-label="承認する"
                        disabled={busy}
                        onClick={() => void review(req, true)}
                      >
                        <Check className="size-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="rounded-full"
                        aria-label="却下する"
                        disabled={busy}
                        onClick={() => void review(req, false)}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </AppShell>
  );
}
