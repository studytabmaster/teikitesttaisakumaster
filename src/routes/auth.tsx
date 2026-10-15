import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidUsername, normalizeUsername, usernameToEmail } from "@/lib/username";
import { cn } from "@/lib/utils";
import { Tv, Smartphone, RefreshCw, KeyRound, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "RINE にログイン｜名前とパスワードだけで始められるトーク・通話アプリ" },
      {
        name: "description",
        content:
          "RINE は名前とパスワードだけで登録できるトーク・通話アプリ。テレビ認証ログイン対応。",
      },
      { property: "og:title", content: "RINE にログイン｜名前とパスワードだけ" },
      {
        property: "og:description",
        content: "メールアドレス不要。名前とパスワード、またはテレビ認証でログイン。",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup" | "tv">("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // テレビ認証用ステート
  const [tvRole, setTvRole] = useState<"display" | "approve">("display");
  const [tvCode, setTvCode] = useState<string>("");
  const [inputTvCode, setInputTvCode] = useState<string>("");
  const [tvCountdown, setTvCountdown] = useState<number>(300); // 5分

  useEffect(() => {
    if (session && mode !== "tv") {
      void navigate({ to: "/" });
    }
  }, [session, mode, navigate]);

  // 新規テレビコードを発行
  const generateNewTvCode = () => {
    const n = Math.floor(100000 + Math.random() * 900000);
    const code = `${String(n).slice(0, 3)}-${String(n).slice(3)}`;
    setTvCode(code);
    setTvCountdown(300);
  };

  // テレビ表示モード（コードを待機する側）
  useEffect(() => {
    if (mode !== "tv" || tvRole !== "display") return;
    if (!tvCode) {
      generateNewTvCode();
      return;
    }

    const timer = setInterval(() => {
      setTvCountdown((prev) => {
        if (prev <= 1) {
          generateNewTvCode();
          return 300;
        }
        return prev - 1;
      });
    }, 1000);

    const cleanCode = tvCode.replace("-", "");
    const channel = supabase.channel(`tv-pair:${cleanCode}`);

    channel
      .on("broadcast", { event: "authorized" }, async (payload: any) => {
        const { access_token, refresh_token } = payload.payload || {};
        if (access_token && refresh_token) {
          toast.success("テレビ認証に成功しました！ログインしています…");
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (!error) {
            void navigate({ to: "/" });
          } else {
            toast.error("セッションの復帰に失敗しました: " + error.message);
          }
        }
      })
      .subscribe();

    return () => {
      clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [mode, tvRole, tvCode, navigate]);

  // スマホからテレビ認証を承認する
  const handleApproveTv = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = inputTvCode.replace(/[^0-9]/g, "");
    if (clean.length !== 6) {
      toast.error("6桁のテレビコードを入力してください");
      return;
    }

    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      toast.error("まずスマホ側でRINEにログインしている必要があります");
      return;
    }

    setBusy(true);
    try {
      const channel = supabase.channel(`tv-pair:${clean}`);
      await channel.subscribe();
      await channel.send({
        type: "broadcast",
        event: "authorized",
        payload: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        },
      });
      toast.success("テレビ画面のログインを承認しました！");
      setInputTvCode("");
    } catch (err: any) {
      toast.error("テレビの承認に失敗しました: " + (err.message || ""));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidUsername(name)) {
      toast.error("名前は2〜20文字で、記号や空白は使えません");
      return;
    }
    setBusy(true);
    try {
      const email = usernameToEmail(name);
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: name.trim(), username: normalizeUsername(name) },
          },
        });
        if (error) {
          if (/already|registered|duplicate|unique/i.test(error.message)) {
            throw new Error("この名前はすでに使われています。別の名前にしてください");
          }
          throw error;
        }
        toast.success("登録できました。ようこそ RINE へ！");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          throw new Error("名前かパスワードが違います");
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "うまくいきませんでした");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google ログインに失敗しました");
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-brand-gradient px-4 py-8 sm:px-6 sm:py-12">
      <div className="w-full max-w-sm rounded-3xl bg-card p-6 sm:p-7 shadow-soft">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-brand-gradient text-2xl font-black text-primary-foreground shadow-sm">
            R
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">RINE</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            メールアドレス不要。名前とパスワード、またはテレビ認証でログイン。
          </p>
        </div>

        {/* タブ切り替え（新規・ログイン・テレビ認証） */}
        <div className="mb-5 grid grid-cols-3 gap-1 rounded-full bg-muted p-1">
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={cn(
              "rounded-full py-1.5 text-xs font-bold transition-colors",
              mode === "signup"
                ? "bg-card text-foreground shadow-soft"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            新規登録
          </button>
          <button
            type="button"
            onClick={() => setMode("login")}
            className={cn(
              "rounded-full py-1.5 text-xs font-bold transition-colors",
              mode === "login"
                ? "bg-card text-foreground shadow-soft"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            ログイン
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("tv");
              if (!tvCode) generateNewTvCode();
            }}
            className={cn(
              "flex items-center justify-center gap-1 rounded-full py-1.5 text-xs font-bold transition-colors",
              mode === "tv"
                ? "bg-primary text-primary-foreground shadow-soft"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Tv className="size-3.5" />
            テレビ認証
          </button>
        </div>

        {/* 通常ログイン / 新規登録フォーム */}
        {mode !== "tv" ? (
          <>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">名前</Label>
                <Input
                  id="name"
                  required
                  autoComplete="username"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="たろう"
                />
                <p className="text-[11px] text-muted-foreground">
                  2〜20文字。空白・記号は使えません。
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">パスワード</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="6文字以上"
                />
              </div>
              <Button
                type="submit"
                variant="brand"
                size="pill"
                className="w-full text-sm font-bold"
                disabled={busy}
              >
                {busy
                  ? "しばらくお待ちください…"
                  : mode === "login"
                    ? "ログイン"
                    : "新規登録してはじめる"}
              </Button>
            </form>

            <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              または
              <span className="h-px flex-1 bg-border" />
            </div>

            <Button
              variant="outline"
              size="pill"
              className="w-full text-xs"
              onClick={google}
            >
              Google でログイン
            </Button>
          </>
        ) : (
          /* テレビ認証画面 */
          <div className="space-y-4">
            <div className="flex rounded-xl bg-muted/60 p-1 text-xs">
              <button
                type="button"
                onClick={() => setTvRole("display")}
                className={cn(
                  "flex-1 rounded-lg py-1.5 font-semibold transition-all",
                  tvRole === "display" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                )}
              >
                📺 この端末でログイン
              </button>
              <button
                type="button"
                onClick={() => setTvRole("approve")}
                className={cn(
                  "flex-1 rounded-lg py-1.5 font-semibold transition-all",
                  tvRole === "approve" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                )}
              >
                📱 スマホから許可
              </button>
            </div>

            {tvRole === "display" ? (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-center space-y-3">
                <p className="text-xs text-muted-foreground">
                  スマートフォン等の別端末でこのコードを入力すると、自動でログイン完了します。
                </p>
                <div className="my-2 rounded-xl bg-card py-3 font-mono text-3xl font-black tracking-widest text-primary border shadow-sm">
                  {tvCode || "--- ---"}
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
                  <span>有効期限: {Math.floor(tvCountdown / 60)}:{(tvCountdown % 60).toString().padStart(2, "0")}</span>
                  <button
                    type="button"
                    onClick={generateNewTvCode}
                    className="flex items-center gap-1 hover:text-foreground"
                  >
                    <RefreshCw className="size-3" />
                    更新
                  </button>
                </div>
                <div className="border-t border-border/50 pt-2 text-[10px] text-muted-foreground leading-relaxed">
                  ※ 待機中は画面を閉じずにお待ちください。承認されると自動的にホームへ切り替わります。
                </div>
              </div>
            ) : (
              <form onSubmit={handleApproveTv} className="space-y-3 rounded-2xl border bg-muted/30 p-4">
                <div className="space-y-1.5">
                  <Label htmlFor="tvInputCode" className="text-xs">テレビ等に表示された6桁コード</Label>
                  <Input
                    id="tvInputCode"
                    value={inputTvCode}
                    onChange={(e) => setInputTvCode(e.target.value)}
                    placeholder="例: 123456 または 123-456"
                    maxLength={7}
                    className="text-center font-mono text-lg font-bold tracking-wider"
                  />
                </div>
                <Button
                  type="submit"
                  variant="brand"
                  size="sm"
                  className="w-full gap-1.5 text-xs font-bold"
                  disabled={busy || !inputTvCode.trim()}
                >
                  <CheckCircle2 className="size-4" />
                  {busy ? "送信中…" : "この端末のログインを許可する"}
                </Button>
                <p className="text-[10px] text-muted-foreground text-center">
                  現在ログイン中のアカウント権限がテレビ・共有PC側に付与されます。
                </p>
              </form>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <Link to="/about" className="underline underline-offset-2 hover:text-foreground">
            RINEについて
          </Link>
          <Link to="/terms" className="underline underline-offset-2 hover:text-foreground">
            利用規約
          </Link>
          <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">
            プライバシーポリシー
          </Link>
          <Link to="/contact" className="underline underline-offset-2 hover:text-foreground">
            お問い合わせ
          </Link>
        </div>
      </div>
    </div>
  );
}
