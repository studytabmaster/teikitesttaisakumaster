export const CLOUDINARY_CLOUD_NAME = "P6ZR2KDZ";
export const CLOUDINARY_UPLOAD_PRESET = "rine_preset";

/**
 * Cloudinaryに直接アップロード（署名不要のUnsigned Presetを使用）
 * Supabase Storageの通信量（Egress）とクレジット消費をゼロにします。
 */
export async function uploadToCloudinary(file: Blob | File): Promise<string> {
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
    const errText = await res.text().catch(() => "");
    throw new Error(`Cloudinary upload failed: ${res.status} ${errText}`);
  }

  const json = (await res.json()) as { secure_url: string };
  return json.secure_url;
}

/**
 * 日本時間（JST）の深夜 1:00 〜 5:59 かどうかを判定
 */
export function isLateNightJST(): boolean {
  const now = new Date();
  const jstHours = (now.getUTCHours() + 9) % 24;
  return jstHours >= 1 && jstHours < 6;
}
