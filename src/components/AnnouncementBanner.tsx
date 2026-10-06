import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getActiveAnnouncement, voteAnnouncement, type AnnouncementData } from "@/lib/admin.functions";
import { Megaphone, X, Check, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const DISMISSED_STORAGE_KEY = "rine_dismissed_announcement_id";

export function AnnouncementBanner() {
  const fetchActive = useServerFn(getActiveAnnouncement);
  const sendVote = useServerFn(voteAnnouncement);

  const [data, setData] = useState<AnnouncementData | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [voting, setVoting] = useState(false);

  useEffect(() => {
    let mounted = true;
    void fetchActive().then((res) => {
      if (!mounted || !res) return;
      const lastDismissedId = localStorage.getItem(DISMISSED_STORAGE_KEY);
      if (lastDismissedId === res.id) {
        setDismissed(true);
      }
      setData(res);
    }).catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  if (!data || dismissed || !data.active) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_STORAGE_KEY, data.id);
    setDismissed(true);
  };

  const handleVote = async (optionIndex: number) => {
    if (voting || data.hasVotedIndex !== undefined && data.hasVotedIndex !== null) return;
    setVoting(true);
    try {
      const res = await sendVote({ data: { optionIndex } });
      setData((prev) =>
        prev
          ? {
              ...prev,
              pollCounts: res.pollCounts,
              hasVotedIndex: res.hasVotedIndex,
            }
          : null,
      );
      toast.success("投票を受け付けました");
    } catch (e: any) {
      toast.error(e?.message ?? "投票に失敗しました");
    } finally {
      setVoting(false);
    }
  };

  const totalVotes = (data.pollCounts ?? []).reduce((a, b) => a + b, 0);

  return (
    <aside
      aria-label="運営アナウンス"
      className="relative z-10 w-full border-b border-primary/20 bg-primary/10 px-4 py-2.5 text-foreground backdrop-blur-sm transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-1 items-start gap-2.5">
          <Megaphone className="mt-0.5 size-4 shrink-0 text-primary animate-pulse" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-xs font-medium leading-relaxed whitespace-pre-wrap break-words">
              {data.content}
            </p>

            {/* 投票アンケートセクション */}
            {data.pollOptions && data.pollOptions.length > 0 && (
              <div className="mt-2 space-y-1.5 rounded-md border border-primary/20 bg-background/60 p-2.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <BarChart2 className="size-3 text-primary" />
                    運営アンケート
                  </span>
                  <span>計 {totalVotes} 票</span>
                </div>

                <div className="space-y-1.5 pt-1">
                  {data.pollOptions.map((option, idx) => {
                    const count = data.pollCounts?.[idx] ?? 0;
                    const percent = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                    const isVoted = data.hasVotedIndex === idx;

                    return (
                      <div key={idx} className="relative overflow-hidden rounded border border-border/80 bg-background/80 text-xs">
                        {/* 投票結果バー */}
                        {data.hasVotedIndex !== undefined && data.hasVotedIndex !== null && (
                          <div
                            className="absolute inset-y-0 left-0 bg-primary/20 transition-all duration-500"
                            style={{ width: `${percent}%` }}
                          />
                        )}

                        <button
                          type="button"
                          onClick={() => void handleVote(idx)}
                          disabled={voting || (data.hasVotedIndex !== undefined && data.hasVotedIndex !== null)}
                          className="relative flex w-full items-center justify-between px-3 py-1.5 text-left transition-colors hover:bg-primary/5 disabled:pointer-events-none"
                        >
                          <span className="flex items-center gap-1.5 font-medium truncate">
                            {isVoted && <Check className="size-3 text-primary shrink-0" />}
                            {option}
                          </span>
                          {data.hasVotedIndex !== undefined && data.hasVotedIndex !== null && (
                            <span className="shrink-0 font-mono text-[11px] text-muted-foreground ml-2">
                              {count}票 ({percent}%)
                            </span>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ×ボタン */}
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
          aria-label="アナウンスを閉じる"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </aside>
  );
}
