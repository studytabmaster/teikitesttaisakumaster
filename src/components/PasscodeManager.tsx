import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";
import {
  adminCreatePasscode,
  adminListPasscodes,
  adminRevokePasscode,
  type RolePasscode,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const roleLabel = (r: string) => (r === "admin" ? "管理者" : r === "moderator" ? "モデレーター" : r);

function statusOf(p: RolePasscode) {
  if (p.revoked) return "取り消し済み";
  if (p.used_count >= p.max_uses) return "使用済み";
  if (p.expires_at && new Date(p.expires_at).getTime() < Date.now()) return "期限切れ";
  return "有効";
}

// 管理者が役職別のパスワードを個別に発行・一覧・取り消しする
export function PasscodeManager() {
  const create = useServerFn(adminCreatePasscode);
  const list = useServerFn(adminListPasscodes);
  const revoke = useServerFn(adminRevokePasscode);

  const [role, setRole] = useState<"moderator" | "admin">("moderator");
  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<string | null>(null);
  const [items, setItems] = useState<RolePasscode[]>([]);

  const load = useCallback(async () => {
    try {
      setItems(await list());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "読み込めませんでした");
    }
  }, [list]);

  useEffect(() => {
    void load();
  }, [load]);

  const issue = async () => {
    setBusy(true);
    try {
      const { code } = await create({ data: { role, label, maxUses, days } });
      setIssued(code);
      setLabel("");
      toast.success(`${roleLabel(role)}用パスワードを発行しました`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "発行できませんでした");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    if (!confirm("このパスワードを取り消しますか？")) return;
    try {
      await revoke({ data: { id } });
      toast.success("取り消しました");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "取り消せませんでした");
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2">
          <KeyRound className="size-5 text-primary" />
          <h3 className="text-sm font-semibold">役職パスワードを発行</h3>
        </div>
        <div className="flex gap-2">
          {(["moderator", "admin"] as const).map((r) => (
            <Button
              key={r}
              size="sm"
              variant={role === r ? "default" : "outline"}
              className="flex-1"
              onClick={() => setRole(r)}
            >
              {roleLabel(r)}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="pc-label">メモ（誰に渡すか）</Label>
            <Input id="pc-label" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="例: たろうさん" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pc-uses">使える回数</Label>
            <Input id="pc-uses" type="number" min={1} max={100} value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value) || 1)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pc-days">有効日数（0で無期限）</Label>
            <Input id="pc-days" type="number" min={0} max={365} value={days} onChange={(e) => setDays(Number(e.target.value) || 0)} />
          </div>
        </div>
        <Button className="w-full" onClick={() => void issue()} disabled={busy}>
          {busy ? "発行中…" : `${roleLabel(role)}用パスワードを発行`}
        </Button>
        {issued && (
          <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
            <p className="text-xs text-muted-foreground">
              このパスワードは今だけ表示されます。相手に伝えて、管理者パネルの入力欄に入れてもらってください。
            </p>
            <div className="flex items-center justify-between gap-2">
              <span className="break-all font-mono text-base font-bold">{issued}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(issued);
                  toast.success("コピーしました");
                }}
              >
                <Copy className="mr-1 size-4" />
                コピー
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">発行済みパスワード</h3>
        {items.length === 0 && <p className="text-xs text-muted-foreground">まだありません</p>}
        {items.map((p) => {
          const st = statusOf(p);
          return (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl border bg-card p-3 text-xs">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline">{roleLabel(p.role)}</Badge>
                  <Badge variant={st === "有効" ? "default" : "secondary"}>{st}</Badge>
                  <span className="truncate font-semibold">{p.label || "（メモなし）"}</span>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  使用 {p.used_count}/{p.max_uses} ・ 期限{" "}
                  {p.expires_at ? new Date(p.expires_at).toLocaleDateString("ja-JP") : "なし"}
                </p>
              </div>
              {st === "有効" && (
                <Button size="sm" variant="ghost" className="h-7 text-[11px] text-destructive" onClick={() => void cancel(p.id)}>
                  取り消し
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
