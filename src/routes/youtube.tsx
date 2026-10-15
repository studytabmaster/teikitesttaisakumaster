import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Search,
  Play,
  ExternalLink,
  RotateCcw,
  Shield,
  GraduationCap,
  Sparkles,
  Server,
  Layers,
  Loader2,
  Clock,
  Tv,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/youtube")({
  component: YouTubePage,
  head: () => ({
    meta: [
      { title: "YouTube検索＆再生｜RINE" },
      {
        name: "description",
        content: "教育モードやプロキシ再生に対応した軽量YouTubeビューワー。",
      },
    ],
  }),
});

type PlayMethod = "nocookie" | "education" | "kahoot" | "piped";

interface VideoItem {
  id: string;
  title: string;
  channel: string;
  views?: string;
  timeAgo?: string;
  thumbnail?: string;
}

const DEFAULT_VIDEOS: VideoItem[] = [
  {
    id: "jfKfPfyJRdk",
    title: "lofi hip hop radio - beats to relax/study to",
    channel: "Lofi Girl",
    views: "再生中",
    timeAgo: "ライブ配信",
  },
  {
    id: "qwYhKlY4Tx0",
    title: "YOASOBI「咲き誇れ」Official Music Video",
    channel: "YOASOBI",
    views: "公開中",
    timeAgo: "新着",
  },
  {
    id: "kJQP7kiw5Fk",
    title: "Luis Fonsi - Despacito ft. Daddy Yankee",
    channel: "Luis Fonsi",
    views: "80億回",
    timeAgo: "人気曲",
  },
];

