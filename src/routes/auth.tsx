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
import { Tv, Smartphone, RefreshCw, KeyRound, CheckCircle2, Gift } from "lucide-react";

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
    if (!isValidUsername(name)) {
      toast.error("名前は2〜20文字で、記号や空白は使えません");
      return;
    }
    setBusy(true);
    try {
      const email = usernameToEmail(name);
      if (mode === "signup") {
        const { error, data: authData } = await supabase.auth.signUp({
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
