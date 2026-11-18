import { useState, useEffect, useRef, useCallback } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Menu,
  Search,
  Settings,
  Flame,
  Music,
  Tv,
  X,
  Loader2,
  ArrowLeft,
  Share2,
  Play,
  ThumbsUp,
  ExternalLink,
  Copy,
  Check,
  LogOut,
  ShieldCheck,
  History,
  Shield,
  MessageSquare,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ytDeviceStart, ytDevicePoll, ytRefresh, ytSubsFeed } from "@/lib/youtube-auth.functions";
import { ytSearch } from "@/lib/youtube-search.functions";

export const Route = createFileRoute("/youtube")({
  head: () => ({
    meta: [
      { title: "RINETube｜テレビ認証・広告なし動画プレイヤー" },
      { name: "description", content: "WeTube準拠・テレビ認証・ショート無限スクロール対応の軽量YouTubeクライアント「RINETube」" },
    ],
  }),
  component: RINETubePage,
});

type PlayMode = "invidious" | "education" | "nocookie" | "youtube" | "piped" | "custom";

const PLAY_MODES: { id: PlayMode; name: string; desc: string }[] = [
  { id: "nocookie", name: "No-Cookie", desc: "高画質・安全" },
  { id: "education", name: "Education", desc: "教育モード・低制限" },
  { id: "invidious", name: "Invidious", desc: "プロキシ経由" },
  { id: "piped", name: "Piped", desc: "別プロキシ" },
  { id: "youtube", name: "標準", desc: "通常の埋め込み" },
  { id: "custom", name: "カスタム", desc: "自前サーバー" },
];

const FALLBACK_HOSTS = [
  "https://invidious.f5.si",
  "https://inv.nadeko.net",
  "https://yewtu.be",
  "https://invidious.nerdvpn.de",
  "https://iv.melmac.space",
];

interface VideoItem {
  id: string;
  title: string;
  author: string;
  publishedText: string;
  viewCountText: string;
  durationText?: string;
}

interface YouTubeAccount {
  name: string;
  handle: string;
  avatar: string;
  loggedInAt: number;
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
}

const CATEGORIES = [
  { id: "all", label: "すべて", query: "おすすめ" },
  { id: "trending", label: "急上昇", query: "急上昇" },
  { id: "music", label: "音楽", query: "音楽 MV Official" },
  { id: "gaming", label: "ゲーム", query: "ゲーム 実況" },
  { id: "anime", label: "アニメ", query: "アニメ 公式" },
  { id: "cooking", label: "料理", query: "料理 レシピ" },
  { id: "news", label: "ニュース", query: "ニュース 速報" },
  { id: "study", label: "学習", query: "勉強用 BGM 作業用" },
];

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
    id: "09R8_2nJtjg",
    title: "Maroon 5 - Sugar (Official Music Video)",
    author: "Maroon 5",
    publishedText: "9年前",
    viewCountText: "40億回視聴",
    durationText: "5:01",
  },
  {
    id: "hT_nvWreIhg",
    title: "OneRepublic - Counting Stars (Official Music Video)",
    author: "OneRepublic",
    publishedText: "10年前",
    viewCountText: "39億回視聴",
    durationText: "4:43",
  },
];

function extractVideoId(text: string): string | null {
  const trimmed = text.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/))([a-zA-Z0-9_-]{11})/,
  );
  return match?.[1] ?? null;
}

