import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Copy, ImagePlus, LogOut, ShieldAlert } from "lucide-react";
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
import { makeAvatarDataUrl } from "@/lib/compress";

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
      toast.error("画像は10MBまでです");
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await makeAvatarDataUrl(file);
      setAvatarUrl(dataUrl);
      toast.success("アイコンを読み込みました。保存してください");
    } catch {
      toast.error("この画像は読み込めませんでした");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    void supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .then(({ data }) =>
        setIsStaff((data ?? []).some((r) => r.role === "admin" || r.role === "moderator")),
      );
  }, [user]);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name);
    setStatusMessage(profile.status_message);
    setAvatarUrl(profile.avatar_url ?? "");
  }, [profile]);

  const save = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim() || "ユーザー",
        status_message: statusMessage,
        avatar_url: avatarUrl.trim() || null,
      })
      .eq("id", user.id);
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
              accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/bmp,image/heic,image/*"
              hidden
              onChange={pickAvatar}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
              >
                <ImagePlus className="mr-1 size-4" />
                ファイルから選ぶ
              </Button>
              {avatarUrl && (
                <Button variant="ghost" onClick={() => setAvatarUrl("")} disabled={busy}>
                  削除
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              PNG / JPG / JPEG / GIF / WEBP に対応。正方形に切り抜いて自動で軽くします。
            </p>
            <Input
              id="avatar"
              value={avatarUrl.startsWith("data:") ? "" : avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="画像のURLを直接入力もできます"
            />
          </div>
          <Button variant="brand" size="pill" className="w-full" onClick={save} disabled={busy}>
            保存する
          </Button>
        </div>

        {isStaff && (
          <Button asChild variant="outline" className="w-full">
            <Link to="/admin">
              <ShieldAlert className="mr-1 size-4" />
              管理者パネル
            </Link>
          </Button>
        )}

        <Button variant="ghost" className="w-full text-destructive" onClick={() => void signOut()}>
          <LogOut className="mr-1 size-4" />
          ログアウト
        </Button>
      </div>
    </AppShell>
  );
}
