import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Menu,
  Search,
  Settings,
  Flame,
  Music,
  Gamepad2,
  Tv,
  X,
  Bookmark,
  Loader2,
  MoreVertical,
  ArrowLeft,
  Share2,
  Play,
  ThumbsUp,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/youtube")({
  head: () => ({
    meta: [
      { title: "RINETube｜広告なし高速動画プレイヤー" },
      { name: "description", content: "高速・軽量・広告完全なしのYouTubeクライアント「RINETube」" },
    ],
  }),
  component: RINETubePage,
});

type PlayMode = "rinetube" | "invidious" | "education" | "nocookie";

interface VideoItem {
  id: string;
  title: string;
  author: string;
  publishedText: string;
  viewCountText: string;
  durationText?: string;
}

const CATEGORIES = [
  { id: "all", label: "すべて", query: "おすすめ" },
  { id: "trending", label: "急上昇", query: "急上昇" },
  { id: "music", label: "音楽", query: "音楽 MV Official" },
  { id: "gaming", label: "ゲーム", query: "ゲーム 実況" },
  { id: "anime", label: "アニメ", query: "アニメ 公式" },
  { id: "cooking", label: "料理", query: "料理 レシピ" },
  { id: "news", label: "ニュース", query: "ニュース 速報" },
  { id: "edu", label: "学習", query: "解説 科学" },
  { id: "live", label: "ライブ", query: "ライブ配信" },
];

const DEFAULT_INVIDIOUS = "https://invidious.f5.si";

const FALLBACK_INVIDIOUS_HOSTS = [
  "https://invidious.f5.si",
  "https://yewtu.be",
  "https://invidious.nerdvpn.de",
  "https://inv.riverside.rocks",
];

// 初回読み込み時のプリセット動画
const INITIAL_VIDEOS: VideoItem[] = [
  {
    id: "jfKfPfyJRdk",
    title: "lofi hip hop radio 📚 - beats to relax/study to",
    author: "Lofi Girl",
    publishedText: "ライブ配信中",
    viewCountText: "4.8万人視聴中",
    durationText: "LIVE",
  },
  {
    id: "kJQP7kiw5Fk",
    title: "Luis Fonsi - Despacito ft. Daddy Yankee",
    author: "Luis Fonsi",
    publishedText: "7年前",
    viewCountText: "84億回視聴",
    durationText: "4:41",
  },
  {
    id: "fJ9rUzIMcZQ",
    title: "Queen – Bohemian Rhapsody (Official Video Remastered)",
    author: "Queen Official",
    publishedText: "15年前",
    viewCountText: "17億回視聴",
    durationText: "5:59",
  },
  {
    id: "JGwWNGJdvx8",
    title: "Ed Sheeran - Shape of You (Official Music Video)",
    author: "Ed Sheeran",
    publishedText: "7年前",
    viewCountText: "62億回視聴",
    durationText: "4:23",
  },
  {
    id: "9bZkp7q19f0",
    title: "PSY - GANGNAM STYLE(강남스타일) M/V",
    author: "officialpsy",
    publishedText: "12年前",
    viewCountText: "51億回視聴",
    durationText: "4:12",
  },
  {
    id: "OPf0YbXqDm0",
    title: "Mark Ronson - Uptown Funk ft. Bruno Mars",
    author: "Mark Ronson",
    publishedText: "9年前",
    viewCountText: "52億回視聴",
    durationText: "4:30",
  },
];

function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("youtu.be")) {
      return url.pathname.slice(1).slice(0, 11) || null;
    }
    if (url.searchParams.has("v")) {
      return url.searchParams.get("v")?.slice(0, 11) || null;
    }
    const match = trimmed.match(/(?:embed|shorts|v)\/([a-zA-Z0-9_-]{11})/);
    if (match) return match[1];
  } catch {
    const match = trimmed.match(/([a-zA-Z0-9_-]{11})/);
    if (match) return match[1];
  }
  return null;
}

