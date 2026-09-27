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

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "RINE にログイン｜名前とパスワードだけで始められるトーク・通話アプリ" },
      {
        name: "description",
        content:
          "RINE は名前とパスワードだけで登録できるトーク・通話アプリ。メールアドレスは不要、30秒で友だちとのトークと無料通話を始められます。",
      },
      { property: "og:title", content: "RINE にログイン｜名前とパスワードだけ" },
      {
        property: "og:description",
        content: "メールアドレス不要。名前とパスワードだけでトークと無料通話を始めよう。",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) void navigate({ to: "/" });
  }, [session, navigate]);

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
    <div className="flex min-h-screen flex-col items-center justify-center bg-brand-gradient px-6 py-12">
      <div className="w-full max-w-sm rounded-3xl bg-card p-7 shadow-soft">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-3xl bg-brand-gradient text-3xl font-black text-primary-foreground">
            R
          </div>
          <h1 className="text-3xl font-black tracking-tight">RINE</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            メールアドレス不要。名前とパスワードだけで始められます。
          </p>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
          {(["signup", "login"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded-full py-2 text-sm font-bold transition-colors",
                mode === m
                  ? "bg-card text-foreground shadow-soft"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "signup" ? "はじめて（新規登録）" : "ログイン"}
            </button>
          ))}
        </div>

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
              2〜20文字。この名前でログインします（空白・記号は使えません）。
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
          <Button type="submit" variant="brand" size="pill" className="w-full text-base" disabled={busy}>
            {busy ? "しばらくお待ちください…" : mode === "login" ? "ログイン" : "新規登録してはじめる"}
          </Button>
        </form>

        {mode === "signup" && (
          <ol className="mt-5 space-y-1.5 rounded-2xl bg-muted/60 p-4 text-xs text-muted-foreground">
            <li>1. 名前とパスワードを入れて「新規登録」</li>
            <li>2. あなた専用の8文字のIDが自動で発行されます</li>
            <li>3. 友だちにIDを伝えて追加し合えばトーク・通話ができます</li>
          </ol>
        )}

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          または
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button variant="outline" size="pill" className="w-full" onClick={google}>
          Google でログイン
        </Button>

        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="mt-6 w-full text-center text-sm text-muted-foreground hover:text-foreground"
        >
          {mode === "login"
            ? "アカウントをお持ちでない方 → 新規登録"
            : "すでにアカウントをお持ちの方 → ログイン"}
        </button>

               <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <Link to="/about" className="underline underline-offset-2 hover:text-foreground">
            RINEについて
          </Link>
          <Link to="/terms" className="underline underline-offset-2 hover:text-foreground">
            利用規約
          </Link>
          <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">
            プライバシーポリシー
          </Link>
        </div>
      </div>
    </div>
  );
}
