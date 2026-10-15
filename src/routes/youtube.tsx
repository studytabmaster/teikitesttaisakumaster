import { useState, useEffect, useRef } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Menu,
  Search,
  Mic,
  Video,
  Bell,
  Play,
  Settings,
  Compass,
  Flame,
  Music,
  Gamepad2,
  Newspaper,
  Film,
  Utensils,
  Code2,
  Plane,
  Clock,
  ThumbsUp,
  ListVideo,
  Bookmark,
  Tv,
  User,
  Check,
  X,
  ExternalLink,
  RotateCcw,
  Shield,
  GraduationCap,
  Sparkles,
  Server,
  Loader2,
  MoreVertical,
  Laptop,
  ChevronRight,
  Radio,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/youtube")({
  component: YouTubePage,
  head: () => ({
    meta: [
      { title: "ホーム | YouTube (RINE)" },
      {
        name: "description",
        content: "プロキシ再生・教育モード・テレビ認証連携に対応したYouTubeビューワー。",
      },
    ],
  }),
});

type PlayMethod = "nocookie" | "education" | "kahoot" | "invidious" | "piped" | "custom";

interface VideoItem {
  id: string;
  title: string;
  channel: string;
  channelAvatar?: string;
  views?: string;
  timeAgo?: string;
  duration?: string;
  thumbnail?: string;
}

const CATEGORIES = [
  { label: "すべて", query: "" },
  { label: "急上昇", query: "急上昇 人気 動画" },
  { label: "音楽", query: "邦楽 Official MV 音楽" },
  { label: "ゲーム", query: "マインクラフト ゲーム 実況" },
  { label: "ニュース", query: "ニュース 速報 日本" },
  { label: "アニメ", query: "アニメ 公式 OP ED" },
  { label: "料理", query: "料理 簡単 レシピ" },
  { label: "プログラミング", query: "プログラミング 初心者 解説" },
  { label: "旅行", query: "旅行 日本 観光 VLOG" },
];

const INITIAL_VIDEOS: VideoItem[] = [
  {
    id: "jfKfPfyJRdk",
    title: "lofi hip hop radio - beats to relax/study to",
    channel: "Lofi Girl",
    channelAvatar: "https://yt3.googleusercontent.com/ytc/AIdro_k6aE_w64=s88-c-k-c0x00ffffff-no-rj",
    views: "2.4万人",
    timeAgo: "ライブ配信中",
    duration: "LIVE",
  },
  {
    id: "kJQP7kiw5Fk",
    title: "Luis Fonsi - Despacito ft. Daddy Yankee",
    channel: "Luis Fonsi",
    channelAvatar: "https://yt3.googleusercontent.com/ytc/AIdro_n4R59w=s88-c-k-c0x00ffffff-no-rj",
    views: "84億回",
    timeAgo: "7年前",
    duration: "4:41",
  },
  {
    id: "qwYhKlY4Tx0",
    title: "YOASOBI「咲き誇れ」Official Music Video",
    channel: "YOASOBI",
    channelAvatar: "https://yt3.googleusercontent.com/ytc/AIdro_n-yoasobi=s88-c-k-c0x00ffffff-no-rj",
    views: "120万回",
    timeAgo: "新着",
    duration: "3:18",
  },
  {
    id: "mAKsZ26SabQ",
    title: "I Tried Suspicious Vibecoded Cheat Clients",
    channel: "YouTube",
    views: "89万回",
    timeAgo: "1日前",
    duration: "14:20",
  },
  {
    id: "fJ9rUzIMcZQ",
    title: "Bohemian Rhapsody (Official Video Remastered)",
    channel: "Queen Official",
    views: "17億回",
    timeAgo: "15年前",
    duration: "5:59",
  },
  {
    id: "L_LUpnjgPso",
    title: "Pushing Rise Client to the Limit",
    channel: "Raindots",
    views: "14万回",
    timeAgo: "3日前",
    duration: "2:16",
  },
];

const SUBSCRIPTIONS = [
  { name: "binzo_YT", icon: "🟩" },
  { name: "ごをくんな動画ch", icon: "🐱" },
  { name: "すみかたんだよ-Sumika", icon: "🦊" },
  { name: "サリーぶろっくす", icon: "🧱" },
  { name: "ナイスチキン《マイク...", icon: "🍗" },
];

