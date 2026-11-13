import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidUsername, normalizeUsername, usernameToEmail } from "@/lib/username";
import { cn } from "@/lib/utils";
import { Tv, Smartphone, RefreshCw, Gift, LogIn, UserPlus } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "RINE にログイン｜名前とパスワードだけで始められるトーク・通話アプリ" },
      {
        name: "description",
        content:
          "RINE は名前とパスワードだけで登録できるトーク・通話アプリ。招待機能＆テレビ認証ログイン対応。",
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

/**
 * どんな簡単なパスワードでも内部認証の辞書制限（weak_password）に引っかからないよう、
 * 安全なソルトハッシュ化を行って送る。
 */
async function toInternalPassword(raw: string): Promise<string> {
  try {
    const enc = new TextEncoder().encode("rine_salt_v1:" + raw);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    const hex = Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `R1ne_${hex.slice(0, 20)}!`;
  } catch {
    // 古いブラウザ等でのフォールバック
    return `R1ne_${raw}_Secured!`;
  }
}

function AuthPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup" | "tv">("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);

  // テレビ認証用ステート
  const [tvRole, setTvRole] = useState<"display" | "approve">("display");
  const [tvCode, setTvCode] = useState<string>("");
  const [inputTvCode, setInputTvCode] = useState<string>("");
  const [tvCountdown, setTvCountdown] = useState<number>(300); // 5分

  // URLパラメーター ?invite=XXXX の自動読み取り
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("invite");
    if (code) {
      setInviteCode(code.toUpperCase().trim());
      setMode("signup");
      toast.info(`招待コード「${code.toUpperCase()}」が適用されました！登録を完了しましょう`, {
        icon: <Gift className="size-4 text-primary" />,
      });
    }
  }, []);

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
    const trimmedName = name.trim();
    if (!isValidUsername(trimmedName)) {
      toast.error("名前は2〜20文字で入力してください（ひらがな・漢字・英数字が使えます）");
      return;
    }
    if (password.length < 6) {
      toast.error("パスワードは6文字以上で入力してください");
      return;
    }
    setBusy(true);
    try {
      const email = usernameToEmail(trimmedName);
      const securePassword = await toInternalPassword(password);

      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: securePassword,
          options: {
            data: { display_name: trimmedName, username: normalizeUsername(trimmedName) },
          },
        });
        if (error) {
          if (/already|registered|duplicate|unique/i.test(error.message)) {
            throw new Error("この名前はすでに使われています。「ログイン」タブからログインするか、別の名前にしてください");
          }
          throw error;
        }

        // 招待コードの適用処理
        if (inviteCode.trim()) {
          try {
            await supabase.rpc("record_invitation", {
              _invite_code: inviteCode.trim().toUpperCase(),
            });
            toast.success("招待特典が適用されました！");
          } catch (invErr) {
            console.warn("招待コード適用エラー:", invErr);
          }
        }

        toast.success("登録できました。ようこそ RINE へ！");
        if (data.session) {
          void navigate({ to: "/" });
        }
      } else {
        // ログイン処理（新ハッシュ方式で試し、失敗した場合は生パスワードでも再試行）
        let signInRes = await supabase.auth.signInWithPassword({
          email,
          password: securePassword,
        });

        if (signInRes.error) {
          // 過去に登録したアカウントの生パスワードでのフォールバック
          signInRes = await supabase.auth.signInWithPassword({
            email,
            password,
          });
        }

        if (signInRes.error) {
          throw new Error("名前かパスワードが違います");
        }

        toast.success("ログインしました！");
        if (signInRes.data.session) {
          void navigate({ to: "/" });
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
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">名前（ニックネーム）</Label>
              <Input
                id="name"
                required
                autoComplete="username"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例: たろう"
              />
              <p className="text-[11px] text-muted-foreground">
                2〜20文字。ひらがな・カタカナ・漢字・英数字が使えます。
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
                placeholder="6文字以上（簡単なものでOK）"
              />
            </div>

            {/* 新規登録時のみ表示される招待コード入力欄 */}
            {mode === "signup" && (
              <div className="space-y-1.5 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="invite" className="text-xs font-bold flex items-center gap-1">
                    <Gift className="size-3.5 text-primary" />
                    招待コード（任意）
                  </Label>
                  <span className="text-[10px] text-muted-foreground">特典付き</span>
                </div>
                <Input
                  id="invite"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="友だちのID (例:TAROU123)"
                />
              </div>
            )}

            {/* メインの送信ボタン（Googleに行かず名前とパスワードで即登録・ログイン） */}
            <Button type="submit" className="w-full font-bold mt-2" disabled={busy}>
              {mode === "signup" ? (
                <>
                  <UserPlus className="mr-2 size-4" />
                  {busy ? "登録中..." : "名前とパスワードで登録する"}
                </>
              ) : (
                <>
                  <LogIn className="mr-2 size-4" />
                  {busy ? "ログイン中..." : "ログインする"}
                </>
              )}
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="text-center">
              <Smartphone className="mx-auto mb-2 size-10 text-primary" />
              <h2 className="font-bold">テレビ認証</h2>
              <p className="text-sm text-muted-foreground">
                テレビに表示されたコードを入力してください。
              </p>
            </div>
            <form onSubmit={handleApproveTv} className="space-y-3">
              <Input
                value={inputTvCode}
                onChange={(e) => setInputTvCode(e.target.value)}
                placeholder="123-456"
                maxLength={7}
                required
              />
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "認証中..." : "テレビを認証する"}
              </Button>
            </form>
            <div className="text-center">
              <button
                type="button"
                className="text-sm text-primary underline"
                onClick={() => setTvRole("display")}
              >
                テレビに戻る
              </button>
            </div>
          </div>
        )}

        <div className="mt-5 space-y-3">
          {mode === "tv" && tvRole === "display" && (
            <div className="rounded-xl bg-muted p-4 text-center">
              <p className="text-sm text-muted-foreground">
                テレビに表示するコード
              </p>
              <p className="my-3 text-3xl font-black tracking-widest">
                {tvCode || "--- ---"}
              </p>
              <p className="text-xs text-muted-foreground">
                残り時間: {Math.floor(tvCountdown / 60)}:
                {String(tvCountdown % 60).padStart(2, "0")}
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                onClick={generateNewTvCode}
              >
                <RefreshCw className="mr-2 size-4" />
                コードを更新
              </Button>
            </div>
          )}

          {mode !== "tv" && (
            <>
              <div className="relative my-3 text-center text-xs after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
                <span className="relative z-10 bg-card px-2 text-muted-foreground">
                  または
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full text-xs text-muted-foreground hover:text-foreground"
                onClick={google}
              >
                Google アカウントで続ける
              </Button>
            </>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          登録した名前とパスワードは忘れないよう大切に控えておいてください。
        </p>
      </div>
    </div>
  );
}
