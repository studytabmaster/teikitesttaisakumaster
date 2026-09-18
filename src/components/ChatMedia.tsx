import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { downloadMedia, getMediaUrl } from "@/lib/mediaUrl";

export function ChatMedia({ path, mediaType }: { path: string; mediaType?: string | null | undefined }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const isVideo = mediaType === "video" || /\.(mp4|webm|mov|m4v)$/i.test(path);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);

    void (async () => {
      const signed = await getMediaUrl(path);
      if (cancelled) return;
      if (signed) setUrl(signed);
      else setFailed(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [path]);

  const save = async () => {
    setSaving(true);
    const ok = await downloadMedia(path);
    setSaving(false);
    if (!ok) toast.error("ダウンロードできませんでした");
  };

  if (failed) {
    return (
      <div className="flex h-24 w-40 items-center justify-center rounded-xl bg-foreground/5 px-3 text-center text-[11px] text-muted-foreground">
        メディアを読み込めませんでした
      </div>
    );
  }

  if (!url) {
    return <div className="h-40 w-40 animate-pulse rounded-xl bg-foreground/10" />;
  }

  return (
    <div className="group relative">
      {isVideo ? (
        <video
          src={url}
          controls
          playsInline
          preload="metadata"
          className="max-h-72 w-56 rounded-xl bg-black object-cover"
        />
      ) : (
        <a href={url} target="_blank" rel="noreferrer">
          <img
            src={url}
            alt="送信されたメディア"
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className="max-h-64 w-auto max-w-full rounded-xl object-cover"
          />
        </a>
      )}
      <button
        type="button"
        aria-label="ダウンロード"
        disabled={saving}
        onClick={() => void save()}
        className="absolute right-2 top-2 rounded-full bg-background/80 p-2 text-foreground shadow-soft backdrop-blur transition-opacity hover:bg-background disabled:opacity-50"
      >
        <Download className="size-4" />
      </button>
    </div>
  );
}
