export function AdBanner({
  id,
  className = "",
}: {
  id: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center my-1 ${className}`}>
      <span className="text-[9px] text-muted-foreground/60 mb-0.5 tracking-wider">
        スポンサーリンク
      </span>
      <div className="w-[320px] h-[50px] overflow-hidden bg-muted/10 rounded border border-border/30 flex items-center justify-center">
        <iframe
          src={`/ad.html?id=${id}`}
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
