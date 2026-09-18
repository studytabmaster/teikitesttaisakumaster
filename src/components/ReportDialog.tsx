import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBlocks } from "@/hooks/useBlocks";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const REASONS = [
  "スパム・宣伝",
  "迷惑行為・嫌がらせ",
  "不適切な画像・表現",
  "なりすまし",
  "詐欺の疑い",
  "その他",
];

export function ReportDialog({
  targetId,
  targetName,
  targetCode,
  context = "direct",
  groupId,
  trigger,
}: {
  targetId: string;
  targetName: string;
  targetCode?: string | undefined;
  context?: "direct" | "group" | undefined;
  groupId?: string | undefined;
  trigger: ReactNode;
}) {
  const { user } = useAuth();
  const { block } = useBlocks();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]!);
  const [detail, setDetail] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase
      .from("reports")
      .insert({
        reporter_id: user.id,
        reported_id: targetId,
        reason,
        detail: detail.trim(),
        reported_code: targetCode ?? null,
        context,
        group_id: groupId ?? null,
      });
    if (error) {
      setBusy(false);
      toast.error("通報を送信できませんでした");
      return;
    }
    if (alsoBlock) await block(targetId);
    setBusy(false);
    setOpen(false);
    setDetail("");
    toast.success(alsoBlock ? "通報し、ブロックしました" : "通報を受け付けました");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>{targetName} さんを通報</DialogTitle>
          <DialogDescription>
            内容は運営に送信されます。相手に通報したことは通知されません。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>理由</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-detail">詳細（任意）</Label>
            <Textarea
              id="report-detail"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              maxLength={1000}
              placeholder="いつ・どのような内容だったかを書いてください"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={alsoBlock}
              onCheckedChange={(v) => setAlsoBlock(v === true)}
            />
            同時にこの相手をブロックする
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            キャンセル
          </Button>
          <Button variant="destructive" onClick={submit} disabled={busy}>
            通報する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
