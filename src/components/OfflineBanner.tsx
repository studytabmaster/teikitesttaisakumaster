import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { flushOutbox, getOutbox, onOutboxChange } from "@/lib/outbox";

/** オフライン状態と送信待ち件数を画面上部に表示し、復帰時に自動送信する */
export function OfflineBanner() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    setPending(getOutbox().length);

    const sync = async () => {
      setSending(true);
      const sent = await flushOutbox();
      setSending(false);
      setPending(getOutbox().length);
      if (sent > 0) toast.success(`送信待ちの${sent}件を送信しました`);
    };

    const goOnline = () => {
      setOnline(true);
      void sync();
    };
    const goOffline = () => setOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const off = onOutboxChange(() => setPending(getOutbox().length));
    if (navigator.onLine) void sync();

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      off();
    };
  }, []);

  if (online && pending === 0) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-foreground/90 px-4 py-1.5 text-[12px] font-medium text-background">
      {online ? (
        <RefreshCw className={sending ? "size-3.5 animate-spin" : "size-3.5"} />
      ) : (
        <CloudOff className="size-3.5" />
      )}
      {online
        ? `送信待ち ${pending}件を送信しています…`
        : pending > 0
          ? `オフライン中 — ${pending}件はつながったら自動で送信します`
          : "オフライン中 — 送ったメッセージは自動で順番待ちになります"}
    </div>
  );
}
