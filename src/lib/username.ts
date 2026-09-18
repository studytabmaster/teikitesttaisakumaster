// 名前（ユーザー名）とパスワードだけでログインできるようにするための変換。
// 認証の内部処理ではメールアドレスが必要なため、名前から一定の内部アドレスを作る。

const DOMAIN = "rine.local";

/** 入力された名前を内部で扱う形に整える */
export function normalizeUsername(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}

/** 名前として使える文字かどうか（英数字・ひらがな・カタカナ・漢字・_ と -） */
export function isValidUsername(raw: string) {
  const name = normalizeUsername(raw);
  return (
    name.length >= 2 &&
    name.length <= 20 &&
    /^[0-9a-z_\-\u3040-\u30ff\u4e00-\u9fff]+$/.test(name)
  );
}

/** 名前 → 認証用の内部アドレス */
export function usernameToEmail(raw: string) {
  const name = normalizeUsername(raw);
  const safe = Array.from(name)
    .map((ch) =>
      /[0-9a-z_\-]/.test(ch) ? ch : `x${ch.codePointAt(0)!.toString(36)}`,
    )
    .join("");
  return `${safe}@${DOMAIN}`;
}
