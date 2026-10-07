import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, FileText } from "lucide-react";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "利用規約｜RINE" },
      {
        name: "description",
        content: "RINE（トーク・通話アプリ）の利用規約です。サービスの利用条件や禁止事項、広告配信についてまとめています。",
      },
      { property: "og:title", content: "利用規約｜RINE" },
      { property: "og:description", content: "RINE の利用規約。サービスの利用条件や禁止事項をまとめています。" },
    ],
  }),
  component: TermsPage,
});

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "第1条（適用）",
    body: [
      "本規約は、トーク・通話アプリ「RINE」（以下「本サービス」）の利用条件を定めるものです。本サービスを利用するすべての方（以下「ユーザー」）に適用されます。",
      "ユーザーは本サービスを利用した時点で、本規約に同意したものとみなされます。",
    ],
  },
  {
    title: "第2条（アカウント）",
    body: [
      "ユーザーは、名前とパスワード（または Google アカウント）でアカウントを作成します。作成時に、友だち追加に使う固有のフレンドIDが自動で発行されます。",
      "名前やパスワードの管理責任はユーザー自身にあります。第三者に知られたことによって生じた損害について、当方は責任を負いません。",
      "アカウントは一人につき一つとしてください。他人になりすます目的での登録は禁止します。",
    ],
  },
  {
    title: "第3条（禁止事項）",
    body: [
      "以下の行為を禁止します。",
      "・法令または公序良俗に違反する行為",
      "・他のユーザーへの嫌がらせ、脅迫、差別的な発言、迷惑行為",
      "・わいせつな表現、露出度の高い画像、児童ポルノ、暴力表現、過激な内容の送信およびプロフィールへの設定",
      "・第三者の著作権、肖像権、商標権などの知的財産権を侵害する行為（無断での他人の写真の使用を含む）",
      "・他人になりすます行為、虚偽の情報を流す行為",
      "・ヘイトスピーチ、差別的なシンボルや標章を含むコンテンツの投稿・設定",
      "・スパム（無差別送信、宣伝行為）や、本サービスのサーバーに過度な負荷をかける行為",
      "・不正な手段による自動アクセス、データの改ざん・収集行為",
      "・その他、当方が不適切と判断する行為",
    ],
  },
  {
    title: "第4条（コンテンツについて）",
    body: [
      "ユーザーが送信したメッセージ・画像・アイコンなどのコンテンツの権利は、ユーザー自身に帰属します。",
      "ただし、サービスを提供・表示するために必要な範囲で、当方がこれを保存・処理することに同意していただきます。",
      "ユーザー間で送り合ったコンテンツについて、当方はその内容を保証しません。トラブルは当事者間で解決してください。",
    ],
  },
  {
    title: "第5条（ブロック・通報とアカウント停止）",
    body: [
      "ユーザーは他のユーザーをブロック・通報できます。通報を受けた場合、当方は内容を確認し、必要に応じて該当アカウントの停止やデータの削除を行うことがあります。",
      "本規約に違反した場合、事前の通知なくアカウントを停止・削除することがあります。",
    ],
  },
  {
    title: "第6条（サービスの変更・停止）",
    body: [
      "本サービスは無料で提供されていますが、予告なく機能の変更、追加、停止、終了を行うことがあります。",
      "障害やメンテナンスにより、一時的に利用できなくなることがあります。",
    ],
  },
  {
    title: "第7条（免責事項）",
    body: [
      "当方は、本サービスの利用によって生じたユーザーの損害について、故意または重過失による場合を除き、責任を負いません。",
      "通信環境・端末・ブラウザの仕様により、通知や通話が正しく動作しない場合があります。",
      "ユーザー間の紛争について、当方は原則として関与しません。",
    ],
  },
  {
    title: "第8条（グループ・オープンチャット）",
    body: [
      "グループやオープンチャットの作成者（管理者）は、参加申請の承認・却下、メンバーの管理を行えます。",
      "オープンチャットは誰でも見つけられる公開の場です。個人情報（本名・住所・電話番号・学校名など）を書き込まないでください。",
      "オープンチャットでの出会い目的の勧誘、金銭のやり取り、外部サービスへの不当な誘導、スパム宣伝は禁止します。",
      "運営は、規約に違反するルームを予告なく非公開にしたり、投稿やルームそのものを削除したりすることがあります。",
    ],
  },
  {
    title: "第9条（未成年の利用について）",
    body: [
      "見知らぬ相手と実際に会う約束をしたり、自身の個人情報や写真を安易に送信したりしないでください。",
    ],
  },
  {
    title: "第10条（通話・画像の扱いとAI検査）",
    body: [
      "相手の同意なく通話を録音・録画したり、受け取った画像を無断で公開・転載したりすることを禁止します。",
      "他人の著作物や肖像を、権利者の許可なく送信・設定しないでください。",
      "健全なコミュニティ環境を維持するため、プロフィールアイコン画像の設定時にAIによる自動検査（モデレーション）を実施しています。規約違反の疑いがある画像は自動的に設定が拒否されます。",
      "自動検査をすり抜けた場合であっても、不適切な画像が確認された場合は運営側で予告なく画像を初期化またはアカウントを停止することがあります。",
    ],
  },
  {
    title: "第11条（違反への対応）",
    body: [
      "違反が確認された場合、運営は警告、投稿の削除、一定期間または無期限の利用停止などの措置をとることがあります。",
      "悪質な違反（犯罪予告、児童への加害など）については、警察等の関係機関に通報・情報提供を行います。",
    ],
  },
  {
    title: "第12条（広告の掲載）",
    body: [
      "本サービスの運営を維持するため、本サービス内において当方または第三者（Google等）が提供する広告を掲載することがあります。ユーザーは本サービスを利用することで、これに同意したものとみなします。",
    ],
  },
  {
    title: "第13条（規約の変更）",
    body: [
      "当方は、必要と判断した場合、本規約を変更できます。変更後の規約は、本サービス上に掲載した時点から効力を生じます。",
    ],
  },
];

function TermsPage() {
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
        <h1 className="text-lg font-bold tracking-tight">利用規約</h1>
      </header>

      <main className="flex-1 px-4 pb-16 pt-5">
        <div className="mb-5 flex items-center gap-3 rounded-2xl bg-muted/60 p-4">
          <FileText className="size-8 shrink-0 text-primary" />
          <p className="text-sm leading-relaxed text-muted-foreground">
            RINE をご利用いただくにあたっての利用条件です。最終更新日：2026年10月7日
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
