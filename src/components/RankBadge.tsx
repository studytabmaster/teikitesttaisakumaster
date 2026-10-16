import { Crown, Sparkles, Trophy, Award, Shield } from "lucide-react";

export type RankTier = "rookie" | "bronze" | "silver" | "gold" | "platinum" | "legend";

export function getRankTier(count: number): {
  tier: RankTier;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  nextCount: number | null;
  perks: string[];
} {
  if (count >= 20) {
    return {
      tier: "legend",
      label: "LEGEND",
      color: "text-amber-400",
      bgColor: "bg-gradient-to-r from-amber-500/20 via-pink-500/20 to-purple-500/20",
      borderColor: "border-amber-400/60",
      nextCount: null,
      perks: ["虹色レジェンドバッジ", "広告完全非表示", "全機能アンロック", "殿堂入り称号"],
    };
  }
  if (count >= 10) {
    return {
      tier: "platinum",
      label: "PLATINUM",
      color: "text-cyan-400",
      bgColor: "bg-cyan-500/15",
      borderColor: "border-cyan-400/40",
      nextCount: 20,
      perks: ["プラチナバッジ", "広告非表示特典", "Keepメモ容量無制限"],
    };
  }
  if (count >= 5) {
    return {
      tier: "gold",
      label: "GOLD",
      color: "text-yellow-400",
      bgColor: "bg-yellow-500/15",
      borderColor: "border-yellow-400/40",
      nextCount: 10,
      perks: ["王冠ゴールドバッジ", "ネームカラー変更", "優先表示"],
    };
  }
  if (count >= 3) {
    return {
      tier: "silver",
      label: "SILVER",
      color: "text-slate-300",
      bgColor: "bg-slate-400/15",
      borderColor: "border-slate-400/40",
      nextCount: 5,
      perks: ["シルバーバッジ", "プロフィールカスタム装飾"],
    };
  }
  if (count >= 1) {
    return {
      tier: "bronze",
      label: "BRONZE",
      color: "text-amber-600 dark:text-amber-500",
      bgColor: "bg-amber-600/15",
      borderColor: "border-amber-600/40",
      nextCount: 3,
      perks: ["ブロンズバッジ獲得", "招待特典参加証"],
    };
  }
  return {
    tier: "rookie",
    label: "ROOKIE",
    color: "text-muted-foreground",
    bgColor: "bg-muted/40",
    borderColor: "border-border",
    nextCount: 1,
    perks: ["友だちを1人招待してブロンズバッジを獲得しよう！"],
  };
}

export function RankBadge({ count, size = 13 }: { count: number; size?: number }) {
  const info = getRankTier(count);
  if (info.tier === "rookie") return null;

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-black border ${info.color} ${info.bgColor} ${info.borderColor} shadow-xs select-none align-middle ml-1`}
      title={`招待ランク: ${info.label} (${count}人招待)`}
    >
      {info.tier === "legend" && <Crown size={size} className="animate-pulse text-amber-300" />}
      {info.tier === "platinum" && <Sparkles size={size} />}
      {info.tier === "gold" && <Trophy size={size} />}
      {info.tier === "silver" && <Award size={size} />}
      {info.tier === "bronze" && <Shield size={size} />}
      <span>{info.label}</span>
    </span>
  );
}
