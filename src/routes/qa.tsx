import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CircleHelp } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const Route = createFileRoute("/qa")({
  head: () => ({
    meta: [
      { title: "Q&A（よくある質問）｜RINE" },
      {
        name: "description",
        content:
          "RINE のよくある質問。友だちの追加方法、通話、通知、アイコン設定など、使い方の疑問をまとめました。",
      },
      { property: "og:title", content: "Q&A（よくある質問）｜RINE" },
      {
        property: "og:description",
        content: "友だち追加・通話・通知など、RINE の使い方に関する質問と答えをまとめました。",
      },
    ],
  }),
  component: QaPage,
});

const QA = [
  {
    q: "友だちの追加はどうやるの？",
    a: "「友だち」タブを開いて、相手のフレンドID（半角英数字）を入力して検索します。自分のIDは「プロフィール」画面でコピーできます。相手にもあなたのIDを伝えれば、お互いに追加できます。",
  },
  {
    q: "自分のIDはどこで見られる？",
    a: "下の「プロフィール」タブを開くと、あなたのフレンドIDが大きく表示されます。横の「コピー」ボタンを押すと、そのまま友だちに送れます。IDは登録時に自動で割り当てられ、変更はできません。",
  },
  {
    q: "通話（音声・ビデオ）はどうやってかけるの？",
    a: "トーク画面を開いて、上部の通話ボタンから発信できます。初回はブラウザに「マイク・カメラの使用を許可しますか？」と聞かれるので、許可してください。相手が応答すると通話が始まります。",
  },
  {
    q: "通話しても相手の画面に何も出ない",
    a: "相手が別の画面を見ている、またはブラウザのマイク・カメラ許可が出ていない可能性があります。相手のブラウザ設定でマイクとカメラを許可してください。また、着信音が鳴るように、最初に一度だけ画面をタップしておくと確実です。",
  },
  {
    q: "着信の通知や音が鳴らない",
    a: "ブラウザは最初の操作（タップ）があるまで音を鳴らせない仕組みです。アプリを開いたら一度どこでもいいので画面をタップしてください。さらに通知の許可を求める画面が出たら「許可」を選ぶと、画面を閉じていても着信の通知が届くようになります。",
  },
  {
    q: "メッセージがすぐ届かないことがある",
    a: "通信状態によっては数秒かかることがあります。送ったメッセージはすぐ画面に表示され、裏側で保存されます。長く止まる場合は一度ページを再読み込みしてみてください。",
  },
  {
    q: "既読・未読はつけられる？",
    a: "トーク一覧の各行の「︙」メニューから「既読にする／未読にする」を切り替えられます。一覧上部の「すべて既読」でまとめて既読にもできます。",
  },
  {
    q: "アイコン画像はどんなファイルが使える？",
    a: "PNG / JPG / GIF / WEBP / BMP / HEIC / AVIF / SVG / TIFF など、ブラウザが読める画像ファイルならほぼすべて使えます。選ぶと自動で正方形に切り抜いて軽くするので、大きい写真でも大丈夫です。GIFは動きが止まった静止画になります。",
  },
  {
    q: "グループトークはできる？",
    a: "「グループ」タブから新規作成できます。公開グループ（オープン）にすると、誰でも参加申請できるグループになり、検索で見つけてもらえます。",
  },
  {
    q: "相手をブロック・通報したい",
    a: "相手のプロフィール画面からブロックできます。ブロックするとお互いのメッセージや通話は届かなくなります。迷惑な相手はプロフィール画面やトーク内の「通報」から報告できます。",
  },
  {
    q: "スマホのホーム画面に追加できる？",
    a: "iPhoneのSafariなら「共有」→「ホーム画面に追加」、AndroidのChromeならメニュー→「ホーム画面に追加」で、アプリのようにアイコンから開けるようになります。",
  },
  {
    q: "無料で使える？",
    a: "はい。RINE はブラウザだけで動くので、追加のアプリ代金などはかかりません。通信料はご利用の回線の料金規約に従います。",
  },
  {
    q: "送ったメッセージを取り消せる？",
    a: "はい。自分が送ったメッセージの「︙」メニューや長押しから「送信取り消し（削除）」ができます。取り消すと相手の画面からも消えます。取り消したことは相手には通知されません。",
  },
  {
    q: "グループ通話はできる？",
    a: "はい。グループのトーク画面を開いて、通話ボタンからグループ通話を開始できます。参加したいメンバーは同じ画面から着信に応答してください。スマホによっては参加人数が多いと動きが重くなることがあります。",
  },
  {
    q: "通話中にカメラを消したり切り替えたりできる？",
    a: "はい。通話画面のボタンでカメラのオン・オフ、音声のミュートを切り替えられます。スマホの場合はカメラ切り替えボタンでインカメラとアウトカメラを切り替えられます。",
  },
  {
    q: "電話に出られなかったときはどうなる？",
    a: "出られなかった場合は、トークに「不在着信」として記録が残ります。着信履歴を見て、あらためてメッセージを送るか折り返し発信してください。",
  },
  {
    q: "通信量はどのくらい？ 通話が重い・カクカクする",
    a: "通話は自動的に軽い画質・音質（低ビットレート）に設定してあるので、通信量を抑えられます。それでも重い場合はWi-Fiに切り替えるか、他のアプリや動画を閉じてからお試しください。ビデオ通話より音声通話のほうが軽くて安定します。",
  },
  {
    q: "名前（表示名）は変えられる？",
    a: "はい。「プロフィール」タブの名前の部分を編集して保存すると、友だちの画面にも新しい名前で表示されます。フレンドIDは変更できません。",
  },
  {
    q: "PCでも使える？",
    a: "はい。Chrome・Edge・Safariなどの最新ブラウザがあれば、パソコンでも同じアカウントで使えます。同じIDとパスワードでログインすれば、トークの履歴も表示されます。",
  },
  {
    q: "複数の端末で同時に使える？",
    a: "使えます。スマホとパソコンなど、別々の端末でログインして利用できます。通知の許可は端末ごとに設定が必要です。",
  },
  {
    q: "ログインのパスワードを忘れた",
    a: "ログイン画面の「パスワードをお忘れですか？」から、登録したメールアドレスに再設定用のメールを送れます。メールが届かない場合は迷惑メールフォルダを確認してください。",
  },
  {
    q: "アカウントをやめたい（退会したい）",
    a: "プロフィール画面下部の「アカウント」から退会できます。退会するとプロフィールやトークのデータは削除され、元には戻せません。フレンドに通知はされませんが、あなたの名前が一覧から消えます。",
  },
  {
    q: "通知を止めたい／オフにしたい",
    a: "ブラウザやスマホ本体の「通知」設定から、このアプリの通知をオフにできます。アプリの中では着信音だけを止めることもできるので、夜間などはミュートにして使えます。",
  },
];

function QaPage() {
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
        <h1 className="text-lg font-bold tracking-tight">Q&A（よくある質問）</h1>
      </header>

      <main className="flex-1 px-4 pb-16 pt-5">
        <div className="mb-5 flex items-center gap-3 rounded-2xl bg-muted/60 p-4">
          <CircleHelp className="size-8 shrink-0 text-primary" />
          <p className="text-sm leading-relaxed text-muted-foreground">
            使い方でわからないことがあれば、下の質問をタップして答えを開いてください。
          </p>
        </div>

        <Accordion type="single" collapsible className="space-y-2">
          {QA.map((item, i) => (
            <AccordionItem
              key={i}
              value={`qa-${i}`}
              className="rounded-2xl border border-border bg-card px-4 shadow-soft last:border-b"
            >
              <AccordionTrigger className="py-4 text-left text-sm font-bold hover:no-underline">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="pb-4 text-sm leading-relaxed text-muted-foreground">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </main>
    </div>
  );
}
