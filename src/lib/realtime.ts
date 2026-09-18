// 2人の間で共有するリアルタイム用チャンネル名（どちらから見ても同じ名前になる）
export function pairChannelName(prefix: string, a: string, b: string) {
  return `${prefix}:${[a, b].sort().join("_")}`;
}
