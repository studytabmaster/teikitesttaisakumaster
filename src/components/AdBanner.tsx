import { useRouterState } from "@tanstack/react-router";

export function AdBanner({
  id,
  className = "",
}: {
  id: string;
  className?: string;
}) {
  // 現在のページURLを取得（ページ切り替えを検知）
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className={`flex flex-col items-center justify-center my-1 ${className}`}>
      <span className="text-[9px] text-muted-foreground/60 mb-0.5 tracking-wider">
        スポンサーリンク
      </span>
      <div className="w-[320px] h-[50px] overflow-hidden bg-muted/10 rounded border border-border/30 flex items-center justify-center">
        <iframe
          // ページ遷移（PV）ごとに新しいiframeとして再生成・再読み込みさせる
          key={`${id}-${pathname}`}
          src={`/ad.html?id=${id}&p=${encodeURIComponent(pathname)}`}
          width={320}
          height={50}
          title={`ad-${id}`}
          scrolling="no"
          className="w-[320px] h-[50px] border-0"
        />
      </div>
    </div>
  );
}
