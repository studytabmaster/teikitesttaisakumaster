// 悪口・卑猥な言葉の伏字化。
// 空白や記号、全角/半角、カタカナ/ひらがな、伏字回避の文字置換（1→i など）を
// 正規化してから判定するため、間に記号を挟むなどの回避ができない。

const WORDS: string[] = [
  // 日本語（暴言・脅し）
  "しね", "死ね", "しねよ", "しねや", "しんで", "死んで", "じさつしろ", "自殺しろ",
  "ころす", "殺す", "ころすぞ", "殺害", "ぶっころす", "ぶっ殺す", "しにさらせ",
  "きえろ", "消えろ", "でていけ", "出ていけ", "うまれてくるな", "生まれてくるな",
  "ばか", "馬鹿", "ばかやろう", "あほ", "阿呆", "まぬけ", "間抜け", "とんま",
  "くず", "屑", "生ゴミ", "はきだめ", "ぶす", "デブ", "でぶ",
  "きもい", "きもーい", "気持ち悪い", "きしょい", "うざい", 
  "だまれ", "黙れ", "きちがい", "気違い", "きちがえ", "あたまおかしい", "頭おかしい",
  "くそ", "糞", "クソ", "くそやろう", "くそが", "くたばれ", "てめえ", "てめー",
  "きさま", "貴様", "やつざき", "むのう", "無能", "やくたたず", "役立たず",
  "ざこ", "雑魚", "のうなし", "能無し", "おわってる", "終わってる", 
  "ぶさいく", "不細工", "いきてるいみない", "生きてる意味ない",
  "しっぱいさく", "失敗作", "くそざこ", "ころしたい", "殺したい",
  "ちょうせんじん", "きちく", "鬼畜", "いかれてる", "いかれぽんち",
  // 日本語（性的）
  "せっくす", "せくーす", "ちんこ", "ちんちん", "ちんぽ",
  "まんこ", "おまんこ", "おっぱい", "きょにゅう", "巨乳", 
  "せいこうい", "性行為", "ふぇら", "ふぇらちお", "いんけい", "陰茎", "いんぶ", "陰部",
  "ぬーど", "ぬーどしゃしん", "らいぶちゃっと", "えろ", "エロ", "えろい", "えろちゃ",
  "へんたい", "変態", "ろりこん", "ぺど", "しょたこん", "じゅくじょ", "ふうぞく",
  "せいき", "性器", "精液", "せいえき", "ますたべーしょん", "おなに", "おなにー",
  "ぱんつみせて", "ちくび", "乳首", "らんこう", "乱交", 
  "えんこう", "援交", "えんじょこうさい", "援助交際",
  "いんらん", "淫乱", "ぱいずり", "しゃせい", "射精", "ぼっき", "勃起",
  "せいぼうりょく", "性暴力", "れいぷ", "ごうかん", "強姦", "ちかん", "痴漢",
  // 英語
  "fuck", "fucker", "fucking", "shit", "bitch", "bastard", "asshole",
  "dick", "cock", "pussy", "cunt", "whore", "slut", "nigger", "faggot",
  "retard", "kill yourself", "kys", "porn", "hentai", "sex", "boobs",
  "blowjob", "handjob", "anal", "cum", "rape", "dildo", "milf", "nude",
  "jerkoff", "wanker", "motherfucker", "twat", "prick",
];

const LEET: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t",
  "@": "a", "$": "s", "!": "i", "|": "i", "＠": "a",
};

// 記号・空白・ゼロ幅など、判定時に無視する文字
const IGNORE =
  /[\s\u200B-\u200F\u202A-\u202E\u2060\uFEFF\u309B\u309C\u30FB\uFF65\uFF9E\uFF9F.,、。!?！？~〜ー・:;"'`^*_\-+=()（）[\]{}<>《》「」『』/\\|#%&@°º•·¥￥]/;

// 小書き仮名を通常の仮名にそろえる（「し ぬ」「しぬぅ」などの回避対策）
const KANA_FOLD: Record<string, string> = {
  ぁ: "あ", ぃ: "い", ぅ: "う", ぇ: "え", ぉ: "お",
  ゃ: "や", ゅ: "ゆ", ょ: "よ", ゎ: "わ", ゕ: "か", ゖ: "け",
};

// 見た目が似ている外国語文字（キリル文字など）を英字にそろえる
const LOOKALIKE: Record<string, string> = {
  а: "a", в: "b", с: "c", е: "e", н: "h", к: "k", м: "m",
  о: "o", р: "p", т: "t", х: "x", у: "y", і: "i", ѕ: "s", ј: "j",
  α: "a", ο: "o", ρ: "p", ε: "e", ι: "i", κ: "k", ν: "v", τ: "t",
};

function normalizeChar(ch: string): string {
  // 装飾文字（𝐟𝐮𝐜𝐤 のような数学英字）を通常の英数へ戻す
  let c = ch.normalize("NFKD").replace(/[\u0300-\u036F]/g, "");
  if (!c) return "";
  c = c.toLowerCase();
  // 全角英数 → 半角
  c = c
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (m) => String.fromCharCode(m.charCodeAt(0) - 0xfee0))
    .toLowerCase();
  const look = LOOKALIKE[c];
  if (look) c = look;
  const leet = LEET[c];
  if (leet) c = leet;
  // 半角カタカナ → 全角カタカナ
  c = c.normalize("NFKC");
  // カタカナ → ひらがな
  c = c.replace(/[\u30A1-\u30F6]/g, (m) => String.fromCharCode(m.charCodeAt(0) - 0x60));
  const fold = KANA_FOLD[c];
  if (fold) c = fold;
  if (!c || IGNORE.test(c)) return "";
  return c;
}

/** 正規化文字列と、その各文字が元の文字列のどこに対応するかの索引 */
function normalize(text: string) {
  let normalized = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const c = normalizeChar(text[i]!);
    if (!c) continue;
    // 同じ文字の連続は1つに畳む（「しねええええ」対策）
    if (normalized.length > 0 && normalized[normalized.length - 1] === c) {
      map[map.length - 1] = i; // 直前の対応範囲を伸ばす
      continue;
    }
    normalized += c;
    map.push(i);
  }
  return { normalized, map };
}

const NORMALIZED_WORDS = Array.from(
  new Set(WORDS.map((w) => normalize(w).normalized).filter((w) => w.length >= 2)),
).sort((a, b) => b.length - a.length);

/** 禁止語が含まれていれば true */
export function hasProfanity(text: string) {
  const { normalized } = normalize(text);
  return NORMALIZED_WORDS.some((w) => normalized.includes(w));
}

/** 禁止語を ### に伏字化して返す */
export function maskProfanity(text: string) {
  if (!text) return text;
  const { normalized, map } = normalize(text);
  if (!normalized) return text;

  const masked = new Array<boolean>(text.length).fill(false);
  for (const word of NORMALIZED_WORDS) {
    let from = 0;
    for (;;) {
      const idx = normalized.indexOf(word, from);
      if (idx === -1) break;
      const start = map[idx]!;
      const end = idx + word.length < map.length ? map[idx + word.length]! - 1 : text.length - 1;
      for (let i = start; i <= end; i += 1) masked[i] = true;
      from = idx + 1;
    }
  }

  let out = "";
  for (let i = 0; i < text.length; i += 1) out += masked[i] ? "#" : text[i];
  // 連続した # は最大3つにまとめて「###」表示にする
  return out.replace(/#{2,}/g, "###");
}
