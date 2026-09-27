import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Send, CheckCircle2, AlertCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const FORMSPREE_ENDPOINT = "https://formspree.io/f/mzezjqbo";

export const Route = createFileRoute("/contact")({
  component: ContactPage,
  head: () => ({
    meta: [
      { title: "お問い合わせ - RINE" },
      { name: "description", content: "RINEへのお問い合わせ・ご意見・ご要望・違反通報の受付窓口です。" },
      { property: "og:title", content: "お問い合わせ - RINE" },
      { property: "og:description", content: "RINEへのお問い合わせ・ご要望・違反通報窓口です。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ContactPage() {
  const [name, setName] = useState("");
  const [friendId, setFriendId] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState("ご質問・ご要望");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !message.trim()) {
      alert("メールアドレスとお問い合わせ内容は必須項目です。");
      return;
    }

    setStatus("submitting");
    setErrorMessage("");

    try {
      const response = await fetch(FORMSPREE_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          name: name || "（未記入）",
          friendId: friendId || "（未記入）",
          email,
          category,
          message,
        }),
      });

      if (response.ok) {
        setStatus("success");
      } else {
        const data = await response.json().catch(() => null);
        setStatus("error");
        setErrorMessage(data?.error || "送信に失敗しました。時間をおいて再度お試しください。");
      }
    } catch {
      setStatus("error");
      setErrorMessage("通信エラーが発生しました。インターネット接続をご確認ください。");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <Link
            to="/auth"
            className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="flex items-center gap-2 font-bold">
            <Mail className="size-5 text-primary" />
            <span>お問い合わせ</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          {status === "success" ? (
            <div className="py-8 text-center space-y-3">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                <CheckCircle2 className="size-8" />
              </div>
              <h2 className="text-lg font-bold">お問い合わせを送信しました</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                メッセージを受け付けました。ご入力いただいたメールアドレス宛てに必要に応じて折り返しご連絡いたします。
              </p>
              <div className="pt-4">
                <Link to="/auth">
                  <Button variant="outline">トップへ戻る</Button>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                  RINEに関するご意見、ご要望、不具合の報告、利用規約違反の通報などは以下のフォームよりお寄せください。
                </p>
              </div>

              {status === "error" && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  お名前・ニックネーム <span className="text-[10px] text-muted-foreground/70">（任意）</span>
                </label>
                <Input
                  name="name"
                  type="text"
                  placeholder="例: たなか"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  RINEユーザーID・フレンドID <span className="text-[10px] text-muted-foreground/70">（任意）</span>
                </label>
                <Input
                  name="friendId"
                  type="text"
                  placeholder="アカウント特定が必要な場合に入力"
                  value={friendId}
                  onChange={(e) => setFriendId(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  返信用メールアドレス <span className="text-rose-500 font-bold">*必須</span>
                </label>
                <Input
                  name="email"
                  type="email"
                  required
                  placeholder="example@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  お問い合わせ種別 <span className="text-rose-500 font-bold">*必須</span>
                </label>
                <select
                  name="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="ご質問・ご要望">ご質問・ご要望</option>
                  <option value="不具合・バグ報告">不具合・バグの報告</option>
                  <option value="利用規約違反・迷惑行為の通報">利用規約違反・迷惑行為の通報</option>
                  <option value="その他">その他</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  お問い合わせ内容 <span className="text-rose-500 font-bold">*必須</span>
                </label>
                <Textarea
                  name="message"
                  required
                  rows={5}
                  placeholder="詳しい状況やご要望をご記入ください。"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>

              <Button
                type="submit"
                disabled={status === "submitting"}
                className="w-full gap-2 font-bold"
              >
                <Send className="size-4" />
                {status === "submitting" ? "送信中..." : "送信する"}
              </Button>
            </form>
          )}
        </div>

        <div className="mt-8 text-center text-xs text-muted-foreground">
          <p>© 2026 RINE. All rights reserved.</p>
        </div>
      </main>
    </div>
  );
}
