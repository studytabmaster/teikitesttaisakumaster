import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Lock } from "lucide-react";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "プライバシーポリシー｜RINE" },
      {
        name: "description",
        content: "RINE（トーク・通話アプリ）のプライバシーポリシー。取り扱う情報の種類、利用目的、保管方法をまとめています。",
      },
      { property: "og:title", content: "プライバシーポリシー｜RINE" },
      {
        property: "og:description",
        content: "RINE のプライバシーポリシー。取り扱う情報の種類、利用目的、保管方法をまとめています。",
      },
    ],
  }),
  component: PrivacyPage,
});

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "1. 取り扱う情報",
    body: [
      "本サービスでは、以下の情報を取り扱います。",
      "・ログイン用の名前とパスワード（パスワードは暗号化して保管され、当方にも内容はわかりません）",
      "・表示名、ひとこと、アイコン画像",
      "・自動で発行されるフレンドID",
      "・送信したメッセージ、送信日時、既読・未読の状態",
      "・通話の履歴（不在着信の記録など）",
      "・ブロック・通報の内容",
      "・Google でログインした場合、Google アカウントから受け取る名前などの基本情報",
    ],
  },
  {
    title: "2. 利用目的",
    body: [
      "取得した情報は、以下の目的で利用します。",
      "・アカウントの作成・ログインの確認のため",
      "・メッセージや通話の相手に名前・アイコンを表示するため",
      "・トーク履歴を保存し、機種変更や別の端末でも表示できるようにするため",
      "・フレンドIDによる友だち追加をできるようにするため",
      "・迷惑行為への対応（ブロック・通報の確認）のため",
      "・サービスの維持・改善のための集計（個人を特定できない形）",
    ],
  },
  {
    title: "3. 情報の保管と通信",
    body: [
      "メッセージやプロフィールなどのデータは、暗号化された外部データベースに保管されます。通信はすべて暗号化（HTTPS）されています。",
      "通話の音声・映像は、サーバーを経由せず、通話する相手と直接やり取りされます（音声・映像そのものは保存されません）。不在着信などの記録のみ保存されます。",
      "第三者が本サービスのデータベースに勝手にアクセスできないよう、アクセス制御（行単位のセキュリティ設定）を設けています。あなたのトークは、あなたとやり取り相手、およびシステム管理者のみが参照できる状態にあります。",
    ],
  },
  {
    title: "4. 第三者提供",
    body: [
      "法令に基づく場合を除き、ユーザーの同意なく個人を特定できる情報を第三者に提供することはありません。",
      "サービスの運営に必要な外部サービス（データベース・認証基盤など）には、その運営に必要な最小限の範囲でデータを預けています。",
    ],
  },
  {
    title: "5. 他のユーザーに見える情報",
    body: [
      "あなたの表示名、ひとこと、アイコン画像、フレンドIDは、友だちや同じグループのメンバーに表示されます。グループの検索や公開グループに参加した場合、他のユーザーにも表示されることがあります。",
      "個人が特定できる情報（住所・電話番号・学校名など）を、名前やひとことに書き込まないようご注意ください。",
    ],
  },
  {
    title: "6. 通知・位置情報について",
    body: [
      "着信やメッセージの通知は、ブラウザの通知機能を使います。通知の許可はユーザーの操作があった場合にのみ求め、いつでもブラウザ設定で止められます。",
      "本サービスは位置情報を取得・利用しません。",
    ],
  },
  {
    title: "7. 未成年の利用",
    body: [
      "未成年の方が本サービスを利用する場合は、保護者の方の同意を得たうえでご利用ください。",
    ],
  },
  {
    title: "8. 情報の開示・削除・お問い合わせ",
    body: [
      "ご自身の登録情報（表示名・ひとこと・アイコン）は、プロフィール画面からいつでも確認・変更できます。",
      "アカウントやデータの削除をご希望の場合は、アプリ内の Q&A に記載の方法でお問い合わせください。確認後、データを削除いたします。",
    ],
  },
  {
    title: "9. ポリシーの変更",
    body: [
      "本ポリシーは、必要に応じて変更することがあります。変更後の内容は、本サービス上に掲載した時点から適用されます。",
    ],
  },
];

function PrivacyPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col bg-background">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
        <Link
          to="/profile"
          className="flex items-center rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="戻る"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-lg font-bold tracking-tight">プライバシーポリシー</h1>
      </header>

      <main className="flex-1 px-4 pb-16 pt-5">
        <div className="mb-5 flex items-center gap-3 rounded-2xl bg-muted/60 p-4">
          <Lock className="size-8 shrink-0 text-primary" />
          <p className="text-sm leading-relaxed text-muted-foreground">
            RINE で扱う情報と、その使いみちをわかりやすくまとめました。最終更新日：2026年9月21日
          </p>
        </div>

        <div className="space-y-4">
          {SECTIONS.map((s) => (
            <section key={s.title} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
              <h2 className="text-sm font-bold">{s.title}</h2>
              <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">
                {s.body.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