export function RINETubePage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [videos, setVideos] = useState<VideoItem[]>(INITIAL_VIDEOS);
  const [currentVideo, setCurrentVideo] = useState<VideoItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  // 再生モード & プロキシ設定
  const [mode, setMode] = useState<PlayMode>("invidious");
  const [invidiousHost, setInvidiousHost] = useState(DEFAULT_INVIDIOUS);
  const [customProxyUrl, setCustomProxyUrl] = useState("");
  const [autoPlay, setAutoPlay] = useState(true);

  // モーダル
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  // RINEユーザー情報
  const [currentUsername, setCurrentUsername] = useState("ゲスト");

  useEffect(() => {
    try {
      const savedMode = localStorage.getItem("rinetube_play_mode") as PlayMode;
      if (savedMode) setMode(savedMode);
      const savedHost = localStorage.getItem("rinetube_invidious_host");
      if (savedHost) setInvidiousHost(savedHost);
      const savedCustom = localStorage.getItem("rinetube_custom_proxy");
      if (savedCustom) setCustomProxyUrl(savedCustom);
      const savedHist = localStorage.getItem("rinetube_search_history");
      if (savedHist) setSearchHistory(JSON.parse(savedHist));
    } catch {
      // ignore
    }

    void supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        const name = (data.user.user_metadata?.username as string) || data.user.email?.split("@")[0] || "ユーザー";
        setCurrentUsername(name);
      }
    });

    void searchVideos("おすすめ", false);
  }, []);

  async function searchVideos(q: string, saveToHistory = true) {
    if (!q.trim()) return;
    setLoading(true);

    if (saveToHistory) {
      setSearchHistory((prev) => {
        const next = [q, ...prev.filter((item) => item !== q)].slice(0, 10);
        try {
          localStorage.setItem("rinetube_search_history", JSON.stringify(next));
        } catch {}
        return next;
      });
    }

    const directId = extractVideoId(q);
    if (directId) {
      setCurrentVideo({
        id: directId,
        title: `YouTube 動画 (${directId})`,
        author: "YouTube",
        publishedText: "即時再生",
        viewCountText: "再生中",
      });
      setLoading(false);
      return;
    }

    const hostsToTry = [invidiousHost, ...FALLBACK_INVIDIOUS_HOSTS.filter((h) => h !== invidiousHost)];
    let fetched = false;

    for (const host of hostsToTry) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(
          `${host}/api/v1/search?q=${encodeURIComponent(q)}&type=video&sort=relevance`,
          { signal: controller.signal }
        );
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            const mapped: VideoItem[] = data.slice(0, 24).map((item: any) => ({
              id: item.videoId || item.id,
              title: item.title || "無題の動画",
              author: item.author || item.authorName || "チャンネル",
              publishedText: item.publishedText || "公開中",
              viewCountText: item.viewCountText || (item.viewCount ? `${item.viewCount.toLocaleString()} 回視聴` : ""),
              durationText: item.lengthSeconds
                ? `${Math.floor(item.lengthSeconds / 60)}:${String(item.lengthSeconds % 60).padStart(2, "0")}`
                : undefined,
            }));
            setVideos(mapped);
            fetched = true;
            break;
          }
        }
      } catch {
        // 次のホストを試す
      }
    }

    if (!fetched) {
      toast.error("動画検索サーバーが混雑しています。URLまたはIDを貼り付けて再生できます。");
    }
    setLoading(false);
  }

  function handleSelectCategory(cat: typeof CATEGORIES[number]) {
    setSelectedCategory(cat.id);
    void searchVideos(cat.query, false);
  }

  function getPlayerSrc(videoId: string) {
    const autoParam = autoPlay ? "1" : "0";
    if (mode === "rinetube" && customProxyUrl.trim()) {
      const cleanCustom = customProxyUrl.replace(/\/$/, "");
      return `${cleanCustom}/watch?v=${videoId}&embed=1&autoplay=${autoParam}`;
    }
    if (mode === "invidious") {
      const cleanHost = invidiousHost.replace(/\/$/, "");
      return `${cleanHost}/embed/${videoId}?autoplay=${autoParam}&quality=dash`;
    }
    if (mode === "education") {
      return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=${autoParam}&rel=0&modestbranding=1&iv_load_policy=3`;
    }
    return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=${autoParam}&rel=0`;
  }

  function saveSettings() {
    try {
      localStorage.setItem("rinetube_play_mode", mode);
      localStorage.setItem("rinetube_invidious_host", invidiousHost);
      localStorage.setItem("rinetube_custom_proxy", customProxyUrl);
      toast.success("RINETube の設定を保存しました");
      setSettingsOpen(false);
    } catch {
      toast.error("保存に失敗しました");
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#0f0f0f] text-[#f1f1f1] font-sans antialiased">
      {/* ===== 上部ヘッダー ===== */}
      <header className="sticky top-0 z-40 flex items-center justify-between h-14 px-4 bg-[#0f0f0f]/95 border-b border-[#272727] backdrop-blur">
        {/* 左: メニュー & ロゴ */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setSidebarOpen((prev) => !prev)}
            className="p-2 rounded-full hover:bg-[#272727] text-[#f1f1f1] transition-colors"
            title="サイドバー表示切替"
          >
            <Menu className="size-5" />
          </button>

          <Link to="/youtube" className="flex items-center gap-1.5 focus:outline-none">
            <div className="flex items-center justify-center size-7 rounded-lg bg-red-600 text-white shadow-md">
              <Play className="size-4 fill-white ml-0.5" />
            </div>
            <div className="flex items-center">
              <span className="font-bold text-lg tracking-tight text-white">RINETube</span>
              <span className="text-[10px] text-[#aaa] ml-1 font-semibold self-start">JP</span>
            </div>
          </Link>
        </div>

        {/* 中央: 検索バー */}
        <div className="relative flex-1 max-w-xl mx-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setHistoryOpen(false);
              void searchVideos(query);
            }}
            className="flex items-center"
          >
            <div className="relative flex-1">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setHistoryOpen(true)}
                placeholder="動画検索、またはYouTube URL・IDを貼り付け"
                className="w-full h-10 px-4 pr-9 text-sm rounded-l-full bg-[#121212] border border-[#303030] text-[#f1f1f1] placeholder-[#888] focus:outline-none focus:border-[#3ea6ff]"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#888] hover:text-white"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            <button
              type="submit"
              className="flex items-center justify-center w-14 h-10 rounded-r-full bg-[#222222] border border-l-0 border-[#303030] hover:bg-[#272727] text-[#f1f1f1] transition-colors"
              title="検索"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            </button>
          </form>

          {/* 検索履歴 */}
          {historyOpen && searchHistory.length > 0 && (
            <div
              className="absolute left-0 right-14 top-11 bg-[#212121] border border-[#303030] rounded-xl shadow-2xl overflow-hidden z-50 py-1"
              onMouseLeave={() => setHistoryOpen(false)}
            >
              <div className="px-3 py-1.5 text-[11px] font-semibold text-[#aaa] flex justify-between items-center border-b border-[#303030]">
                <span>最近の検索</span>
                <button
                  type="button"
                  onClick={() => {
                    setSearchHistory([]);
                    localStorage.removeItem("rinetube_search_history");
                  }}
                  className="text-red-400 hover:underline text-[10px]"
                >
                  履歴クリア
                </button>
              </div>
              {searchHistory.map((hist, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between px-3 py-2 text-xs text-[#f1f1f1] hover:bg-[#383838] cursor-pointer"
                  onClick={() => {
                    setQuery(hist);
                    setHistoryOpen(false);
                    void searchVideos(hist);
                  }}
                >
                  <span className="truncate">{hist}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const next = searchHistory.filter((_, i) => i !== idx);
                      setSearchHistory(next);
                      localStorage.setItem("rinetube_search_history", JSON.stringify(next));
                    }}
                    className="text-[#aaa] hover:text-white p-1"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 右: ナビゲーション & 設定 */}
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-[#272727] hover:bg-[#383838] text-[#f1f1f1] transition-colors border border-[#3e3e3e]"
            title="RINEトーク画面に戻る"
          >
            <ArrowLeft className="size-3.5" />
            <span className="hidden sm:inline">RINEへ戻る</span>
          </Link>

          <Link
            to="/auth"
            className="flex items-center justify-center p-2 rounded-full hover:bg-[#272727] text-[#f1f1f1]"
            title="テレビ認証"
          >
            <Tv className="size-5" />
          </Link>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-full hover:bg-[#272727] text-[#f1f1f1]"
            title="再生・プロキシ設定"
          >
            <Settings className="size-5" />
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setUserMenuOpen((prev) => !prev)}
              className="flex items-center justify-center size-8 rounded-full bg-primary font-bold text-xs text-white shadow"
            >
              {currentUsername.slice(0, 1).toUpperCase()}
            </button>

            {userMenuOpen && (
              <div
                className="absolute right-0 top-10 w-56 bg-[#282828] border border-[#3e3e3e] rounded-xl shadow-2xl py-2 z-50"
                onClick={() => setUserMenuOpen(false)}
              >
                <div className="px-4 py-2 border-b border-[#3e3e3e]">
                  <p className="font-semibold text-sm truncate text-white">{currentUsername}</p>
                  <p className="text-[11px] text-[#aaa]">RINETube 広告なし</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="flex items-center gap-2.5 w-full px-4 py-2 text-xs text-left hover:bg-[#3e3e3e] text-[#f1f1f1]"
                >
                  <Settings className="size-4 text-[#aaa]" />
                  <span>プロキシ・再生設定</span>
                </button>
                <Link
                  to="/keep"
                  className="flex items-center gap-2.5 w-full px-4 py-2 text-xs text-left hover:bg-[#3e3e3e] text-[#f1f1f1]"
                >
                  <Bookmark className="size-4 text-[#aaa]" />
                  <span>Keepメモを開く</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ===== メインレイアウト ===== */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左サイドバー */}
        <aside
          className={`flex-shrink-0 transition-all duration-200 border-r border-[#272727] bg-[#0f0f0f] ${
            sidebarOpen ? "w-56" : "w-16"
          } hidden md:flex flex-col py-3 px-2 gap-1 overflow-y-auto`}
        >
          <button
            type="button"
            onClick={() => {
              setCurrentVideo(null);
              void searchVideos("おすすめ", false);
            }}
            className="flex items-center gap-4 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-[#272727] text-white transition-colors"
          >
            <Play className="size-5 fill-white text-white flex-shrink-0" />
            {sidebarOpen && <span>ホーム</span>}
          </button>

          <button
            type="button"
            onClick={() => void searchVideos("Shorts 人気", false)}
            className="flex items-center gap-4 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-[#272727] text-[#aaa] hover:text-white transition-colors"
          >
            <Flame className="size-5 text-red-500 flex-shrink-0" />
            {sidebarOpen && <span>急上昇 / Shorts</span>}
          </button>

          <button
            type="button"
            onClick={() => void searchVideos("公式 音楽", false)}
            className="flex items-center gap-4 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-[#272727] text-[#aaa] hover:text-white transition-colors"
          >
            <Music className="size-5 flex-shrink-0" />
            {sidebarOpen && <span>音楽</span>}
          </button>

          <button
            type="button"
            onClick={() => void searchVideos("ゲーム 実況", false)}
            className="flex items-center gap-4 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-[#272727] text-[#aaa] hover:text-white transition-colors"
          >
            <Gamepad2 className="size-5 flex-shrink-0" />
            {sidebarOpen && <span>ゲーム</span>}
          </button>

          <div className="my-2 border-t border-[#272727]" />

          <Link
            to="/keep"
            className="flex items-center gap-4 px-3 py-2 rounded-xl text-xs font-medium hover:bg-[#272727] text-[#aaa] hover:text-white transition-colors"
          >
            <Bookmark className="size-4.5 flex-shrink-0" />
            {sidebarOpen && <span>Keepメモ</span>}
          </Link>

          <Link
            to="/"
            className="flex items-center gap-4 px-3 py-2 rounded-xl text-xs font-medium hover:bg-[#272727] text-[#aaa] hover:text-white transition-colors"
          >
            <ArrowLeft className="size-4.5 flex-shrink-0" />
            {sidebarOpen && <span>トークに戻る</span>}
          </Link>
        </aside>

        {/* コンテンツエリア */}
        <main className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
          {!currentVideo && (
            <div className="flex items-center gap-2 pb-4 overflow-x-auto no-scrollbar">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleSelectCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    selectedCategory === cat.id
                      ? "bg-white text-black"
                      : "bg-[#272727] text-[#f1f1f1] hover:bg-[#383838]"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          )}

          {/* ===== 再生画面 ===== */}
          {currentVideo ? (
            <div className="max-w-5xl mx-auto space-y-4">
              <div className="flex items-center justify-between bg-[#1f1f1f] p-2.5 rounded-xl border border-[#333]">
                <button
                  type="button"
                  onClick={() => setCurrentVideo(null)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-[#aaa] hover:text-white px-2 py-1 rounded-lg hover:bg-[#2c2c2c] transition-colors"
                >
                  <ArrowLeft className="size-4" />
                  <span>一覧に戻る</span>
                </button>

                <div className="flex items-center gap-1 text-xs">
                  <span className="text-[#888] mr-1 hidden sm:inline">再生方式:</span>
                  {(["invidious", "rinetube", "education", "nocookie"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                        mode === m ? "bg-red-600 text-white" : "bg-[#2b2b2b] text-[#aaa] hover:text-white"
                      }`}
                    >
                      {m === "invidious" && "Invidious"}
                      {m === "rinetube" && "カスタムProxy"}
                      {m === "education" && "Education"}
                      {m === "nocookie" && "NoCookie"}
                    </button>
                  ))}
                </div>
              </div>

              {/* 16:9 プレイヤー */}
              <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-[#272727]">
                <iframe
                  key={`${currentVideo.id}-${mode}`}
                  src={getPlayerSrc(currentVideo.id)}
                  title={currentVideo.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                  allowFullScreen
                  className="w-full h-full border-0"
                />
              </div>

              <div className="space-y-3">
                <h1 className="text-lg md:text-xl font-bold text-white leading-tight">
                  {currentVideo.title}
                </h1>

                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#272727]">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-full bg-gradient-to-tr from-red-600 to-amber-600 flex items-center justify-center font-bold text-white text-sm shadow">
                      {currentVideo.author.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-white">{currentVideo.author}</p>
                      <p className="text-[11px] text-[#aaa]">{currentVideo.publishedText}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toast.success("高評価しました")}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#272727] hover:bg-[#383838] text-xs font-semibold text-white"
                    >
                      <ThumbsUp className="size-3.5" />
                      <span>高評価</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const shareUrl = `https://youtu.be/${currentVideo.id}`;
                        void navigator.clipboard.writeText(shareUrl);
                        toast.success("動画URLをコピーしました");
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#272727] hover:bg-[#383838] text-xs font-semibold text-white"
                    >
                      <Share2 className="size-3.5" />
                      <span>共有</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        try {
                          const existing = JSON.parse(localStorage.getItem("rine_keep_notes_v1") || "[]");
                          const newNote = {
                            id: `keep_${Date.now()}`,
                            text: `📺 【動画】${currentVideo.title}\nhttps://youtu.be/${currentVideo.id}`,
                            createdAt: Date.now(),
                          };
                          localStorage.setItem("rine_keep_notes_v1", JSON.stringify([newNote, ...existing]));
                          toast.success("Keepメモに保存しました！");
                        } catch {
                          toast.error("保存に失敗しました");
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#272727] hover:bg-[#383838] text-xs font-semibold text-white"
                      title="Keepメモに保存"
                    >
                      <Bookmark className="size-3.5" />
                      <span>Keep保存</span>
                    </button>
                  </div>
                </div>

                <div
                  onClick={() => setDescExpanded((prev) => !prev)}
                  className="bg-[#272727] hover:bg-[#333] p-3 rounded-xl cursor-pointer text-xs text-[#d1d1d1] transition-colors"
                >
                  <p className="font-semibold text-white mb-1">
                    {currentVideo.viewCountText} • {currentVideo.publishedText}
                  </p>
                  <p className={descExpanded ? "" : "line-clamp-2"}>
                    RINETube 広告なし・プロキシ再生モード。動画ID: {currentVideo.id}
                  </p>
                  <span className="text-[11px] text-[#aaa] font-semibold mt-1 inline-block">
                    {descExpanded ? "折りたたむ" : "...もっと見る"}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* ===== ホーム一覧 ===== */
            <div>
              {loading && (
                <div className="flex items-center justify-center py-12 text-[#aaa] gap-2">
                  <Loader2 className="size-6 animate-spin text-red-500" />
                  <span className="text-sm">動画を取得中...</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-7">
                {videos.map((video) => (
                  <div
                    key={video.id}
                    onClick={() => setCurrentVideo(video)}
                    className="flex flex-col group cursor-pointer"
                  >
                    <div className="relative w-full aspect-video bg-[#1e1e1e] rounded-xl overflow-hidden mb-3">
                      <img
                        src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`}
                        alt={video.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        loading="lazy"
                      />
                      {video.durationText && (
                        <span className="absolute bottom-1.5 right-1.5 bg-black/85 text-[11px] font-semibold text-white px-1.5 py-0.5 rounded font-mono">
                          {video.durationText}
                        </span>
                      )}
                    </div>

                    <div className="flex gap-3">
                      <div className="size-9 rounded-full bg-[#333] flex-shrink-0 flex items-center justify-center font-bold text-xs text-white">
                        {video.author.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h2 className="text-sm font-semibold text-white line-clamp-2 leading-snug group-hover:text-[#3ea6ff]">
                          {video.title}
                        </h2>
                        <p className="text-xs text-[#aaa] truncate mt-1">{video.author}</p>
                        <p className="text-xs text-[#888]">
                          {video.viewCountText} • {video.publishedText}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const url = `https://youtu.be/${video.id}`;
                          void navigator.clipboard.writeText(url);
                          toast.success("リンクをコピーしました");
                        }}
                        className="text-[#888] hover:text-white p-1 self-start"
                      >
                        <MoreVertical className="size-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ===== ⚙️ 設定モーダル ===== */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="w-full max-w-md bg-[#212121] border border-[#383838] rounded-2xl p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#383838] pb-3">
              <div className="flex items-center gap-2">
                <Settings className="size-5 text-red-500" />
                <h3 className="font-bold text-base text-white">RINETube 再生設定</h3>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="text-[#aaa] hover:text-white"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-[#f1f1f1] block mb-1.5">デフォルト再生方式</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "invidious", name: "Invidious", desc: "高速・標準プロキシ" },
                    { id: "education", name: "Education", desc: "YouTube教育・低制限" },
                    { id: "nocookie", name: "No-Cookie", desc: "高画質・安全" },
                    { id: "rinetube", name: "カスタムProxy", desc: "自前サーバー" },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMode(m.id as PlayMode)}
                      className={`p-2.5 rounded-xl border text-left transition-colors ${
                        mode === m.id
                          ? "border-red-500 bg-red-500/15 text-white"
                          : "border-[#383838] bg-[#2a2a2a] text-[#aaa] hover:text-white"
                      }`}
                    >
                      <p className="font-bold text-xs">{m.name}</p>
                      <p className="text-[10px] text-[#888]">{m.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* カスタムProxy URL */}
              <div>
                <label className="font-bold text-[#f1f1f1] block mb-1">
                  カスタムProxy サーバーURL（任意）
                </label>
                <Input
                  value={customProxyUrl}
                  onChange={(e) => setCustomProxyUrl(e.target.value)}
                  placeholder="https://..."
                  className="bg-[#181818] border-[#383838] text-white h-9 text-xs font-mono"
                />
              </div>

              {/* Invidious サーバーURL */}
              <div>
                <label className="font-bold text-[#f1f1f1] block mb-1">
                  Invidious サーバーURL
                </label>
                <Input
                  value={invidiousHost}
                  onChange={(e) => setInvidiousHost(e.target.value)}
                  placeholder="https://invidious.f5.si"
                  className="bg-[#181818] border-[#383838] text-white h-9 text-xs font-mono"
                />
              </div>

              {/* 自動再生 */}
              <div className="flex items-center justify-between pt-2 border-t border-[#383838]">
                <div>
                  <p className="font-semibold text-white">動画クリック時の自動再生</p>
                  <p className="text-[10px] text-[#888]">選択後すぐに動画を再生します</p>
                </div>
                <input
                  type="checkbox"
                  checked={autoPlay}
                  onChange={(e) => setAutoPlay(e.target.checked)}
                  className="size-4 accent-red-600 cursor-pointer"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#383838]">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSettingsOpen(false)}
                className="border-[#383838] text-white hover:bg-[#333]"
              >
                閉じる
              </Button>
              <Button size="sm" onClick={saveSettings} className="bg-red-600 hover:bg-red-700 text-white">
                設定を保存
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

