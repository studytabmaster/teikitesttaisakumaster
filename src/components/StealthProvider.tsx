import { useEffect, useState, useRef, type ReactNode } from "react";
import { Shield, ShieldAlert, EyeOff, Globe, Zap, Settings, Lock } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  getStealthSettings,
  saveStealthSettings,
  applyStealthToBrowser,
  triggerEmergencyEscape,
  type StealthSettings,
} from "@/lib/stealth";

export function StealthProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<StealthSettings>(getStealthSettings);
  const [modalOpen, setModalOpen] = useState(false);
  const [isWindowBlurred, setIsWindowBlurred] = useState(false);
  const lastEscTimeRef = useRef<number>(0);

  // 初回マウント時に設定適用
  useEffect(() => {
    applyStealthToBrowser(settings);
  }, []);

  // 緊急脱出キーの監視
  useEffect(() => {
    if (!settings.escapeKeyEnabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // 入力中のEscも確実に検知
      if (settings.escapeKeyType === "Escape") {
        if (e.key === "Escape") {
          e.preventDefault();
          triggerEmergencyEscape(settings.escapeUrl);
        }
      } else if (settings.escapeKeyType === "ShiftEscape") {
        if (e.key === "Escape" && e.shiftKey) {
          e.preventDefault();
          triggerEmergencyEscape(settings.escapeUrl);
        }
      } else if (settings.escapeKeyType === "EscapeDouble") {
        if (e.key === "Escape") {
          const now = Date.now();
          if (now - lastEscTimeRef.current < 500) {
            e.preventDefault();
            triggerEmergencyEscape(settings.escapeUrl);
          }
          lastEscTimeRef.current = now;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [settings.escapeKeyEnabled, settings.escapeKeyType, settings.escapeUrl]);

  // ウィンドウ離脱時（別タブ・別アプリ）の自動ぼかし
  useEffect(() => {
    if (!settings.blurOnWindowLeave) {
      setIsWindowBlurred(false);
      return;
    }

    const handleBlur = () => setIsWindowBlurred(true);
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        setIsWindowBlurred(true);
      }
    };

    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [settings.blurOnWindowLeave]);

  const updateSetting = <K extends keyof StealthSettings>(key: K, value: StealthSettings[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveStealthSettings(next);
  };

  return (
    <>
      {/* メッセージホバーぼかしモード時のCSS注入 */}
      {settings.hoverBlurMessages && (
        <style>{`
          /* メッセージ本文やメディアを通常時はぼかし、ホバー時だけクリアにする */
          .bubble-in p, .bubble-out p, .bubble-in img, .bubble-out img, .bubble-in video, .bubble-out video {
            filter: blur(5px);
            transition: filter 0.15s ease;
          }
          .bubble-in:hover p, .bubble-out:hover p, .bubble-in:hover img, .bubble-out:hover img, .bubble-in:hover video, .bubble-out:hover video {
            filter: blur(0);
          }
        `}</style>
      )}

      {children}

      {/* ウィンドウ離脱時の全画面ぼかしカバー */}
      {isWindowBlurred && (
        <div
          onClick={() => setIsWindowBlurred(false)}
          className="fixed inset-0 z-[9999] flex cursor-pointer flex-col items-center justify-center bg-background/80 p-6 text-center backdrop-blur-2xl transition-all"
        >
          <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
            <Lock className="size-8" />
          </div>
          <h2 className="text-lg font-bold">画面が保護されています</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            ウィンドウが離脱したため、のぞき見防止フィルターが作動しました
          </p>
          <Button size="sm" className="mt-5 rounded-full" onClick={() => setIsWindowBlurred(false)}>
            タップして画面を戻す
          </Button>
        </div>
      )}

      {/* 画面端のステルス設定ボタン（目立たない半透明） */}
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        aria-label="のぞき見防止設定"
        className="fixed bottom-20 right-3 z-40 flex size-8 items-center justify-center rounded-full bg-background/80 text-foreground/50 shadow-md backdrop-blur border border-border/60 hover:text-foreground hover:bg-background transition-opacity opacity-40 hover:opacity-100"
        title="のぞき見防止・パニック設定"
      >
        <Shield className="size-4" />
      </button>

      {/* 設定モーダル */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-h-[85vh] sm:max-w-md flex flex-col p-5 overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <ShieldAlert className="size-5 text-primary" />
              のぞき見防止・パニック設定
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              学校や職場など、周囲に人がいる場所で安全に使うための機能です。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2 text-xs">
            {/* 1. Googleタブ偽装 */}
            <div className="rounded-xl border border-border bg-card p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="size-4 text-primary" />
                  <Label htmlFor="fakeGoogle" className="font-semibold cursor-pointer">
                    Googleタブに偽装
                  </Label>
                </div>
                <Switch
                  id="fakeGoogle"
                  checked={settings.fakeGoogleTab}
                  onCheckedChange={(checked) => {
                    updateSetting("fakeGoogleTab", checked);
                    toast.success(checked ? "Googleタブに偽装しました" : "通常タブに戻しました");
                  }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                タブの文字を「Google」にし、アイコンをGoogle公式ロゴに偽装します。
              </p>
              {settings.fakeGoogleTab && (
                <div className="pt-1">
                  <Label className="text-[10px] text-muted-foreground">タブに表示するタイトル</Label>
                  <Input
                    value={settings.fakeTitle}
                    onChange={(e) => updateSetting("fakeTitle", e.target.value)}
                    placeholder="Google"
                    className="h-8 text-xs mt-1"
                  />
                </div>
              )}
            </div>

            {/* 2. 緊急脱出キー */}
            <div className="rounded-xl border border-border bg-card p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="size-4 text-amber-500" />
                  <Label htmlFor="escapeKey" className="font-semibold cursor-pointer">
                    緊急脱出キー（ボスキー）
                  </Label>
                </div>
                <Switch
                  id="escapeKey"
                  checked={settings.escapeKeyEnabled}
                  onCheckedChange={(checked) => updateSetting("escapeKeyEnabled", checked)}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                キーを押した瞬間、履歴を残さずに指定したURLへ即座に画面を切り替えます。
              </p>

              {settings.escapeKeyEnabled && (
                <div className="space-y-2 pt-1 border-t border-border/50">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">発動キー</Label>
                    <select
                      value={settings.escapeKeyType}
                      onChange={(e) =>
                        updateSetting("escapeKeyType", e.target.value as StealthSettings["escapeKeyType"])
                      }
                      className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs"
                    >
                      <option value="Escape">Escキー 1回押し（最速）</option>
                      <option value="EscapeDouble">Escキー 2回連打（誤爆防止）</option>
                      <option value="ShiftEscape">Shift + Escキー</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">脱出先URL</Label>
                    <Input
                      value={settings.escapeUrl}
                      onChange={(e) => updateSetting("escapeUrl", e.target.value)}
                      placeholder="https://www.google.com"
                      className="h-8 text-xs mt-1"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 3. のぞき見防止フィルター */}
            <div className="rounded-xl border border-border bg-card p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <EyeOff className="size-4 text-primary" />
                  <Label htmlFor="blurLeave" className="font-semibold cursor-pointer">
                    ウィンドウ離脱時の自動ぼかし
                  </Label>
                </div>
                <Switch
                  id="blurLeave"
                  checked={settings.blurOnWindowLeave}
                  onCheckedChange={(checked) => updateSetting("blurOnWindowLeave", checked)}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                別アプリや別タブを開いた瞬間に、画面全体にすりガラスをかけてメッセージを隠します。
              </p>

              <div className="flex items-center justify-between border-t border-border/50 pt-2.5">
                <div>
                  <Label htmlFor="hoverBlur" className="font-semibold cursor-pointer">
                    常時モザイク（ホバー表示）
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    カーソルを乗せた部分だけメッセージを読めるようにします。
                  </p>
                </div>
                <Switch
                  id="hoverBlur"
                  checked={settings.hoverBlurMessages}
                  onCheckedChange={(checked) => updateSetting("hoverBlurMessages", checked)}
                />
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => triggerEmergencyEscape(settings.escapeUrl)}
            >
              今すぐ緊急脱出をテスト実行（{settings.escapeUrl}）
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
