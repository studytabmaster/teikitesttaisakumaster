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

function AdMaxBanner({ id }: { id: string }) {
  return (
    <div className="relative w-[160px] h-[600px]">
      {/* ×印：表示のみ・クリック判定なし */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1 right-3 z-[60] flex h-3 w-3 items-center justify-center rounded-full bg-black/50 text-[8px] leading-none text-white"
      >
        ×
      </span>

      <iframe
        src={`/ad.html?id=${id}`}
        width={160}
        height={600}
        title={`ad-${id}`}
        scrolling="no"
        className="w-[160px] h-[600px] border-0"
      />
    </div>
  );
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>

        <h2 className="mt-4 text-xl font-semibold text-foreground">
          Page not found
        </h2>

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

function ErrorComponent({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  console.error(error);

  const router = useRouter();

  useEffect(() => {
    reportLovableError(error, {
      boundary: "tanstack_root_error_component",
    });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back
          home.
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
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route =
  createRootRouteWithContext<{ queryClient: QueryClient }>()({
    head: () => ({
      meta: [
        {
          charSet: "utf-8",
        },
        {
          name: "viewport",
          content: "width=device-width, initial-scale=1",
        },
        {
          title: "RINE｜ブラウザで使えるトーク・通話アプリ",
        },
        {
          name: "description",
          content:
            "IDで友だち追加して、リアルタイムのトークと音声・ビデオ通話ができるブラウザアプリ。",
        },
        {
          name: "author",
          content: "RINE",
        },
        {
          property: "og:title",
          content: "RINE｜ブラウザで使えるトーク・通話アプリ",
        },
        {
          property: "og:description",
          content:
            "IDで友だち追加、リアルタイムのトークと無料の音声・ビデオ通話。",
        },
        {
          property: "og:type",
          content: "website",
        },
        {
          name: "twitter:card",
          content: "summary_large_image",
        },
        {
          name: "theme-color",
          content: "#06c755",
        },
        {
          name: "apple-mobile-web-app-capable",
          content: "yes",
        },
        {
          name: "apple-mobile-web-app-title",
          content: "RINE",
        },
        {
          name: "apple-mobile-web-app-status-bar-style",
          content: "default",
        },
        {
          name: "mobile-web-app-capable",
          content: "yes",
        },
      ],

      links: [
        {
          rel: "stylesheet",
          href: appCss,
        },
        {
          rel: "preconnect",
          href: "https://fonts.googleapis.com",
        },
        {
          rel: "preconnect",
          href: "https://fonts.gstatic.com",
          crossOrigin: "anonymous",
        },
        {
          rel: "stylesheet",
          href:
            "https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@400;500;700;900&display=swap",
        },
        {
          rel: "icon",
          href: "/favicon.ico",
          type: "image/x-icon",
        },
        {
          rel: "apple-touch-icon",
          href: "/favicon.ico",
        },
        {
          rel: "manifest",
          href: "/manifest.webmanifest",
        },
      ],
    }),

    shellComponent: RootShell,
    component: RootComponent,
    notFoundComponent: NotFoundComponent,
    errorComponent: ErrorComponent as never,
  });

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <HeadContent />
      </head>

      <body>
        {children}

        {/* AdMax インタースティシャル */}
        <script src="https://adm.shinobi.jp/s/d602eabaa7d814aa958a79e16519f5d8"></script>

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

            <Outlet />

            {/* PCのみ左右に160×600広告を表示 */}
            <div className="hidden min-[840px]:block">

              {/* 左広告 */}
              <aside
                aria-label="左側スポンサーリンク"
                className="fixed left-4 top-14 z-50"
              >
                <div className="flex flex-col items-center">
                  <span className="mb-1 text-[10px] text-muted-foreground">
                    スポンサーリンク
                  </span>

                  <AdMaxBanner
                    id="e5719f08d845ec8ceaacd22f674c6316"
                  />
                </div>
              </aside>

              {/* 右広告 */}
              <aside
                aria-label="右側スポンサーリンク"
                className="fixed right-4 top-14 z-50"
              >
                <div className="flex flex-col items-center">
                  <span className="mb-1 text-[10px] text-muted-foreground">
                    スポンサーリンク
                  </span>

                  <AdMaxBanner
                    id="c792115427a5fe7070d1206446fa2c85"
                  />
                </div>
              </aside>

            </div>
          </GroupCallProvider>
        </CallProvider>
      </AuthProvider>

      <Toaster
        position="top-center"
        richColors
      />
    </QueryClientProvider>
  );
}
