import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ModerationResult = {
  safe: boolean;
  reason?: string | undefined;
};


// プロフィールアイコンのAIモデレーション検査
// 縮小済み画像（128x128px）を受け取り、AI Gatewayで検査して不適切な理由を返す
export const checkProfileAvatarSafety = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { imageBase64: string }) => input)
  .handler(async ({ data }): Promise<ModerationResult> => {
    const rawData = (data.imageBase64 ?? "").trim();
    if (!rawData.startsWith("data:image/")) {
      return { safe: false, reason: "画像形式が無効です" };
    }

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      // APIキー未設定時は通過させ運用を止めない（安全フォールバック）
      return { safe: true };
    }

    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-Lovable-AIG-SDK": "fetch",
        },
        body: JSON.stringify({
          model: "openai/gpt-6-astra",
          reasoning: { effort: "low" },
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text:
                    "あなたはチャットアプリの画像審査AIです。添付された画像を審査してください。\n" +
                    "以下のいずれかに該当する場合は safe を false にし、reason に短くわかりやすい日本語の理由（例:「性的な露出が含まれています」「暴力的な描写が含まれています」など）を出力してください。\n" +
                    "・性的・わいせつな表現、下着や水着を含む過度な露出\n" +
                    "・暴力・流血・グロテスクな描写\n" +
                    "・ヘイトスピーチ、差別的なシンボルやマーク\n" +
                    "・その他公序良俗に反する内容\n" +
                    "問題がなければ safe を true、reason を空文字にしてください。",
                },
                {
                  type: "input_image",
                  image_url: rawData,
                },
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "moderation_result",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  safe: { type: "boolean" },
                  reason: { type: "string" },
                },
                required: ["safe", "reason"],
                additionalProperties: false,
              },
            },
          },
        }),
      });

      if (!response.ok) {
        console.error("Moderation AI Gateway error status:", response.status);
        return { safe: true };
      }

      const resJson = await response.json();

      // Responses API の出力からJSONテキストをパース
      let parsedOutput: { safe?: boolean; reason?: string } | null = null;

      if (resJson?.output && Array.isArray(resJson.output)) {
        for (const item of resJson.output) {
          if (item?.type === "message" && Array.isArray(item.content)) {
            for (const content of item.content) {
              if (content?.type === "output_text" && typeof content.text === "string") {
                try {
                  parsedOutput = JSON.parse(content.text);
                  break;
                } catch {
                  // ignore
                }
              }
            }
          }
        }
      }

      // トップレベルの output_text フォールバック
      if (!parsedOutput && typeof resJson?.output_text === "string") {
        try {
          parsedOutput = JSON.parse(resJson.output_text);
        } catch {
          // ignore
        }
      }

      if (parsedOutput && typeof parsedOutput.safe === "boolean") {
        return {
          safe: parsedOutput.safe,
          reason: parsedOutput.reason?.trim() || undefined,
        };
      }

      return { safe: true };
    } catch (err) {
      console.error("Moderation error:", err);
      // ネットワークや一時的な障害時はユーザー体験を損なわないよう通過
      return { safe: true };
    }
  });
