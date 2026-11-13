import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, CircleHelp, Copy, ImagePlus, LogOut, Palette, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { initials } from "@/lib/rine";
import { makeAvatarDataUrl, withTimeout } from "@/lib/compress";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { maskProfanity } from "@/lib/profanity";
import { checkProfileAvatarSafety } from "./moderation.functions";
import { useRineTheme, type RineTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "マイプロフィール｜RINE" },
      {
        name: "description",
        content:
          "RINE のプロフィール設定。表示名・ひとこと・アイコンを編集し、自分のフレンドIDを友だちに共有できます。",
      },
      { property: "og:title", content: "マイプロフィール｜RINE" },
      { property: "og:description", content: "表示名やひとこと、アイコンを編集しよう。" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { profile, refreshProfile, signOut, user } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  const [theme, setTheme] = useRineTheme();
  const fileRef = useRef<HTMLInputElement>(null);

  const pickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("画像ファイルを選んでください");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("画像は 10MB 以内にしてください");
      return;
    }

    setBusy(true);
    const toastId = toast.loading("アイコンを準備中…");

    try {
      const dataUrl = await makeAvatarDataUrl(file);

      toast.loading("安全性を確認中…", { id: toastId });
      const safety = await checkProfileAvatarSafety({ dataUrl });
      if (!safety.safe) {
        toast.error(safety.reason ?? "不適切な可能性があるため設定できません", { id: toastId });
        setBusy(false);
        return;
      }

      toast.loading("アップロード中…", { id: toastId });
      const publicUrl = await withTimeout(
        uploadToCloudinary(dataUrl, "avatar"),
        8000,
      ).catch(() => null);

      if (!publicUrl) {
        toast.error("画像の保存に失敗しました。もう一度お試しください", { id: toastId });
        setBusy(false);
        return;
      }

      setAvatarUrl(publicUrl);
      toast.success("アイコンを設定しました。「変更を保存」を押してください", { id: toastId });
    } catch {
      toast.error("画像の処理に失敗しました", { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name);
    setStatusMessage(profile.status_message ?? "");
    setAvatarUrl(profile.avatar_url ?? "");
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setIsStaff(!!data?.role);
      });
  }, [user]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const { error } = await withTimeout(
      Promise.resolve(supabase
        .from("profiles")
        .update({
          display_name: maskProfanity(displayName.trim()) || "ユーザー",
          status_message: maskProfanity(statusMessage),
          avatar_url: avatarUrl.trim() || null,
        })
        .eq("id", user.id)),
      8000,
    ).catch(() => ({ error: new Error("timeout") }));
    setBusy(false);
    if (error) {
      toast.error("保存できませんでした");
      return;
    }
    await refreshProfile();
    toast.success("プロフィールを保存しました");
  };

  const copyCode = async () => {
    if (!profile) return;
    await navigator.clipboard.writeText(profile.friend_code);
    toast.success("フレンドIDをコピーしました");
  };

  const handleThemeChange = (next: RineTheme) => {
    setTheme(next);
    toast.success(next === "line" ? "LINE風スタイルに切り替えました" : "クラシックスタイルに切り替えました");
  };

  return (
    <AppShell title="プロフィール">
      <div className="bg-brand-gradient px-6 pb-10 pt-8 text-center text-primary-foreground">
        <Avatar className="mx-auto size-24 border-4 border-white/30">
          <AvatarImage src={avatarUrl || undefined} alt={displayName} />
          <AvatarFallback className="bg-white/20 text-2xl text-primary-foreground">
            {initials(displayName || "R")}
          </AvatarFallback>
        </Avatar>
        <p className="mt-4 text-xl font-bold">{displayName || "ユーザー"}</p>
        <p className="text-sm opacity-80">{statusMessage || "ひとことを設定しましょう"}</p>
      </div>

      <div className="space-y-6 px-6 py-6">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <p className="text-xs text-muted-foreground">あなたのフレンドID</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="font-mono text-2xl font-bold tracking-[0.25em]">
              {profile?.friend_code ?? "········"}
            </span>
            <Button variant="outline" size="sm" onClick={copyCode}>
              <Copy className="mr-1 size-4" />
              コピー
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            このIDを友だちに伝えると、追加してもらえます。IDは登録時に自動で割り当てられ、変更できません。
          </p>
        </div>

        {/* デザインテーマ設定 */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <div className="flex items-center gap-2">
            <Palette className="size-4 text-primary" />
            <h2 className="text-sm font-bold">デザインテーマ設定</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            お好みのスタイルを選べます。いつでも元のデザインに戻せます。
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => handleThemeChange("line")}
              className={cn(
                "relative flex flex-col items-center justify-between rounded-xl border p-3 text-center transition-all",
                theme === "line"
                  ? "border-[#06C755] bg-[#06C755]/10 ring-2 ring-[#06C755]/30"
                  : "border-border bg-background hover:bg-muted/50",
              )}
            >
              {theme === "line" && (
                <span className="absolute right-2 top-2 rounded-full bg-[#06C755] p-0.5 text-white">
                  <Check className="size-3" />
                </span>
              )}
              <div className="my-1 flex h-10 w-full items-center justify-center rounded-lg bg-[#849ebf]/80 p-1.5 shadow-inner">
                <span className="rounded-md bg-[#85e24a] px-2 py-0.5 text-[10px] font-bold text-black shadow-sm">
                  LINE風
                </span>
              </div>
              <div>
                <p className="text-xs font-bold text-foreground">LINE風</p>
                <p className="text-[10px] text-muted-foreground">水色背景・緑吹き出し</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleThemeChange("classic")}
              className={cn(
                "relative flex flex-col items-center justify-between rounded-xl border p-3 text-center transition-all",
                theme === "classic"
                  ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                  : "border-border bg-background hover:bg-muted/50",
              )}
            >
              {theme === "classic" && (
                <span className="absolute right-2 top-2 rounded-full bg-primary p-0.5 text-primary-foreground">
                  <Check className="size-3" />
                </span>
              )}
              <div className="my-1 flex h-10 w-full items-center justify-center rounded-lg border border-border bg-muted/60 p-1.5 shadow-inner">
                <span className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground shadow-sm">
                  従来
                </span>
              </div>
              <div>
                <p className="text-xs font-bold text-foreground">クラシック</p>
                <p className="text-[10px] text-muted-foreground">従来のRINEデザイン</p>
              </div>
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="display-name">表示名</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={30}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="status">ひとこと</Label>
            <Textarea
              id="status"
              value={statusMessage}
              onChange={(e) => setStatusMessage(e.target.value)}
              maxLength={100}
              rows={2}
              placeholder="今日もいい日"
            />
          </div>
          <div className="space-y-1.5">
            <Label>アイコン画像</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/bmp,image/heic,image/heif,image/avif,image/svg+xml,image/tiff,image/x-icon,image/vnd.microsoft.icon,image/*"
              className="hidden"
              onChange={pickAvatar}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus className="mr-2 size-4" />
              端末から画像を選ぶ
            </Button>
            <p className="text-[11px] text-muted-foreground">
              ※ アイコンは自動で高画質・超軽量に圧縮され、瞬時に読み込まれます
            </p>
          </div>
        </div>

        <Button
          type="button"
          onClick={save}
          disabled={busy || !displayName.trim()}
          className="w-full bg-brand-gradient text-primary-foreground"
        >
          {busy ? "保存中…" : "変更を保存"}
        </Button>

        {isStaff && (
          <div className="pt-2">
            <Button asChild variant="outline" className="w-full border-primary/30 text-primary">
              <Link to="/admin">
                <ShieldAlert className="mr-2 size-4" />
                管理・モデレーターパネルを開く
              </Link>
            </Button>
          </div>
        )}

        <div className="space-y-2 border-t border-border pt-4">
          <Button asChild variant="ghost" className="w-full justify-start text-muted-foreground">
            <Link to="/guide">
              <CircleHelp className="mr-2 size-4" />
              使いかたガイド
            </Link>
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full border-destructive/30 text-destructive hover:bg-destructive/10"
            onClick={() => void signOut()}
          >
            <LogOut className="mr-2 size-4" />
            ログアウト
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