export default function RINETubePage() {
  const [query, setQuery] = useState("");
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const [currentVideoTitle, setCurrentVideoTitle] = useState("");
  const [currentAuthor, setCurrentAuthor] = useState("");
  const [videos, setVideos] = useState<VideoItem[]>(INITIAL_VIDEOS);
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // ステルス偽装モード（Google検索画面偽装）
  const [stealthMode, setStealthMode] = useState(false);

  // ショート動画専用プレイヤー（TikTok風無限スクロール）
  const [shortsMode, setShortsMode] = useState(false);
  const [shortsList, setShortsList] = useState<VideoItem[]>([]);
  const [shortsIndex, setShortsIndex] = useState(0);
  const [loadingShorts, setLoadingShorts] = useState(false);

  // モーダル管理
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tvAuthOpen, setTvAuthOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // 設定項目
  const [mode, setMode] = useState<PlayMode>("invidious");
  const [invidiousHost, setInvidiousHost] = useState("https://invidious.f5.si");
  const [customProxyUrl, setCustomProxyUrl] = useState("");
  const [autoPlay, setAutoPlay] = useState(true);

  // 履歴＆お気に入り
  const [history, setHistory] = useState<VideoItem[]>([]);
  const [likes, setLikes] = useState<string[]>([]);

  // テレビ認証（WeTube準拠）
  const [account, setAccount] = useState<YouTubeAccount | null>(null);
  const [authStatus, setAuthStatus] = useState<
    "signed_out" | "starting" | "pending" | "signed_in" | "error"
  >("signed_out");
  const [userCode, setUserCode] = useState("");
  const [verificationUrl, setVerificationUrl] = useState("https://www.youtube.com/activate");
  const [authError, setAuthError] = useState("");
  const [codeCopied, setCodeCopied] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 止まらない無限スクロール管理
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const loadingMoreRef = useRef(false);
  const feedModeRef = useRef<"search" | "subs">("search");
  const lastQueryRef = useRef("おすすめ");
  const pageRef = useRef(1);
  const subsTokenRef = useRef<string | null>(null);
  const searchContRef = useRef<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Escキーによるステルス偽装のトグル
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setStealthMode((prev) => !prev);
      }
      if (shortsMode) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          nextShort();
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          prevShort();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortsMode, shortsList.length, shortsIndex]);

  // 設定・履歴・アカウントの初期読み込み
  useEffect(() => {
    try {
      const savedMode = localStorage.getItem("rinetube_mode");
      if (savedMode) setMode(savedMode as PlayMode);

      const savedHost = localStorage.getItem("rinetube_invidious_host");
      if (savedHost) setInvidiousHost(savedHost);

      const savedCustom = localStorage.getItem("rinetube_custom_proxy");
      if (savedCustom) setCustomProxyUrl(savedCustom);

      const savedAuto = localStorage.getItem("rinetube_autoplay");
      if (savedAuto !== null) setAutoPlay(savedAuto === "true");

      const savedHist = localStorage.getItem("rinetube_history");
      if (savedHist) setHistory(JSON.parse(savedHist));

      const savedLikes = localStorage.getItem("rinetube_likes");
      if (savedLikes) setLikes(JSON.parse(savedLikes));

      const savedAcc = localStorage.getItem("rinetube_account_v1");
      if (savedAcc) {
        const parsed = JSON.parse(savedAcc);
        setAccount(parsed);
        setAuthStatus("signed_in");
      }
    } catch {}
  }, []);

  const saveSettings = () => {
    localStorage.setItem("rinetube_mode", mode);
    localStorage.setItem("rinetube_invidious_host", invidiousHost);
    localStorage.setItem("rinetube_custom_proxy", customProxyUrl);
    localStorage.setItem("rinetube_autoplay", String(autoPlay));
    setSettingsOpen(false);
    toast.success("設定を保存しました");
  };

  const accountRef = useRef<YouTubeAccount | null>(null);
  useEffect(() => {
    accountRef.current = account;
  }, [account]);

  const saveAccount = (a: YouTubeAccount | null) => {
    accountRef.current = a;
    setAccount(a);
    if (a) localStorage.setItem("rinetube_account_v1", JSON.stringify(a));
    else localStorage.removeItem("rinetube_account_v1");
  };

  const getToken = async (): Promise<string | null> => {
    const acc = accountRef.current;
    if (!acc?.access_token) return null;
    if (acc.expires_at && acc.expires_at - 60_000 > Date.now()) return acc.access_token;
    if (!acc.refresh_token) return null;
    try {
      const r = await ytRefresh({ data: { refresh_token: acc.refresh_token } });
      if (!("access_token" in r) || !r.access_token) return null;
      saveAccount({ ...acc, access_token: r.access_token, expires_at: r.expires_at });
      return r.access_token ?? null;
    } catch {
      return null;
    }
  };

  const startTvAuth = async () => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    setAuthStatus("starting");
    setAuthError("");
    setCodeCopied(false);
    try {
      const s = await ytDeviceStart();
      if ("error" in s) throw new Error(s.error);
      setUserCode(s.user_code);
      setVerificationUrl(s.verification_url);
      setAuthStatus("pending");
      let wait = Math.max(5, s.interval) * 1000;
      const deadline = Date.now() + 15 * 60_000;
      const tick = async () => {
        if (Date.now() > deadline) {
          setAuthStatus("signed_out");
          setAuthError("コードの有効期限が切れました。もう一度お試しください。");
          return;
        }
        try {
          const p = await ytDevicePoll({ data: { device_code: s.device_code } });
          if (p.status === "ok" && "access_token" in p) {
            saveAccount({
              name: p.name,
              handle: p.handle,
              avatar: p.avatar,
              loggedInAt: Date.now(),
              access_token: p.access_token,
              refresh_token: p.refresh_token,
              expires_at: p.expires_at,
            });
            setAuthStatus("signed_in");
            toast.success("YouTubeアカウントと同期しました！");
            loadSubsFeed(true);
            return;
          }
          if (p.status === "slow_down") wait += 5000;
          else if (p.status !== "authorization_pending") {
            setAuthStatus("signed_out");
            setAuthError(
              p.status === "access_denied"
                ? "ログインが拒否されました。"
                : p.status === "expired_token"
                  ? "コードの有効期限が切れました。"
                  : "ログインに失敗しました。Googleのテストユーザーに登録されているか確認してください。",
            );
            return;
          }
        } catch {}
        pollTimerRef.current = setTimeout(tick, wait);
      };
      pollTimerRef.current = setTimeout(tick, wait);
    } catch (e) {
      setAuthStatus("signed_out");
      setAuthError("認証を開始できませんでした。");
      console.error(e);
    }
  };

  const loadSubsFeed = async (reset = false) => {
    if (loadingMoreRef.current) return;
    const token = await getToken();
    if (!token) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const r = await ytSubsFeed({
        data: { access_token: token, pageToken: reset ? undefined : subsTokenRef.current ?? undefined },
      });
      feedModeRef.current = "subs";
      subsTokenRef.current = r.nextPageToken;
      setHasMore(true);
      setSelectedCategory("subs");
      setVideos((prev) => {
        const base = reset ? [] : prev;
        const seen = new Set(base.map((v) => v.id));
        return [...base, ...r.items.filter((v) => !seen.has(v.id) && seen.add(v.id))];
      });
    } catch {
      toast.error("登録チャンネルを読み込めませんでした");
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  };

  const copyCodeToClipboard = async () => {
    if (!userCode) return;
    try {
      await navigator.clipboard.writeText(userCode);
      setCodeCopied(true);
      toast.success("認証コードをコピーしました！");
      setTimeout(() => setCodeCopied(false), 3000);
    } catch {
      toast.error("コードのコピーに失敗しました");
    }
  };

  const signOut = () => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    saveAccount(null);
    setAuthStatus("signed_out");
    setUserCode("");
    toast.success("ログアウトしました");
  };

  // 止まらない無限検索エンジン
  const searchVideos = async (keyword: string, page = 1, append = false) => {
    if (!keyword.trim()) return;
    if (append) {
      if (loadingMoreRef.current) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    feedModeRef.current = "search";
    lastQueryRef.current = keyword;
    pageRef.current = page;
    if (!append) searchContRef.current = null;

    try {
      // 1. YouTube内部検索（continuation優先、切れたらページクエリで自動補給）
      const queryPayload =
        append && searchContRef.current
          ? { continuation: searchContRef.current }
          : { q: page > 1 ? `${keyword} ${page}` : keyword };

      try {
        const r = await ytSearch({ data: queryPayload });
        if (r.items.length > 0) {
          searchContRef.current = r.continuation ?? null;
          setHasMore(true); // 常に次を読み込めるようにtrueを維持
          setVideos((prev) => {
            const base = append ? prev : [];
            const seen = new Set(base.map((v) => v.id));
            return [...base, ...r.items.filter((v) => !seen.has(v.id) && seen.add(v.id))];
          });
          return;
        }
      } catch {}

      // 2. 予備のInvidiousホストへ自動フォールバック
      const hosts = [
        invidiousHost.replace(/\/+$/, ""),
        ...FALLBACK_HOSTS.filter((h) => h !== invidiousHost.replace(/\/+$/, "")),
      ];
      let data: any = null;
      for (const host of hosts) {
        try {
          const res = await fetch(
            `${host}/api/v1/search?q=${encodeURIComponent(keyword)}&type=video&sort_by=relevance&page=${page}`,
            { signal: AbortSignal.timeout(5000) },
          );
          if (!res.ok) continue;
          data = await res.json();
          if (host !== hosts[0]) setInvidiousHost(host);
          break;
        } catch {}
      }

      if (Array.isArray(data) && data.length > 0) {
        const formatted: VideoItem[] = data.slice(0, 30).map((item: any) => ({
          id: item.videoId,
          title: item.title,
          author: item.author || "YouTube",
          publishedText: item.publishedText || "",
          viewCountText: item.viewCount ? `${Number(item.viewCount).toLocaleString()}回視聴` : "",
          durationText: item.lengthSeconds
            ? `${Math.floor(item.lengthSeconds / 60)}:${String(item.lengthSeconds % 60).padStart(2, "0")}`
            : undefined,
        }));
        setHasMore(true);
        setVideos((prev) => {
          const base = append ? prev : [];
          const seen = new Set(base.map((v) => v.id));
          return [...base, ...formatted.filter((v) => v.id && !seen.has(v.id) && seen.add(v.id))];
        });
      } else if (!append) {
        toast.info("該当する動画が見つかりませんでした");
      }
    } catch {
      if (!append) toast.error("動画サーバーに接続できませんでした。別サーバーをお試しください。");
    } finally {
      setLoading(false);
      if (append) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  };

  // スクロールで止まらず次々と読み込むダブル検知
  const loadMoreRef = useRef<() => void>(() => {});
  loadMoreRef.current = () => {
    if (loadingMoreRef.current || loading) return;
    if (feedModeRef.current === "subs") {
      loadSubsFeed(false);
    } else {
      searchVideos(lastQueryRef.current, pageRef.current + 1, true);
    }
  };

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMoreRef.current();
      },
      { rootMargin: "800px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 700) {
        loadMoreRef.current();
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // ショート動画の読み込み
  const loadShortsFeed = async (append = false) => {
    if (loadingShorts) return;
    setLoadingShorts(true);
    try {
      const q = append ? "YouTube Shorts 面白い #Shorts" : "#Shorts 日本 おすすめ";
      const r = await ytSearch({ data: { q } });
      if (r.items.length > 0) {
        setShortsList((prev) => {
          const base = append ? prev : [];
          const seen = new Set(base.map((x) => x.id));
          return [...base, ...r.items.filter((x) => !seen.has(x.id))];
        });
      }
    } catch {}
    setLoadingShorts(false);
  };

  const nextShort = () => {
    if (shortsIndex + 1 >= shortsList.length - 2) {
      void loadShortsFeed(true);
    }
    if (shortsIndex + 1 < shortsList.length) {
      setShortsIndex((i) => i + 1);
    }
  };

  const prevShort = () => {
    if (shortsIndex > 0) {
      setShortsIndex((i) => i - 1);
    }
  };

  useEffect(() => {
    if (account?.access_token && feedModeRef.current === "search" && pageRef.current === 1) {
      loadSubsFeed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.access_token]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const extracted = extractVideoId(query);
    if (extracted) {
      playVideo({ id: extracted, title: "YouTube Video", author: "", publishedText: "", viewCountText: "" });
    } else {
      searchVideos(query);
    }
  };

  const playVideo = (v: VideoItem) => {
    setCurrentVideoId(v.id);
    setCurrentVideoTitle(v.title);
    setCurrentAuthor(v.author);

    setHistory((prev) => {
      const filtered = prev.filter((item) => item.id !== v.id);
      const updated = [v, ...filtered].slice(0, 50);
      localStorage.setItem("rinetube_history", JSON.stringify(updated));
      return updated;
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleLike = (id: string) => {
    setLikes((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem("rinetube_likes", JSON.stringify(next));
      toast(next.includes(id) ? "お気に入りに追加しました" : "お気に入りを解除しました");
      return next;
    });
  };

  const getPlayerUrl = (id: string) => {
    const ap = autoPlay ? 1 : 0;
    switch (mode) {
      case "invidious":
        return `${invidiousHost.replace(/\/+$/, "")}/embed/${id}?autoplay=${ap}&dark_mode=true`;
      case "education":
        return `https://www.youtube-nocookie.com/embed/${id}?autoplay=${ap}&rel=0&modestbranding=1&iv_load_policy=3`;
      case "nocookie":
        return `https://www.youtube-nocookie.com/embed/${id}?autoplay=${ap}&rel=0`;
      case "youtube":
        return `https://www.youtube.com/embed/${id}?autoplay=${ap}&rel=0`;
      case "piped":
        return `https://piped.video/embed/${id}?autoplay=${ap}`;
      case "custom":
        if (customProxyUrl) {
          return `${customProxyUrl.replace(/\/+$/, "")}/embed/${id}?autoplay=${ap}`;
        }
        return `https://www.youtube-nocookie.com/embed/${id}?autoplay=${ap}`;
    }
  };

  // ステルス偽装表示（Google検索画面）
  if (stealthMode) {
    return (
      <div className="min-h-screen bg-white text-black font-sans flex flex-col justify-between p-6 select-none">
        <div className="flex justify-end gap-4 text-sm text-[#5f6368]">
          <span>Gmail</span>
          <span>画像</span>
          <button
            type="button"
            onClick={() => setStealthMode(false)}
            className="text-xs bg-[#1a73e8] text-white px-3 py-1 rounded"
          >
            ログイン
          </button>
        </div>
        <div className="max-w-xl mx-auto w-full text-center space-y-6">
          <h1 className="text-6xl font-bold tracking-tight text-[#4285f4]">
            G<span className="text-[#ea4335]">o</span>
            <span className="text-[#fbbc05]">o</span>
            <span className="text-[#4285f4]">g</span>
            <span className="text-[#34a853]">l</span>
            <span className="text-[#ea4335]">e</span>
          </h1>
          <div className="flex items-center border border-[#dfe1e5] rounded-full px-4 py-2.5 shadow-sm hover:shadow-md transition-shadow">
            <Search className="size-4 text-[#9aa0a6] mr-3" />
            <input
              type="text"
              defaultValue="日本の歴史 年表"
              className="w-full outline-none text-sm bg-transparent"
            />
          </div>
          <p className="text-xs text-[#70757a]">Escキーを押すと元の画面に戻ります</p>
        </div>
        <div className="text-xs text-[#70757a] flex justify-between border-t pt-4">
          <span>日本</span>
          <span>プライバシー 規約 設定</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-[#f1f1f1] flex flex-col font-sans selection:bg-red-600 selection:text-white">
      {/* 1. 公式YouTube準拠のトップナビゲーションバー */}
      <header className="sticky top-0 z-40 bg-[#0f0f0f]/95 backdrop-blur border-b border-[#272727] px-3 sm:px-4 h-14 flex items-center justify-between gap-2 sm:gap-4">
        {/* 左: ハンバーガー ＆ ロゴ */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-full hover:bg-[#272727] text-white transition-colors"
            title="サイドバー切替"
          >
            <Menu className="size-5" />
          </button>
          <Link to="/youtube" className="flex items-center gap-1.5 group select-none">
            <div className="bg-red-600 text-white rounded-lg px-2 py-0.5 font-black text-sm tracking-wider flex items-center gap-1 shadow-md shadow-red-600/30 group-hover:bg-red-500 transition-colors">
              <Play className="size-3.5 fill-white" />
              <span>RINE</span>
            </div>
            <span className="font-bold text-lg text-white tracking-tight">Tube</span>
          </Link>
        </div>

        {/* 中央: YouTube風 検索バー ＆ ショート動画ボタン */}
        <div className="flex-1 max-w-2xl mx-auto flex items-center gap-2">
          <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center">
            <div className="relative w-full flex items-center">
              <Input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="検索またはYouTubeのURLを貼り付け…"
                className="w-full bg-[#121212] border-[#303030] focus-visible:border-blue-500 focus-visible:ring-1 focus-visible:ring-blue-500 text-white rounded-l-full rounded-r-none h-10 px-4 text-sm shadow-inner"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-3 text-[#aaa] hover:text-white p-1"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <Button
              type="submit"
              variant="secondary"
              className="rounded-r-full rounded-l-none bg-[#222] hover:bg-[#272727] border border-l-0 border-[#303030] h-10 px-5 text-[#aaa] hover:text-white shrink-0"
              disabled={loading}
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            </Button>
          </form>

          {/* ショート動画無限スクロールボタン */}
          <button
            type="button"
            onClick={() => {
              setShortsMode(true);
              setShortsIndex(0);
              if (shortsList.length === 0) void loadShortsFeed(false);
            }}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-full bg-gradient-to-r from-red-600 to-pink-600 text-white text-xs font-bold shadow hover:opacity-90 shrink-0 transition-all hover:scale-105"
            title="ショート動画を縦スクロールで連続再生"
          >
            <span>⚡</span>
            <span>Shorts</span>
          </button>
        </div>

        {/* 右: 操作アイコン群 */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* ステルス緊急脱出ボタン（学校PC対策） */}
          <button
            type="button"
            onClick={() => setStealthMode(true)}
            className="p-2 rounded-full hover:bg-[#272727] text-emerald-400 hover:text-emerald-300 transition-colors"
            title="EscでGoogle画面に緊急偽装"
          >
            <Shield className="size-5" />
          </button>

          {/* テレビ認証ボタン */}
          <button
            type="button"
            onClick={() => setTvAuthOpen(true)}
            className={`p-2 rounded-full transition-colors flex items-center gap-1.5 text-xs font-semibold px-2.5 ${
              account
                ? "bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30"
                : "bg-[#222] hover:bg-[#272727] text-white border border-[#383838]"
            }`}
            title="テレビ認証でYouTubeと連携"
          >
            <Tv className="size-4" />
            <span className="hidden sm:inline">{account ? account.name : "テレビ認証"}</span>
          </button>

          {/* 設定ボタン */}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-full hover:bg-[#272727] text-[#aaa] hover:text-white transition-colors"
            title="再生設定"
          >
            <Settings className="size-5" />
          </button>

          {/* チャットへ戻る */}
          <Link
            to="/friends"
            className="hidden md:flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#222] hover:bg-[#272727] text-xs font-medium text-[#aaa] hover:text-white transition-colors border border-[#303030]"
          >
            <ArrowLeft className="size-3.5" />
            <span>トークへ戻る</span>
          </Link>
        </div>
      </header>

      <div className="flex flex-1">
        {/* 2. サイドバー */}
        {sidebarOpen && (
          <aside className="w-56 bg-[#0f0f0f] border-r border-[#272727] p-3 shrink-0 flex flex-col justify-between hidden md:flex">
            <div className="space-y-6">
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setCurrentVideoId(null);
                    setSelectedCategory("all");
                    setVideos(INITIAL_VIDEOS);
                  }}
                  className="w-full flex items-center gap-4 px-3 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#272727] text-white transition-colors"
                >
                  <Flame className="size-5 text-red-500" />
                  <span>ホーム</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShortsMode(true);
                    setShortsIndex(0);
                    if (shortsList.length === 0) void loadShortsFeed(false);
                  }}
                  className="w-full flex items-center gap-4 px-3 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#272727] text-red-400 hover:text-red-300 transition-colors"
                >
                  <span className="text-lg">⚡</span>
                  <span>ショート動画</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory("trending");
                    searchVideos("急上昇");
                  }}
                  className="w-full flex items-center gap-4 px-3 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#272727] text-[#aaa] hover:text-white transition-colors"
                >
                  <Music className="size-5 text-blue-400" />
                  <span>急上昇</span>
                </button>

                <button
                  type="button"
                  onClick={() => setHistoryOpen(true)}
                  className="w-full flex items-center gap-4 px-3 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#272727] text-[#aaa] hover:text-white transition-colors"
                >
                  <History className="size-5 text-emerald-400" />
                  <span>再生履歴 ({history.length})</span>
                </button>
              </div>

              {/* テレビ認証ステータス */}
              <div className="p-3 bg-[#181818] rounded-2xl border border-[#272727] space-y-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-red-500" />
                  <p className="text-xs font-bold text-white">テレビ認証</p>
                </div>
                {account ? (
                  <div className="space-y-1">
                    <p className="text-xs text-green-400 font-semibold truncate">● {account.name}</p>
                    <p className="text-[10px] text-[#888]">{account.handle}</p>
                    <button
                      type="button"
                      onClick={signOut}
                      className="text-[11px] text-red-400 hover:underline pt-1 block"
                    >
                      ログアウト
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-[#aaa] leading-relaxed">
                      テレビ認証でアカウントを同期できます。
                    </p>
                    <button
                      type="button"
                      onClick={() => setTvAuthOpen(true)}
                      className="w-full py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors"
                    >
                      ログイン
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="text-[11px] text-[#606060] px-3 space-y-1">
              <p>RINETube v3.0</p>
              <p>広告なし・止まらない無限再生</p>
            </div>
          </aside>
        )}

        {/* 3. メインコンテンツエリア */}
        <main className="flex-1 p-3 sm:p-5 max-w-7xl mx-auto w-full space-y-6">
          {/* カテゴリピル（チップバー） */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            {account?.access_token && (
              <button
                type="button"
                onClick={() => loadSubsFeed(true)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  selectedCategory === "subs" ? "bg-red-600 text-white" : "bg-[#272727] text-white hover:bg-[#383838]"
                }`}
              >
                登録チャンネル
              </button>
            )}
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setSelectedCategory(cat.id);
                  searchVideos(cat.query);
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  selectedCategory === cat.id
                    ? "bg-white text-black"
                    : "bg-[#272727] text-white hover:bg-[#383838]"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* 動画再生画面（Watch View） */}
          {currentVideoId && (
            <div className="space-y-4 bg-[#181818] rounded-2xl p-3 sm:p-5 border border-[#272727] shadow-2xl">
              <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
                <span className="text-[11px] text-[#aaa] self-center shrink-0">再生方法:</span>
                {PLAY_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMode(m.id)}
                    title={m.desc}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${
                      mode === m.id ? "bg-red-600 text-white" : "bg-[#272727] text-[#ddd] hover:bg-[#383838]"
                    }`}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
              <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black shadow-lg">
                <iframe
                  key={`${currentVideoId}-${mode}`}
                  src={getPlayerUrl(currentVideoId)}
                  title={currentVideoTitle || "Video Player"}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>

              {/* 動画情報＆アクションボタン */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-[#272727]">
                <div className="space-y-1 flex-1">
                  <h1 className="text-base sm:text-lg font-bold text-white leading-snug">
                    {currentVideoTitle || "再生中の動画"}
                  </h1>
                  <p className="text-xs text-[#aaa]">{currentAuthor || "YouTube チャンネル"}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => toggleLike(currentVideoId)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                      likes.includes(currentVideoId)
                        ? "bg-red-600 text-white"
                        : "bg-[#272727] text-white hover:bg-[#383838]"
                    }`}
                  >
                    <ThumbsUp className="size-4" />
                    <span>{likes.includes(currentVideoId) ? "高評価済み" : "高評価"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(`https://youtu.be/${currentVideoId}`);
                      toast.success("動画URLをコピーしました！");
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#272727] text-white hover:bg-[#383838] text-xs font-semibold transition-colors"
                  >
                    <Share2 className="size-4" />
                    <span>共有</span>
                  </button>
                  {/* WatchParty用共有ボタン */}
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `【RINE上映会】「${currentVideoTitle}」を一緒に見よう！\n${window.location.origin}/youtube?v=${currentVideoId}`,
                      );
                      toast.success("上映会リンクをコピーしました！チャットに貼り付けて友達を招待できます");
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors shadow"
                  >
                    <MessageSquare className="size-4" />
                    <span>トークで上映会</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 動画サムネイルグリッド（止まらない無限スクロール） */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>
                  {selectedCategory === "subs"
                    ? "登録チャンネルの新着"
                    : selectedCategory === "all"
                      ? "おすすめ動画"
                      : "検索結果"}
                </span>
                {loading && <Loader2 className="size-4 animate-spin text-red-500" />}
              </h2>
              <span className="text-xs text-[#888]">{videos.length}件</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
              {videos.map((v) => {
                const isPlaying = currentVideoId === v.id;
                return (
                  <div
                    key={v.id}
                    onClick={() => playVideo(v)}
                    className={`group cursor-pointer flex flex-col space-y-2 rounded-xl p-2 transition-all duration-200 ${
                      isPlaying
                        ? "bg-red-500/10 border border-red-500/30"
                        : "hover:bg-[#1f1f1f] border border-transparent"
                    }`}
                  >
                    <div className="relative aspect-video rounded-xl overflow-hidden bg-[#272727]">
                      <img
                        src={`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`}
                        alt={v.title}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      {v.durationText && (
                        <span className="absolute bottom-1.5 right-1.5 bg-black/85 text-white text-[11px] font-bold px-1.5 py-0.5 rounded-md">
                          {v.durationText}
                        </span>
                      )}
                      {isPlaying && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <span className="bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-md shadow">
                            再生中
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2.5">
                      <div className="size-8 rounded-full bg-[#272727] flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5">
                        {v.author ? v.author.slice(0, 1) : "Y"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm font-semibold text-white line-clamp-2 leading-snug group-hover:text-red-400 transition-colors">
                          {v.title}
                        </p>
                        <p className="text-xs text-[#aaa] mt-1 truncate">{v.author}</p>
                        <div className="text-[11px] text-[#717171] flex items-center gap-1.5 mt-0.5">
                          {v.viewCountText && <span>{v.viewCountText}</span>}
                          {v.publishedText && <span>• {v.publishedText}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 無限スクロール検知マーカー */}
            <div ref={sentinelRef} className="h-14" />
            <div className="flex justify-center py-4">
              {loadingMore ? (
                <div className="flex items-center gap-2 text-xs text-[#aaa]">
                  <Loader2 className="size-5 animate-spin text-red-500" />
                  <span>次の動画を自動読み込み中…</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => loadMoreRef.current()}
                  className="px-5 py-2 rounded-full bg-[#272727] text-white text-xs font-semibold hover:bg-[#383838] transition-colors"
                >
                  もっと読み込む ⬇
                </button>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* 4. YouTube Shorts（ショート動画）縦型フルスクリーン・無限スクロールプレイヤー */}
      {shortsMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-2 sm:p-4">
          <div className="relative flex flex-col items-center w-full max-w-sm h-full max-h-[88vh] bg-[#121212] rounded-3xl overflow-hidden shadow-2xl border border-white/10">
            {/* 上部ヘッダー */}
            <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between pointer-events-auto">
              <span className="bg-red-600 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full shadow">
                ⚡ Shorts {shortsIndex + 1}/{shortsList.length}
              </span>
              <button
                type="button"
                onClick={() => setShortsMode(false)}
                className="size-8 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black/90 shadow transition-colors"
                aria-label="閉じる"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* 縦型動画フレーム */}
            <div className="w-full flex-1 bg-black flex items-center justify-center relative">
              {shortsList[shortsIndex] ? (
                <iframe
                  key={shortsList[shortsIndex].id}
                  src={`https://www.youtube-nocookie.com/embed/${shortsList[shortsIndex].id}?autoplay=1&playsinline=1&rel=0&loop=1`}
                  title={shortsList[shortsIndex].title}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-white text-xs">
                  <Loader2 className="size-6 animate-spin text-red-500" />
                  <span>ショート動画を準備中…</span>
                </div>
              )}

              {/* 上下操作用フローティング矢印ボタン */}
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-20">
                <button
                  type="button"
                  onClick={prevShort}
                  disabled={shortsIndex === 0}
                  className="size-10 rounded-full bg-black/60 hover:bg-black/80 disabled:opacity-30 text-white flex items-center justify-center shadow backdrop-blur transition-all"
                  title="前のShorts（↑キー）"
                >
                  <ChevronUp className="size-6" />
                </button>
                <button
                  type="button"
                  onClick={nextShort}
                  className="size-10 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow backdrop-blur transition-all"
                  title="次のShorts（↓キー）"
                >
                  <ChevronDown className="size-6" />
                </button>
              </div>
            </div>

            {/* 下部情報バー */}
            <div className="w-full p-3.5 bg-gradient-to-t from-black via-black/90 to-transparent flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white font-semibold line-clamp-1">
                  {shortsList[shortsIndex]?.title || "ショート動画"}
                </p>
                <p className="text-[10px] text-[#aaa] truncate">
                  {shortsList[shortsIndex]?.author}
                </p>
              </div>
              <button
                type="button"
                onClick={nextShort}
                className="px-3.5 py-1.5 rounded-full bg-red-600 text-white text-xs font-bold shrink-0 hover:bg-red-700 shadow transition-colors"
              >
                次のShorts ⬇
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. テレビ認証モーダル（YouTube TV OAuth2） */}
      {tvAuthOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setTvAuthOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-[#212121] border border-[#383838] rounded-2xl p-6 shadow-2xl relative space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                setTvAuthOpen(false);
                if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
              }}
              className="absolute top-4 right-4 text-[#aaa] hover:text-white p-1 rounded-full hover:bg-[#333]"
              aria-label="閉じる"
            >
              <X className="size-5" />
            </button>

            {authStatus === "signed_out" && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-500">
                    <Tv className="size-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">YouTubeアカウントでログイン</h2>
                    <p className="text-xs text-[#888]">テレビ認証（YouTube TV OAuth2）</p>
                  </div>
                </div>

                <p className="text-sm text-[#ccc] leading-relaxed">
                  テレビ認証を使ってログインすると、あなたのアカウントの再生履歴、登録チャンネル、おすすめを同期できます。
                </p>

                {authError && (
                  <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-2">{authError}</p>
                )}
                <div className="pt-2">
                  <Button
                    onClick={startTvAuth}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-bold h-11 rounded-xl text-sm shadow-lg shadow-red-600/30"
                  >
                    テレビ認証を開始
                  </Button>
                </div>
              </div>
            )}

            {(authStatus === "starting" || authStatus === "pending") && (
              <div className="space-y-5">
                <div className="flex items-center gap-3 pb-3 border-b border-[#383838]">
                  <div className="size-10 rounded-xl bg-green-600/20 border border-green-500/30 flex items-center justify-center text-green-400">
                    <Check className="size-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">テレビでログイン</h2>
                    <p className="text-xs text-[#aaa]">スマートフォンやPCで下のコードを入力してください。</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-[#181818] p-2.5 rounded-xl border border-[#333] space-y-1">
                    <span className="inline-block size-5 rounded-full bg-red-600 text-white font-bold leading-5 text-[11px]">
                      1
                    </span>
                    <p className="text-[#ccc] font-medium text-[11px]">認証ページを開く</p>
                  </div>
                  <div className="bg-[#181818] p-2.5 rounded-xl border border-[#333] space-y-1">
                    <span className="inline-block size-5 rounded-full bg-red-600 text-white font-bold leading-5 text-[11px]">
                      2
                    </span>
                    <p className="text-[#ccc] font-medium text-[11px]">コードを入力</p>
                  </div>
                  <div className="bg-[#181818] p-2.5 rounded-xl border border-[#333] space-y-1">
                    <span className="inline-block size-5 rounded-full bg-red-600 text-white font-bold leading-5 text-[11px]">
                      3
                    </span>
                    <p className="text-[#ccc] font-medium text-[11px]">完了を待つ</p>
                  </div>
                </div>

                <a
                  href={verificationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-3 bg-[#2a2a2a] hover:bg-[#333] border border-[#444] rounded-xl text-white font-bold text-sm transition-colors group"
                >
                  <span>認証ページを開く ({verificationUrl.replace(/^https?:\/\//, "")})</span>
                  <ExternalLink className="size-4 text-[#aaa] group-hover:text-white" />
                </a>

                <div className="bg-[#141414] border border-[#383838] rounded-xl p-4 text-center space-y-2">
                  <span className="text-xs text-[#888] font-semibold block">認証コード</span>
                  {authStatus === "starting" ? (
                    <div className="flex items-center justify-center gap-2 py-3">
                      <Loader2 className="size-6 animate-spin text-red-500" />
                      <span className="text-sm text-[#aaa]">コードを取得しています…</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={copyCodeToClipboard}
                      className="w-full py-3 px-4 bg-[#1f1f1f] hover:bg-[#282828] border border-[#444] rounded-lg font-mono text-2xl font-black tracking-widest text-red-500 flex items-center justify-center gap-3 transition-colors group"
                      title="クリックしてコピー"
                    >
                      <span>{userCode}</span>
                      {codeCopied ? (
                        <Check className="size-5 text-green-400" />
                      ) : (
                        <Copy className="size-5 text-[#888] group-hover:text-white" />
                      )}
                    </button>
                  )}
                  <small className="text-[11px] text-[#777] block">コードをクリックするとコピーできます</small>
                </div>

                <div className="flex items-center justify-center gap-2 text-xs text-[#aaa]">
                  <Loader2 className="size-4 animate-spin text-red-500" />
                  <span>認証を待っています…（スマホやPCで承認してください）</span>
                </div>
              </div>
            )}

            {authStatus === "signed_in" && account && (
              <div className="space-y-5">
                <div className="flex items-center gap-3 pb-3 border-b border-[#383838]">
                  <div className="size-10 rounded-xl bg-green-600/20 border border-green-500/30 flex items-center justify-center text-green-400">
                    <Check className="size-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">ログイン済み</h2>
                    <p className="text-xs text-[#aaa]">YouTubeアカウントと正常に連携されています</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 bg-[#181818] p-4 rounded-xl border border-[#333]">
                  <img
                    src={account.avatar}
                    alt={account.name}
                    className="size-12 rounded-full object-cover border border-[#444]"
                  />
                  <div>
                    <h3 className="font-bold text-white text-base">{account.name}</h3>
                    <p className="text-xs text-[#888]">{account.handle}</p>
                    <span className="inline-block mt-1 text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-semibold">
                      同期有効
                    </span>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTvAuthOpen(false)}
                    className="border-[#383838] text-white hover:bg-[#333]"
                  >
                    閉じる
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={signOut}
                    className="bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white border border-red-500/30 flex items-center gap-1.5"
                  >
                    <LogOut className="size-4" />
                    <span>ログアウト</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. 再生履歴モーダル */}
      {historyOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setHistoryOpen(false)}
        >
          <div
            className="w-full max-w-md bg-[#212121] border border-[#383838] rounded-2xl p-5 shadow-2xl space-y-4 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#383838] pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <History className="size-5 text-emerald-400" />
                <span>再生履歴 ({history.length})</span>
              </h3>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="text-[#aaa] hover:text-white"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {history.length === 0 ? (
                <p className="text-center text-xs text-[#888] py-8">再生履歴はまだありません</p>
              ) : (
                history.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      playVideo(item);
                      setHistoryOpen(false);
                    }}
                    className="flex items-center gap-3 p-2 rounded-xl hover:bg-[#2a2a2a] cursor-pointer group"
                  >
                    <img
                      src={`https://i.ytimg.com/vi/${item.id}/default.jpg`}
                      alt={item.title}
                      className="w-16 h-10 object-cover rounded-md bg-[#333]"
                    />
                    <div className="flex-1 min-w-0 text-xs">
                      <p className="font-semibold text-white line-clamp-1 group-hover:text-red-400">
                        {item.title}
                      </p>
                      <p className="text-[11px] text-[#888] truncate">{item.author}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {history.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setHistory([]);
                  localStorage.removeItem("rinetube_history");
                  toast.success("履歴を消去しました");
                }}
                className="w-full border-[#383838] text-xs text-red-400 hover:bg-[#2a2a2a]"
              >
                履歴をすべて消去
              </Button>
            )}
          </div>
        </div>
      )}

      {/* 7. 再生設定モーダル */}
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
                <label className="font-bold text-[#f1f1f1] block mb-1.5">再生方式</label>
                <div className="grid grid-cols-2 gap-2">
                  {PLAY_MODES.map((m) => (
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
