import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const deleteGroupMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({
      messageId: z.string(),
      groupId: z.string(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { messageId, groupId } = data;
    const userId = context.userId;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. 対象のメッセージを取得
    const { data: msg } = await supabaseAdmin
      .from("group_messages")
      .select("id, sender_id, group_id, image_url")
      .eq("id", messageId)
      .eq("group_id", groupId)
      .maybeSingle();

    if (!msg) {
      throw new Error("メッセージが見つかりません");
    }

    // 2. 権限チェック: 自分が送信者か、もしくはグループのオーナーか
    const isSender = msg.sender_id === userId;
    let isOwner = false;
    if (!isSender) {
      const { data: grp } = await supabaseAdmin
        .from("groups")
        .select("owner_id")
        .eq("id", groupId)
        .maybeSingle();
      isOwner = grp?.owner_id === userId;
    }

    if (!isSender && !isOwner) {
      throw new Error("このメッセージを削除する権限がありません");
    }

    // 3. 画像や動画が添付されている場合はストレージからも削除
    if (msg.image_url) {
      try {
        await supabaseAdmin.storage.from("chat-images").remove([msg.image_url]);
      } catch (e) {
        console.error("Failed to remove media file:", e);
      }
    }

    // 4. メッセージをデータベースから完全に削除
    const { error: delErr } = await supabaseAdmin
      .from("group_messages")
      .delete()
      .eq("id", messageId);

    if (delErr) {
      throw new Error("削除に失敗しました");
    }

    return { success: true };
  });
