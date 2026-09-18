import { createServerFn } from "@tanstack/react-start";

const RETENTION_DAYS = 14;
// サーバー側でも1日1回までに制限（訪問者が多くても掃除は1回だけ走る）
const MIN_INTERVAL_MS = 20 * 60 * 60 * 1000;

// 古いメッセージ・通話シグナル・添付ファイルを削除してストレージとコストを抑える。
export const cleanupOldData = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 直近で実行済みなら何もしない（アクセスが多くてもDB負荷が増えない）
  const { data: state } = await supabaseAdmin
    .from("app_state")
    .select("last_run_at")
    .eq("key", "cleanup")
    .maybeSingle();
  const last = state?.last_run_at ? new Date(state.last_run_at).getTime() : 0;
  if (Date.now() - last < MIN_INTERVAL_MS) return { ok: true, skipped: true, removedFiles: 0 };

  await supabaseAdmin
    .from("app_state")
    .upsert({ key: "cleanup", last_run_at: new Date().toISOString() });

  await supabaseAdmin.rpc("cleanup_old_data");

  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let removed = 0;

  // ユーザーごとのフォルダを走査して、保存期間を過ぎた画像・動画を削除
  const { data: folders } = await supabaseAdmin.storage
    .from("chat-images")
    .list("", { limit: 1000 });
  for (const folder of folders ?? []) {
    if (!folder.name) continue;
    const { data: files } = await supabaseAdmin.storage
      .from("chat-images")
      .list(folder.name, { limit: 1000, sortBy: { column: "created_at", order: "asc" } });
    const stale = (files ?? [])
      .filter((f) => f.name && new Date(f.created_at ?? Date.now()).getTime() < cutoff)
      .map((f) => `${folder.name}/${f.name}`);
    if (stale.length > 0) {
      await supabaseAdmin.storage.from("chat-images").remove(stale);
      removed += stale.length;
    }
  }

  return { ok: true, skipped: false, removedFiles: removed };
});
