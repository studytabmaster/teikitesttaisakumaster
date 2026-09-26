import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "@/hooks/useAuth";
import { CallProvider } from "@/components/CallProvider";
import { GroupCallProvider } from "@/components/GroupCallProvider";
import { Notifications } from "@/components/Notifications";
import { Toaster } from "@/components/ui/sonner";
import { OfflineBanner } from "@/components/OfflineBanner";

// 広告コンポーネント（静的HTML経由で読み込むことでRefererを正常送信＆document.writeを確実に動作させる）
function AdMaxBanner({ id }: { id: string }) {
  return (
    <iframe
      src={`/ad.html?id=${id}`}
      width={160}
      height={600}
      title={`ad-${id}`}
      scrolling="no"
      className="w-[160px] h-[600px] border-0 overflow-hidden rounded bg-muted/10 shadow-sm"
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
    />
  );
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "RINE｜ブラウザで使えるトーク・通話アプリ" },
      {
        name: "description",
        content: "IDで友だち追加して、リアルタイムのトークと音声・ビデオ通話ができるブラウザアプリ。",
      },
      { name: "author", content: "RINE" },
      { property: "og:title", content: "RINE｜ブラウザで使えるトーク・通話アプリ" },
      {
        property: "og:description",
        content: "IDで友だち追加、リアルタイムのトークと無料の音声・ビデオ通話。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#06c755" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "RINE" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@400;500;700;900&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "apple-touch-icon", href: "/favicon.ico" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CallProvider>
          <GroupCallProvider>
            <Notifications />
            <OfflineBanner />
            {/* メイン画面（中央・スマホ幅） */}
            <Outlet />

            {/* PC右サイドの広告（画面幅840px以上で右側に固定表示） */}
            <aside
              aria-label="スポンサーリンク"
              className="hidden min-[840px]:flex fixed right-4 top-14 z-30 flex-col gap-4 max-h-[calc(100vh-4rem)] overflow-y-auto pointer-events-auto"
            >
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-muted-foreground mb-1">スポンサーリンク</span>
                <AdMaxBanner id="8e72c87da03a9f6b14801ad9e35ce69d" />
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-muted-foreground mb-1">スポンサーリンク</span>
                <AdMaxBanner id="e5719f08d845ec8ceaacd22f674c6316" />
              </div>
            </aside>
          </GroupCallProvider>
        </CallProvider>
      </AuthProvider>
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
