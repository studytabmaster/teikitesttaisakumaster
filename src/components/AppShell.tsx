import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { AdBanner } from "@/components/AdBanner";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Compass, MessageCircle, Pin, Search, Users, UsersRound, UserRound, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/", label: "トーク", icon: MessageCircle, shortcut: "Alt+1" },
  { to: "/friends", label: "友だち", icon: Users, shortcut: "Alt+2" },
  { to: "/groups", label: "グループ", icon: UsersRound, shortcut: "Alt+3" },
  { to: "/open", label: "オープン", icon: Compass, shortcut: "Alt+4" },
  { to: "/profile", label: "プロフィール", icon: UserRound, shortcut: "Alt+5" },
] as const;

export function AppShell({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");

  useEffect(() => {
    if (!loading && !session) void navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  // PCショートカットキー: Alt+1..5 でタブ移動、Ctrl+K / Cmd+K でクイック検索
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
        return;
      }

      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= TABS.length) {
          e.preventDefault();
          const target = TABS[num - 1];
          if (target) void navigate({ to: target.to });
        }
      }

      if (e.key === "Escape" && paletteOpen) {
        setPaletteOpen(false);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, paletteOpen]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="size-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  const PALETTE_COMMANDS = [
    { label: "Keepメモを開く（自分専用・通信量0）", to: "/keep", icon: Pin },
    { label: "トーク一覧", to: "/", icon: MessageCircle },
    { label: "友だちリスト", to: "/friends", icon: Users },
    { label: "グループ一覧", to: "/groups", icon: UsersRound },
    { label: "オープンチャット", to: "/open", icon: Compass },
    { label: "プロフィール・設定", to: "/profile", icon: UserRound },
  ];

  const filteredCommands = PALETTE_COMMANDS.filter((cmd) =>
    cmd.label.toLowerCase().includes(paletteQuery.toLowerCase())
  );

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col bg-background">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/90 px-5 py-3 backdrop-blur">
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        <div className="flex items-center gap-1.5">
          <Link
            to="/keep"
            className="flex items-center gap-1 rounded-full bg-muted/80 px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Keepメモを開く"
          >
            <Pin className="size-3.5 text-primary" />
            <span>Keep</span>
          </Link>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="hidden sm:flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
            title="クイック検索 (Ctrl+K)"
          >
            <Search className="size-3" />
            <span>Cmd+K</span>
          </button>
          {action}
        </div>
      </header>

      <AnnouncementBanner />

      <main className="flex-1 pb-36">
        {children}

        {/* スクロール下部の自然な広告枠（広告2：ff17effbd034eb2a76751472ab945fc0） */}
        <div className="mt-8 mb-4 flex justify-center">
          <AdBanner id="ff17effbd034eb2a76751472ab945fc0" />
        </div>
      </main>

      {/* 下部メニュー直上の常時固定広告（広告1：a4204fd7c61d30fa3797c15aeff9ba54） */}
      <div className="fixed bottom-[57px] left-1/2 z-20 w-full max-w-lg -translate-x-1/2 flex justify-center border-t border-border/40 bg-background/95 backdrop-blur py-1">
        <AdBanner id="a4204fd7c61d30fa3797c15aeff9ba54" />
      </div>

      <nav className="fixed bottom-0 left-1/2 z-20 w-full max-w-lg -translate-x-1/2 border-t border-border bg-background/95 backdrop-blur">
        <ul className="flex">
          {TABS.map((tab) => {
            const active = pathname === tab.to;
            const Icon = tab.icon;
            return (
              <li key={tab.to} className="flex-1">
                <Link
                  to={tab.to}
                  title={`${tab.label} (${tab.shortcut})`}
                  className={cn(
                    "flex flex-col items-center gap-1 py-3 text-[11px] font-medium transition-colors",
                    active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-5" />
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Ctrl+K クイックコマンドパレット */}
      {paletteOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-20 backdrop-blur-sm"
          onClick={() => setPaletteOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-popover shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center border-b border-border px-3 py-2.5">
              <Search className="size-4 text-muted-foreground mr-2 shrink-0" />
              <input
                autoFocus
                value={paletteQuery}
                onChange={(e) => setPaletteQuery(e.target.value)}
                placeholder="ページや機能を検索 (Escで閉じる)..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <button
                type="button"
                onClick={() => setPaletteOpen(false)}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto p-1.5">
              {filteredCommands.length === 0 ? (
                <p className="p-4 text-center text-xs text-muted-foreground">該当する機能がありません</p>
              ) : (
                filteredCommands.map((cmd) => {
                  const Icon = cmd.icon;
                  return (
                    <button
                      key={cmd.to}
                      type="button"
                      onClick={() => {
                        setPaletteOpen(false);
                        void navigate({ to: cmd.to });
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs hover:bg-accent transition"
                    >
                      <Icon className="size-4 text-primary shrink-0" />
                      <span className="flex-1 font-medium">{cmd.label}</span>
                      <span className="text-[10px] text-muted-foreground">移動 ↵</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
