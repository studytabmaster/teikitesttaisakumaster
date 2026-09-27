import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, MessageSquare, Phone, Users, ShieldCheck, HeartHandshake } from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "RINEについて（サービス紹介）｜RINE" },
      {
        name: "description",
        content: "ブラウザで動く無料のリアルタイムチャット・通話アプリ「RINE」のサービス目的、機能、セキュリティについてご紹介します。",
      },
      { property: "og:title", content: "RINEについて｜RINE" },
      {
        property: "og:description",
        content: "ブラウザ完結の安心・快適なコミュニケーションサービス「RINE」の特徴と目指すもの。",
      },
    ],
  }),
  component: AboutPage,
});

export default function AboutPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col bg-background">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
        <Link
          to="/"
          className="flex items-center rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="戻る"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-lg font-bold tracking-tight">RINEについて</h1>
      </header>

      <main className="flex-1 px-4 pb-16 pt-5 space-y-6">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <HeartHandshake className="size-6" />
            </div>
            <h2 className="text-base font-bold">RINEの目的と目指すもの</h2>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            RINE（ライン）は、アプリのインストール不要で、Webブラウザさえあればスマホ・PC・タブレットからすぐに使える次世代のコミュニケーションプラットフォームです。
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            「いつでも、だれとでも、手軽に安全につながる場」を提供することを目指し、個人情報の入力なしで利用できるプライバシー配慮型の設計を採用しています。
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-bold text-foreground px-1">主な機能・特徴</h2>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-3">
            <div className="flex items-start gap-3">
              <MessageSquare className="size-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold">1対1の高速リアルタイムトーク</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  独自のフレンドIDで友だち追加。文字メッセージや画像のやり取りがリアルタイムにサクサク届きます。
                </p>
              </div>
            </div>

            <div className="border-t border-border/50 pt-3 flex items-start gap-3">
              <Phone className="size-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold">無料の音声・ビデオ通話</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  ブラウザ標準技術（WebRTC）を活用したP2P直接通信により、低遅延かつ高音質・軽量な通話を実現しています。
                </p>
              </div>
            </div>

            <div className="border-t border-border/50 pt-3 flex items-start gap-3">
              <Users className="size-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold">グループ＆オープンチャット</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  仲の良い友達同士でのグループトークはもちろん、共通の趣味や話題で語り合える公開型のオープンチャットも自由に作成・参加できます。
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="size-6" />
            </div>
            <h2 className="text-base font-bold">安心・安全への取り組み</h2>
          </div>
          <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <p>
              <strong>通信の暗号化：</strong>すべての通信はSSL/TLSによって暗号化されており、第三者による盗聴や改ざんを防止しています。
            </p>
            <p>
              <strong>健全なコミュニティ維持：</strong>不適切な投稿やスパム行為に対しては、通報機能および管理者による巡回・厳格なアカウント停止措置を行っています。
            </p>
            <p>
              <strong>個人情報の最小化：</strong>電話番号や実名などの登録は不要で、ニックネームだけで安心して利用を開始できます。
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-muted/40 p-4 text-center">
          <p className="text-xs text-muted-foreground">
            ご意見・ご要望やお問い合わせは、アプリ内のQ&A（よくある質問）またはお問い合わせ窓口よりお気軽にお寄せください。
          </p>
        </section>
      </main>
    </div>
  );
}