export function YouTubePage() {
  const [query, setQuery] = useState("");
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState<string>("");
  const [method, setMethod] = useState<PlayMethod>("nocookie");
  const [history, setHistory] = useState<VideoItem[]>([]);
  const [searchResults, setSearchResults] = useState<VideoItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isTvMode, setIsTvMode] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("rine_youtube_history_v1");
      if (saved) setHistory(JSON.parse(saved));
    } catch {}
  }, []);

  const saveHistory = (item: VideoItem) => {
    setHistory((prev) => {
      const filtered = prev.filter((v) => v.id !== item.id);
      const next = [item, ...filtered].slice(0, 10);
      try {
        localStorage.setItem("rine_youtube_history_v1", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const extractVideoId = (input: string): string | null => {
    const trimmed = input.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
    const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = trimmed.match(regExp);
    return match ? match[1] : null;
  };

  const handleSearchOrPlay = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = query.trim();
    if (!q) return;

    const directId = extractVideoId(q);
    if (directId) {
      handlePlay(directId, "再生中の動画");
      return;
    }

    setIsSearching(true);
    setSearchResults([]);

    const instances = [
      "https://invidious.f5.si",
      "https://inv.riverside.rocks",
      "https://vid.puffyan.us",
    ];

    let found = false;
    for (const inst of instances) {
      try {
        const res = await fetch(
          `${inst}/api/v1/search?q=${encodeURIComponent(q)}&type=video`,
          { signal: AbortSignal.timeout(4000) }
        );
        if (!res.ok) continue;
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const list: VideoItem[] = data.slice(0, 15).map((item: any) => ({
            id: item.videoId,
            title: item.title,
            channel: item.author || "チャンネル",
            views: item.viewCountText || "再生",
            timeAgo: item.publishedText || "",
          }));
          setSearchResults(list);
          found = true;
          break;
        }
      } catch {}
    }

    setIsSearching(false);
    if (!found) {
      toast.error("検索結果を取得できませんでした。YouTubeのURLまたは動画IDを直接入力してください。");
    }
  };

  const handlePlay = (id: string, title: string) => {
    setActiveVideoId(id);
    setActiveTitle(title);
    saveHistory({ id, title, channel: "動画" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const getPlayerSrc = (id: string, m: PlayMethod) => {
    switch (m) {
      case "nocookie":
        return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
      case "education":
        return `https://www.youtube.com/embed/${id}?autoplay=1&enablejsapi=1&iv_load_policy=3`;
      case "kahoot":
        return `https://www.youtube.com/embed/${id}?autoplay=1&controls=1&modestbranding=1`;
      case "piped":
        return `https://piped.video/embed/${id}?autoplay=1`;
    }
  };

  return (
    <div className={`min-h-screen bg-background text-foreground transition-all ${isTvMode ? "p-0" : "pb-12"}`}>
      {/* ヘッダー */}
      {!isTvMode && (
        <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur px-4 py-2.5 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="flex size-8 items-center justify-center rounded-full hover:bg-muted text-muted-foreground transition-colors"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div className="flex items-center gap-1.5 font-black text-base tracking-tight">
              <div className="flex size-7 items-center justify-center rounded-lg bg-red-600 text-white shadow-sm">
                <Play className="size-3.5 fill-white" />
              </div>
              <span className="hidden sm:inline">RINE</span>
              <span className="text-red-600">Tube</span>
            </div>
          </div>

          <form onSubmit={handleSearchOrPlay} className="relative flex-1 max-w-md">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="動画名、曲名、またはYouTubeのURLを貼り付け"
              className="h-9 pr-9 pl-3 text-xs rounded-full border-border bg-muted/50 focus:bg-background"
            />
            <button
              type="submit"
              disabled={isSearching}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {isSearching ? <Loader2 className="size-4 animate-spin text-primary" /> : <Search className="size-4" />}
            </button>
          </form>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsTvMode(true)}
            className="h-8 gap-1 text-xs"
            title="テレビ全画面大画面モード"
          >
            <Tv className="size-3.5" />
            <span className="hidden sm:inline">大画面・TV</span>
          </Button>
        </header>
      )}

      {/* プレイヤー領域 */}
      {activeVideoId && (
        <div className={`w-full bg-black ${isTvMode ? "fixed inset-0 z-50 flex flex-col" : "relative shadow-md"}`}>
          {isTvMode && (
            <div className="absolute top-3 right-3 z-50 flex items-center gap-2 bg-black/60 backdrop-blur rounded-full px-3 py-1 text-white text-xs">
              <Tv className="size-3.5" />
              <span>テレビ大画面モード</span>
              <button
                type="button"
                onClick={() => setIsTvMode(false)}
                className="ml-2 font-bold hover:underline"
              >
                通常に戻る
              </button>
            </div>
          )}

          <div className="mx-auto w-full max-w-5xl aspect-video relative flex-1">
            <iframe
              src={getPlayerSrc(activeVideoId, method)}
              title={activeTitle || "YouTube Video"}
              className="size-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>

          {!isTvMode && (
            <div className="bg-card border-b border-border px-4 py-3">
              <div className="mx-auto max-w-5xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="font-bold text-sm sm:text-base truncate">{activeTitle || "動画再生中"}</h1>
                  <p className="text-xs text-muted-foreground">ID: {activeVideoId}</p>
                </div>

                {/* 再生方式切替タブ */}
                <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-muted p-1">
                  {(
                    [
                      { id: "nocookie", label: "通常", icon: Shield },
                      { id: "education", label: "Education", icon: GraduationCap },
                      { id: "kahoot", label: "Kahoot風", icon: Sparkles },
                      { id: "piped", label: "プロキシ", icon: Server },
                    ] as const
                  ).map((m) => {
                    const Icon = m.icon;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMethod(m.id)}
                        className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all ${
                          method === m.id
                            ? "bg-card text-foreground shadow-xs"
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
          )}
        </div>
      )}

      {/* メインコンテンツ */}
      <main className="mx-auto max-w-5xl px-4 py-6 space-y-6">
        {/* 検索結果 */}
        {searchResults.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold tracking-tight flex items-center gap-1.5">
                <Search className="size-4 text-primary" />
                検索結果（{searchResults.length}件）
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSearchResults([])}
                className="h-6 text-xs text-muted-foreground"
              >
                クリア
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {searchResults.map((v) => (
                <div
                  key={v.id}
                  onClick={() => handlePlay(v.id, v.title)}
                  className="group cursor-pointer rounded-xl border bg-card p-2.5 hover:border-primary transition-all shadow-xs"
                >
                  <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
                    <img
                      src={`https://img.youtube.com/vi/${v.id}/mqdefault.jpg`}
                      alt={v.title}
                      loading="lazy"
                      className="size-full object-cover transition-transform group-hover:scale-105"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="flex size-9 items-center justify-center rounded-full bg-red-600 text-white">
                        <Play className="size-4 fill-white ml-0.5" />
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 space-y-0.5">
                    <h3 className="line-clamp-2 text-xs font-bold leading-snug">{v.title}</h3>
                    <p className="text-[11px] text-muted-foreground truncate">{v.channel}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 履歴 */}
        {history.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Clock className="size-3.5" />
                最近再生した動画
              </h2>
              <button
                type="button"
                onClick={() => {
                  setHistory([]);
                  localStorage.removeItem("rine_youtube_history_v1");
                }}
                className="text-[10px] text-muted-foreground hover:underline"
              >
                履歴を消去
              </button>
            </div>
            <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-none">
              {history.map((v) => (
                <div
                  key={v.id}
                  onClick={() => handlePlay(v.id, v.title)}
                  className="flex-shrink-0 w-36 cursor-pointer space-y-1 group"
                >
                  <div className="relative aspect-video w-full overflow-hidden rounded-md bg-muted">
                    <img
                      src={`https://img.youtube.com/vi/${v.id}/mqdefault.jpg`}
                      alt={v.title}
                      loading="lazy"
                      className="size-full object-cover transition-transform group-hover:scale-105"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play className="size-5 fill-white text-white drop-shadow" />
                    </div>
                  </div>
                  <h3 className="line-clamp-2 text-[11px] font-semibold leading-tight">{v.title}</h3>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* おすすめ動画 */}
        <div>
          <h2 className="text-sm font-bold tracking-tight text-foreground/80 mb-3">
            おすすめ動画
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {DEFAULT_VIDEOS.map((v) => (
              <div
                key={v.id}
                onClick={() => handlePlay(v.id, v.title)}
                className="group cursor-pointer space-y-2 rounded-xl p-2 transition-all hover:bg-muted/50 border border-transparent hover:border-border"
              >
                <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted shadow-sm">
                  <img
                    src={`https://img.youtube.com/vi/${v.id}/mqdefault.jpg`}
                    alt={v.title}
                    loading="lazy"
                    className="size-full object-cover transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex size-10 items-center justify-center rounded-full bg-red-600/90 text-white shadow-lg">
                      <Play className="size-4 fill-white ml-0.5" />
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="line-clamp-2 text-xs font-bold leading-snug">{v.title}</h3>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span>{v.channel}</span>
                    <span>•</span>
                    <span>{v.views}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
