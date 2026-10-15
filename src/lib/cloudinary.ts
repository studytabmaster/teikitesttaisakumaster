export const CLOUDINARY_CLOUD_NAME = "pfaqylud";
export const CLOUDINARY_UPLOAD_PRESET = "rine_preset";

/**
 * Cloudinaryに直接アップロード（署名不要のUnsigned Presetを使用）
 * 失敗時や未設定時は安全に null を返し、標準ストレージへフォールバックします。
 */
export async function uploadToCloudinary(file: Blob | File): Promise<string | null> {
  // 既知の無効アカウントまたは未設定時は無駄な通信を避けて即座にフォールバック
  if (!CLOUDINARY_CLOUD_NAME || CLOUDINARY_CLOUD_NAME === "pfaqylud") {
    return null;
  }

  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`,
      {
        method: "POST",
        body: formData,
      },
    );

    if (!res.ok) {
      console.warn("Cloudinary upload failed, fallback to Supabase Storage:", res.status);
      return null;
    }

    const json = (await res.json()) as { secure_url: string };
    return json.secure_url || null;
  } catch (err) {
    console.warn("Cloudinary upload error, fallback to Supabase Storage:", err);
    return null;
  }
}

/**
 * 日本時間（JST）の深夜 1:00 〜 5:59 かどうかを判定
 */
export function isLateNightJST(): boolean {
  const now = new Date();
  const jstHours = (now.getUTCHours() + 9) % 24;
  return jstHours >= 1 && jstHours < 6;
}
