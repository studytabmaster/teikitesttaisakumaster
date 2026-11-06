import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  adminListReports,
  adminUpdateReport,
  adminSetMute,
  adminSetBan,
  adminDeleteUserMessages,
  type AdminReport,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

const STATUS: Record<string, string> = { open: "未対応", reviewing: "確認中", resolved: "対応済み" };
const FILTERS = [
  ["open", "未対応"],
  ["reviewing", "確認中"],
  ["resolved", "対応済み"],
  ["all", "すべて"],
] as const;

function msg(e: unknown) {
  return e instanceof Error && e.message ? e.message : "うまくいきませんでした";
}

// 通報対応パネル（管理者・モデレーター）
export function ReportsPanel({ onChanged }: { onChanged?: () => void }) {
  const list = useServerFn(adminListReports);
  const update = useServerFn(adminUpdateReport);
  const mute = useServerFn(adminSetMute);
  const ban = useServerFn(adminSetBan);
  const wipe = useServerFn(adminDeleteUserMessages);

  const [filter, setFilter] = useState<string>("open");
  const [items, setItems] = useState<AdminReport[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await list({ data: { status: filter } }));
      setSelected(new Set());
    } catch (e) {
      toast.error(msg(e));
    }
  }, [list, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(msg(e));
    } finally {
      setBusy(false);
    }
  };

  const setStatus = (ids: string[], status: "open" | "reviewing" | "resolved") =>
    run(() => update({ data: { ids, status } }), `${STATUS[status]}にしました`);

  // 対応操作のあと、その人への未完了の通報をまとめて対応済みにする
  const closeAllFor = (userId: string) =>
    items.filter((r) => r.reported_id === userId && r.status !== "resolved").map((r) => r.id);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map(([v, l]) => (
          <Button key={v} size="sm" variant={filter === v ? "default" : "outline"} className="h-7 text-xs" onClick={() => setFilter(v)}>
            {l}
          </Button>
        ))}
        <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={() => void load()}>
          再読み込み
        </Button>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border bg-muted/50 p-2 text-xs">
          <span className="font-semibold">{selected.size}件を選択中</span>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => void setStatus([...selected], "reviewing")}>
            確認中にする
          </Button>
          <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={() => void setStatus([...selected], "resolved")}>
            まとめて対応済み
          </Button>
        </div>
      )}

      {items.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">この条件の通報はありません</p>}

      {items.map((r) => (
        <div key={r.id} className="space-y-2 rounded-xl border bg-card p-3 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} aria-label="選択" />
            <Badge variant={r.status === "open" ? "destructive" : "secondary"}>{STATUS[r.status] ?? r.status}</Badge>
            <Badge variant="outline">{r.context === "group" ? "グループ" : "個別トーク"}</Badge>
            {r.reported_report_count > 1 && <Badge variant="destructive">この人への通報 {r.reported_report_count}件</Badge>}
            <span className="ml-auto text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleString("ja-JP")}</span>
          </div>
          <p>
            <strong>対象:</strong> {r.reported_name}
            {r.reported_friend_code && <span className="text-muted-foreground">（ID {r.reported_friend_code}）</span>}
            <span className="text-muted-foreground"> ／ 通報者: {r.reporter_name}</span>
          </p>
          <p><strong>理由:</strong> {r.reason}</p>
          {r.detail && <p className="whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-2 text-muted-foreground">{r.detail}</p>}

          <div className="flex flex-wrap gap-1.5 pt-1">
            {r.status !== "reviewing" && r.status !== "resolved" && (
              <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={busy} onClick={() => void setStatus([r.id], "reviewing")}>
                確認中にする
              </Button>
            )}
            {r.status !== "resolved" ? (
              <Button size="sm" className="h-7 text-[11px]" disabled={busy} onClick={() => void setStatus([r.id], "resolved")}>
                対応済みにする
              </Button>
            ) : (
              <Button size="sm" variant="ghost" className="h-7 text-[11px]" disabled={busy} onClick={() => void setStatus([r.id], "open")}>
                未対応に戻す
              </Button>
            )}
            <Button size="sm" variant="secondary" className="h-7 text-[11px]" onClick={() => setOpen(open === r.id ? null : r.id)}>
              {open === r.id ? "処分を閉じる" : "相手を処分…"}
            </Button>
          </div>

          {open === r.id && (
            <div className="flex flex-wrap gap-1.5 rounded-lg border border-destructive/30 p-2">
              {[
                [60, "1時間ミュート"],
                [60 * 24, "24時間ミュート"],
              ].map(([m, l]) => (
                <Button
                  key={m}
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await mute({ data: { userId: r.reported_id, minutes: m as number, reason: `通報: ${r.reason}` } });
                      await update({ data: { ids: closeAllFor(r.reported_id), status: "resolved" } });
                    }, `${l}にして対応済みにしました`)
                  }
                >
                  {l}
                </Button>
              ))}
              <Button
                size="sm"
                variant="destructive"
                className="h-7 text-[11px]"
                disabled={busy}
                onClick={() => {
                  if (!confirm(`${r.reported_name} さんを7日間停止しますか？`)) return;
                  void run(async () => {
                    await ban({ data: { userId: r.reported_id, banned: true, reason: r.reason, days: 7 } });
                    await update({ data: { ids: closeAllFor(r.reported_id), status: "resolved" } });
                  }, "7日間停止して対応済みにしました");
                }}
              >
                7日間停止
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-7 text-[11px]"
                disabled={busy}
                onClick={() => {
                  if (!confirm(`${r.reported_name} さんの投稿をすべて削除しますか？元に戻せません。`)) return;
                  void run(() => wipe({ data: { userId: r.reported_id } }), "投稿を削除しました");
                }}
              >
                投稿を全削除
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