export function YouTubePage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("すべて");
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState<string>("");
  const [activeChannel, setActiveChannel] = useState<string>("");
  const [videos, setVideos] = useState<VideoItem[]>(INITIAL_VIDEOS);
  const [isSearching, setIsSearching] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // メニュー・モーダル状態
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const avatarMenuRef = useRef<HTMLDivElement>(null);

  // プロキシ・再生設定（localStorage保存）
  const [method, setMethod] = useState<PlayMethod>("nocookie");
  const [invidiousHost, setInvidiousHost] = useState("https://invidious.f5.si");
  const [pipedHost, setPipedHost] = useState("https://cf.piped.video");
  const [customProxyUrl, setCustomProxyUrl] = useState("https://wetube-pro.up.railway.app");
  const [autoPlay, setAutoPlay] = useState(true);

  // ログインユーザー名取得
  const [userName, setUserName] = useState("Wsariclip");
  const [userHandle, setUserHandle] = useState("@切り抜き-y7q");

  useEffect(() => {
    try {
      const savedMethod = localStorage.getItem("rine_yt_method") as PlayMethod;
      if (savedMethod) setMethod(savedMethod);
      const savedInv = localStorage.getItem("rine_yt_invidious");
      if (savedInv) setInvidiousHost(savedInv);
      const savedPiped = localStorage.getItem("rine_yt_piped");
      if (savedPiped) setPipedHost(savedPiped);
      const savedCustom = localStorage.getItem("rine_yt_custom");
      if (savedCustom) setCustomProxyUrl(savedCustom);
    } catch {}

    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        const meta = data.user.user_metadata || {};
        const name = meta.full_name || meta.name || data.user.email?.split("@")[0] || "ユーザー";
        setUserName(name);
        setUserHandle(`@${data.user.email?.split("@")[0] || "user"}`);
      }
    });

    // 画面外クリックでアバターメニューを閉じる
    const handleClickOutside = (e: MouseEvent) => {
      if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target as Node)) {
        setAvatarMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const saveSettings = () => {
    try {
      localStorage.setItem("rine_yt_method", method);
      localStorage.setItem("rine_yt_invidious", invidiousHost);
      localStorage.setItem("rine_yt_piped", pipedHost);
      localStorage.setItem("rine_yt_custom", customProxyUrl);
      toast.success("設定を保存しました");
      setSettingsOpen(false);
    } catch {
      toast.error("設定の保存に失敗しました");
    }
  };

  const extractVideoId = (input: string): string | null => {
    const trimmed = input.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
    const match = trimmed.match(
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
    );
    return match ? match[1] : null;
  };

  const searchVideos = async (searchTerm: string) => {
    if (!searchTerm.trim()) return;
    setIsSearching(true);

    const directId = extractVideoId(searchTerm);
    if (directId) {
      handlePlay(directId, "再生中の動画", "YouTube");
      setIsSearching(false);
      return;
    }

    const instances = [
      invidiousHost,
      "https://invidious.f5.si",
      "https://yewtu.be",
      "https://inv.riverside.rocks",
    ];

    let found = false;
    for (const inst of instances) {
      try {
        const res = await fetch(
          `${inst.replace(/\/+$/, "")}/api/v1/search?q=${encodeURIComponent(searchTerm)}&type=video`,
          { signal: AbortSignal.timeout(4500) }
        );
        if (!res.ok) continue;
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const list: VideoItem[] = data.slice(0, 20).map((item: any) => ({
            id: item.videoId,
            title: item.title,
            channel: item.author || "チャンネル",
            views: item.viewCountText || (item.viewCount ? `${item.viewCount.toLocaleString()}回` : "再生中"),
            timeAgo: item.publishedText || "",
            duration: item.lengthSeconds
              ? `${Math.floor(item.lengthSeconds / 60)}:${String(item.lengthSeconds % 60).padStart(2, "0")}`
              : "動画",
          }));
          setVideos(list);
          found = true;
          break;
        }
      } catch {}
    }

    setIsSearching(false);
    if (!found) {
      toast.error("プロキシ検索に接続できませんでした。動画URLまたは11桁のIDを直接入力してください。");
    }
  };

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (query.trim()) {
      searchVideos(query);
    }
  };

  const handleCategoryClick = (cat: { label: string; query: string }) => {
    setActiveCategory(cat.label);
    if (!cat.query) {
      setVideos(INITIAL_VIDEOS);
    } else {
      searchVideos(cat.query);
    }
  };

  const handlePlay = (id: string, title: string, channel: string) => {
    setActiveVideoId(id);
    setActiveTitle(title);
    setActiveChannel(channel);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // 各種プロキシ・再生URLを生成（確実に再生できる安全なフォールバック付き）
  const getPlayerSrc = (id: string, m: PlayMethod) => {
    const ap = autoPlay ? "1" : "0";
    switch (m) {
      case "nocookie":
        return `https://www.youtube-nocookie.com/embed/${id}?autoplay=${ap}&rel=0`;
      case "education":
        return `https://www.youtube.com/embed/${id}?autoplay=${ap}&enablejsapi=1&iv_load_policy=3`;
      case "kahoot":
        return `https://www.youtube.com/embed/${id}?autoplay=${ap}&controls=1&modestbranding=1`;
      case "invidious":
        return `${invidiousHost.replace(/\/+$/, "")}/embed/${id}?autoplay=${ap}`;
      case "piped":
        return `${pipedHost.replace(/\/+$/, "")}/embed/${id}?autoplay=${ap}`;
      case "custom":
        if (customProxyUrl.includes("wetube")) {
          return `${customProxyUrl.replace(/\/+$/, "")}/watch?v=${id}`;
        }
        return `${customProxyUrl.replace(/\/+$/, "")}/embed/${id}?autoplay=${ap}`;
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      {/* 1. 最上部ヘッダー（添付画像の完全再現） */}
      <header className="sticky top-0 z-40 h-14 bg-card/98 backdrop-blur border-b border-border px-3 sm:px-4 flex items-center justify-between gap-2 shadow-xs">
        {/* 左: ハンバーガーメニュー + YouTubeロゴ */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setSidebarOpen((prev) => !prev)}
            className="p-2 rounded-full hover:bg-muted text-foreground transition-colors"
            title="サイドバー切り替え"
          >
            <Menu className="size-5" />
          </button>

          <Link to="/youtube" className="flex items-center gap-1.5 cursor-pointer">
            <div className="flex h-5 w-7 items-center justify-center rounded-md bg-red-600 text-white shadow-xs">
              <Play className="size-3 fill-white" />
            </div>
            <span className="font-black text-lg tracking-tighter text-foreground flex items-center">
              YouTube
              <span className="ml-1 text-[9px] font-normal text-muted-foreground self-start">JP</span>
            </span>
          </Link>
        </div>

        {/* 中央: 検索ボックス + 検索ボタン + マイク */}
        <div className="flex items-center justify-center flex-1 max-w-2xl px-2">
          <form onSubmit={handleSearchSubmit} className="flex w-full items-center">
            <div className="relative flex-1">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="検索"
                className="h-10 rounded-l-full rounded-r-none border border-border bg-background px-4 text-sm focus-visible:ring-1 focus-visible:ring-primary shadow-inner"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={isSearching}
              className="flex h-10 w-16 items-center justify-center rounded-r-full border border-l-0 border-border bg-muted/60 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              title="検索"
            >
              {isSearching ? <Loader2 className="size-4 animate-spin text-primary" /> : <Search className="size-4" />}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              toast.info("音声検索は現在準備中です。文字で入力してください。");
            }}
            className="ml-2 hidden sm:flex size-10 items-center justify-center rounded-full bg-muted/70 hover:bg-muted text-foreground transition-colors shrink-0"
            title="音声で検索"
          >
            <Mic className="size-4" />
          </button>
        </div>

        {/* 右側: 作成 + アプリ + 通知 + ユーザーアバター */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0 relative" ref={avatarMenuRef}>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="設定"
          >
            <Settings className="size-5" />
          </button>

          <button
            type="button"
            onClick={() => toast.info("通知はありません")}
            className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors relative"
            title="通知"
          >
            <Bell className="size-5" />
            <span className="absolute top-1.5 right-1.5 size-2 bg-red-600 rounded-full" />
          </button>

          {/* ユーザーアバターボタン */}
          <button
            type="button"
            onClick={() => setAvatarMenuOpen((prev) => !prev)}
            className="flex size-9 items-center justify-center rounded-full bg-slate-700 text-white font-bold text-sm hover:ring-2 hover:ring-primary transition-all ml-1"
          >
            {userName.charAt(0).toUpperCase()}
          </button>

          {/* 画像2のアバターポップアップメニュー完全再現 */}
          {avatarMenuOpen && (
            <div className="absolute right-0 top-12 w-64 rounded-xl border border-border bg-card shadow-2xl py-2 z-50 text-foreground animate-in fade-in zoom-in-95 duration-100">
              {/* ユーザー基本情報 */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                <div className="flex size-10 items-center justify-center rounded-full bg-slate-700 text-white font-bold text-base shrink-0">
                  {userName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">{userName}</p>
                  <p className="text-xs text-muted-foreground truncate">{userHandle}</p>
                </div>
              </div>

              <div className="py-1 text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setAvatarMenuOpen(false);
                    navigate({ to: "/profile" });
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2 hover:bg-muted transition-colors text-left"
                >
                  <User className="size-4 text-muted-foreground" />
                  <span>チャンネルを表示</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAvatarMenuOpen(false);
                    setSettingsOpen(true);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2 hover:bg-muted transition-colors text-left"
                >
                  <Settings className="size-4 text-muted-foreground" />
                  <span>設定</span>
                </button>

                <div className="flex items-center justify-between px-4 py-2 hover:bg-muted transition-colors cursor-pointer">
                  <div className="flex items-center gap-3">
                    <Laptop className="size-4 text-muted-foreground" />
                    <span>デザイン: システム既定</span>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setAvatarMenuOpen(false);
                    toast.info("Space: 再生/停止, F: 全画面, M: ミュート, J/L: 10秒スキップ");
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2 hover:bg-muted transition-colors text-left"
                >
                  <ListVideo className="size-4 text-muted-foreground" />
                  <span>キーボード ショートカット</span>
                </button>

                <div className="my-1 border-t border-border" />

                {/* テレビ認証でログインへのリンク */}
                <button
                  type="button"
                  onClick={() => {
                    setAvatarMenuOpen(false);
                    navigate({ to: "/auth" });
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-primary font-medium hover:bg-primary/10 transition-colors text-left"
                >
                  <Tv className="size-4 text-primary" />
                  <span>テレビ認証でログイン</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* 2. メインレイアウト（サイドバー + コンテンツ） */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左サイドバー */}
        <aside
          className={`${
            sidebarOpen ? "w-60" : "w-18"
          } hidden md:flex flex-col border-r border-border bg-card shrink-0 select-none overflow-y-auto max-h-[calc(100vh-3.5rem)] transition-all duration-200 py-3`}
        >
          {sidebarOpen ? (
            <div className="space-y-4 px-3 text-sm">
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveCategory("すべて");
                    setVideos(INITIAL_VIDEOS);
                  }}
                  className="flex w-full items-center gap-5 px-3 py-2.5 rounded-lg bg-muted font-bold text-foreground"
                >
                  <Play className="size-4 fill-foreground" />
                  <span>ホーム</span>
                </button>
                <button
                  type="button"
                  onClick={() => toast.info("Shorts動画を準備中")}
                  className="flex w-full items-center gap-5 px-3 py-2.5 rounded-lg hover:bg-muted/70 text-foreground"
                >
                  <Flame className="size-4" />
                  <span>Shorts</span>
                </button>
                <button
                  type="button"
                  onClick={() => toast.info("登録チャンネル一覧です")}
                  className="flex w-full items-center gap-5 px-3 py-2.5 rounded-lg hover:bg-muted/70 text-foreground"
                >
                  <Radio className="size-4" />
                  <span>登録チャンネル</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="flex w-full items-center gap-5 px-3 py-2.5 rounded-lg hover:bg-muted/70 text-foreground"
                >
                  <Settings className="size-4" />
                  <span>設定</span>
                </button>
              </div>

              <div className="border-t border-border pt-3 space-y-1">
                <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">ライブラリ</p>
                <button
                  type="button"
                  onClick={() => toast.info("視聴履歴")}
                  className="flex w-full items-center gap-5 px-3 py-2.5 rounded-lg hover:bg-muted/70 text-foreground"
                >
                  <Clock className="size-4" />
                  <span>履歴</span>
                </button>
                <button
                  type="button"
                  onClick={() => toast.info("再生リスト")}
                  className="flex w-full items-center gap-5 px-3 py-2.5 rounded-lg hover:bg-muted/70 text-foreground"
                >
                  <ListVideo className="size-4" />
                  <span>再生リスト</span>
                </button>
                <button
                  type="button"
                  onClick={() => toast.info("後で見るに追加された動画はありません")}
                  className="flex w-full items-center gap-5 px-3 py-2.5 rounded-lg hover:bg-muted/70 text-foreground"
                >
                  <Bookmark className="size-4" />
                  <span>後で見る</span>
                </button>
                <button
                  type="button"
                  onClick={() => toast.info("高く評価した動画")}
                  className="flex w-full items-center gap-5 px-3 py-2.5 rounded-lg hover:bg-muted/70 text-foreground"
                >
                  <ThumbsUp className="size-4" />
                  <span>高く評価した動画</span>
                </button>
              </div>

              <div className="border-t border-border pt-3 space-y-1">
                <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  登録チャンネル
                </p>
                {SUBSCRIPTIONS.map((sub) => (
                  <button
                    key={sub.name}
                    type="button"
                    onClick={() => searchVideos(sub.name)}
                    className="flex w-full items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/70 text-xs text-foreground truncate"
                  >
                    <span className="text-sm">{sub.icon}</span>
                    <span className="truncate">{sub.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* 折りたたみ時のミニサイドバー */
            <div className="space-y-4 px-1 text-[10px] text-center">
              <button
                type="button"
                onClick={() => setVideos(INITIAL_VIDEOS)}
                className="flex flex-col items-center gap-1 w-full py-3 rounded-lg hover:bg-muted"
              >
                <Play className="size-5" />
                <span>ホーム</span>
              </button>
              <button
                type="button"
                onClick={() => toast.info("Shorts")}
                className="flex flex-col items-center gap-1 w-full py-3 rounded-lg hover:bg-muted"
              >
                <Flame className="size-5" />
                <span>Shorts</span>
              </button>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="flex flex-col items-center gap-1 w-full py-3 rounded-lg hover:bg-muted"
              >
                <Settings className="size-5" />
                <span>設定</span>
              </button>
              <button
                type="button"
                onClick={() => toast.info("履歴")}
                className="flex flex-col items-center gap-1 w-full py-3 rounded-lg hover:bg-muted"
              >
                <Clock className="size-5" />
                <span>履歴</span>
              </button>
            </div>
          )}
        </aside>

        {/* 右メインエリア */}
        <div className="flex-1 flex flex-col overflow-y-auto max-h-[calc(100vh-3.5rem)]">
          {/* カテゴリチップバー（上部固定） */}
          <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border/60 px-4 py-2.5 flex items-center gap-2 overflow-x-auto no-scrollbar">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.label}
                type="button"
                onClick={() => handleCategoryClick(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  activeCategory === cat.label
                    ? "bg-foreground text-background shadow-xs"
                    : "bg-muted/80 hover:bg-muted text-foreground"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* プレイヤー再生中エリア */}
          {activeVideoId && (
            <div className="w-full bg-black border-b border-border p-2 sm:p-4">
              <div className="mx-auto max-w-4xl">
                <div className="aspect-video w-full rounded-xl overflow-hidden shadow-2xl bg-black relative">
                  <iframe
                    src={getPlayerSrc(activeVideoId, method)}
                    title={activeTitle || "YouTube Video"}
                    className="size-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>

                <div className="mt-3 bg-card rounded-xl p-3 sm:p-4 border border-border shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h1 className="font-bold text-sm sm:text-base text-foreground line-clamp-2">{activeTitle}</h1>
                    <p className="text-xs text-muted-foreground mt-0.5">{activeChannel} • 再生方式: {method}</p>
                  </div>

                  {/* 再生方式のクイック切替タブ */}
                  <div className="flex flex-wrap items-center gap-1 bg-muted p-1 rounded-lg">
                    {(
                      [
                        { id: "nocookie", label: "通常", icon: Shield },
                        { id: "education", label: "教育", icon: GraduationCap },
                        { id: "invidious", label: "Invidious", icon: Server },
                        { id: "piped", label: "Piped", icon: Sparkles },
                        { id: "custom", label: "WeTube", icon: ExternalLink },
                      ] as const
                    ).map((m) => {
                      const Icon = m.icon;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setMethod(m.id);
                            toast.success(`再生方式を ${m.label} に切り替えました`);
                          }}
                          className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-all ${
                            method === m.id
                              ? "bg-card text-foreground shadow-xs font-bold"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Icon className="size-3" />
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 動画グリッド（添付画像1のレイアウト完全再現） */}
          <main className="flex-1 p-4 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-x-4 sm:gap-y-8">
              {videos.map((v) => (
                <div
                  key={v.id}
                  onClick={() => handlePlay(v.id, v.title, v.channel)}
                  className="group flex flex-col cursor-pointer transition-all"
                >
                  {/* サムネイル + 時間バッジ */}
                  <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-muted shadow-xs">
                    <img
                      src={v.thumbnail || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`}
                      alt={v.title}
                      loading="lazy"
                      className="size-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`;
                      }}
                    />
                    {v.duration && (
                      <span className="absolute bottom-1.5 right-1.5 rounded bg-black/85 px-1.5 py-0.5 text-[11px] font-medium text-white shadow-xs">
                        {v.duration}
                      </span>
                    )}
                  </div>

                  {/* タイトル・チャンネル情報 */}
                  <div className="mt-3 flex gap-3 items-start">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-700 text-white font-bold text-xs">
                      {v.channel.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-sm line-clamp-2 leading-snug text-foreground group-hover:text-primary transition-colors">
                        {v.title}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1 truncate hover:text-foreground">
                        {v.channel}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {v.views} • {v.timeAgo}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toast.info("オプション");
                      }}
                      className="text-muted-foreground hover:text-foreground p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <MoreVertical className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </main>
        </div>
      </div>

      {/* 3. ⚙️ 設定モーダル（プロキシ・再生方式の自由設定） */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl text-foreground">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Settings className="size-5 text-primary" />
                <h2 className="font-bold text-base">YouTube・プロキシ再生設定</h2>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-4 py-4 text-xs">
              {/* 再生方式 */}
              <div>
                <label className="font-bold text-xs mb-1.5 block">デフォルト再生方式</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "nocookie", name: "YouTube通常 (NoCookie)", desc: "公式埋め込み" },
                    { id: "education", name: "教育用モード", desc: "関連動画制限" },
                    { id: "invidious", name: "Invidiousプロキシ", desc: "軽量・ブロック回避" },
                    { id: "piped", name: "Pipedプロキシ", desc: "広告なしプロキシ" },
                    { id: "custom", name: "WeTube / 自前URL", desc: "画像記載の独自サーバー" },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setMethod(item.id as PlayMethod)}
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        method === item.id
                          ? "border-primary bg-primary/10 font-bold"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      <div className="text-foreground">{item.name}</div>
                      <div className="text-[10px] text-muted-foreground">{item.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* InvidiousインスタンスURL */}
              <div>
                <label className="font-bold text-xs mb-1 block">Invidious サーバー URL</label>
                <Input
                  value={invidiousHost}
                  onChange={(e) => setInvidiousHost(e.target.value)}
                  placeholder="https://invidious.f5.si"
                  className="h-8 text-xs font-mono"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  国内高速推奨: <code>https://invidious.f5.si</code> または <code>https://yewtu.be</code>
                </p>
              </div>

              {/* PipedインスタンスURL */}
              <div>
                <label className="font-bold text-xs mb-1 block">Piped サーバー URL</label>
                <Input
                  value={pipedHost}
                  onChange={(e) => setPipedHost(e.target.value)}
                  placeholder="https://cf.piped.video"
                  className="h-8 text-xs font-mono"
                />
              </div>

              {/* カスタムプロキシ（WeTubeなど） */}
              <div>
                <label className="font-bold text-xs mb-1 block">WeTube / カスタムプロキシ URL</label>
                <Input
                  value={customProxyUrl}
                  onChange={(e) => setCustomProxyUrl(e.target.value)}
                  placeholder="https://wetube-pro.up.railway.app"
                  className="h-8 text-xs font-mono"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  添付画像のWeTubeサーバー（<code>https://wetube-pro.up.railway.app</code>）等を指定可能
                </p>
              </div>

              {/* 自動再生設定 */}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <div>
                  <p className="font-semibold text-xs">動画クリック時の自動再生</p>
                  <p className="text-[10px] text-muted-foreground">動画選択後すぐに再生を開始します</p>
                </div>
                <input
                  type="checkbox"
                  checked={autoPlay}
                  onChange={(e) => setAutoPlay(e.target.checked)}
                  className="size-4 accent-primary cursor-pointer"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button variant="outline" size="sm" onClick={() => setSettingsOpen(false)}>
                キャンセル
              </Button>
              <Button size="sm" onClick={saveSettings}>
                設定を保存
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
