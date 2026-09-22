import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AdminUser = {
  id: string;
  display_name: string;
  username: string | null;
  friend_code: string;
  avatar_url: string | null;
  created_at: string;
  role: "admin" | "moderator" | null;
  banned: boolean;
  ban_reason: string | null;
  ban_until: string | null;
};

// 呼び出し元が管理者かどうかを確認する
async function assertAdmin(supabase: { rpc: (fn: string, args: unknown) => Promise<{ data: unknown }> }, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (data !== true) throw new Error("管理者のみ操作できます");
}

// 管理者パスワードを入力して自分のアカウントに管理者権限を付与する
export const unlockAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { password: string }) => input)
  .handler(async ({ data, context }) => {
    const expected = process.env["ADMIN_PASSWORD"];
    if (!expected) throw new Error("管理者パスワードが設定されていません");
    const given = (data.password ?? "").trim();
    if (given.length === 0 || given !== expected) throw new Error("パスワードが違います");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: context.userId, role: "admin" }, { onConflict: "user_id,role" });
    return { ok: true };
  });

// ユーザー一覧（名前・ID で検索）
export const adminListUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { q?: string }) => input)
  .handler(async ({ data, context }): Promise<AdminUser[]> => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("profiles")
      .select("id, display_name, username, friend_code, avatar_url, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    const q = (data.q ?? "").trim();
    if (q) query = query.or(`display_name.ilike.%${q}%,username.ilike.%${q}%,friend_code.ilike.%${q}%`);

    const { data: profiles } = await query;
    const rows = profiles ?? [];
    const ids = rows.map((p) => p.id);
    if (ids.length === 0) return [];

    const [{ data: roles }, { data: bans }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
      supabaseAdmin.from("user_bans").select("user_id, reason, until").in("user_id", ids),
    ]);

    const roleMap = new Map<string, "admin" | "moderator">();
    for (const r of roles ?? []) {
      if (r.role === "admin") roleMap.set(r.user_id, "admin");
      else if (r.role === "moderator" && roleMap.get(r.user_id) !== "admin")
        roleMap.set(r.user_id, "moderator");
    }
    const banMap = new Map((bans ?? []).map((b) => [b.user_id, b]));

    return rows.map((p) => {
      const ban = banMap.get(p.id);
      const active = !!ban && (!ban.until || new Date(ban.until).getTime() > Date.now());
      return {
        ...p,
        role: roleMap.get(p.id) ?? null,
        banned: active,
        ban_reason: active ? (ban?.reason ?? "") : null,
        ban_until: active ? (ban?.until ?? null) : null,
      };
    });
  });

// 権限の付与・剥奪
export const adminSetRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; role: "admin" | "moderator" | null }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    if (data.userId === context.userId && data.role !== "admin")
      throw new Error("自分の管理者権限は外せません");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    if (data.role) await supabaseAdmin.from("user_roles").insert({ user_id: data.userId, role: data.role });
    return { ok: true };
  });

// 利用停止・解除
export const adminSetBan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; banned: boolean; reason?: string; days?: number }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    if (data.userId === context.userId) throw new Error("自分は停止できません");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!data.banned) {
      await supabaseAdmin.from("user_bans").delete().eq("user_id", data.userId);
      return { ok: true };
    }
    const until =
      data.days && data.days > 0
        ? new Date(Date.now() + data.days * 24 * 60 * 60 * 1000).toISOString()
        : null;
    await supabaseAdmin.from("user_bans").upsert({
      user_id: data.userId,
      reason: (data.reason ?? "").trim(),
      until,
      created_by: context.userId,
    });
    return { ok: true };
  });

// 指定ユーザーの投稿をすべて削除
export const adminDeleteUserMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("messages").delete().eq("sender_id", data.userId);
    await supabaseAdmin.from("group_messages").delete().eq("sender_id", data.userId);
    return { ok: true };
  });

export type AdminGroup = {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  owner_name: string;
  is_open: boolean;
  members: number;
  messages: number;
  created_at: string;
};

// オープンチャット（公開ルーム）の一覧
export const adminListGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { q?: string; openOnly?: boolean }) => input)
  .handler(async ({ data, context }): Promise<AdminGroup[]> => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("groups")
      .select("id, name, description, owner_id, is_open, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.openOnly !== false) query = query.eq("is_open", true);
    const q = (data.q ?? "").trim();
    if (q) query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);

    const { data: groups } = await query;
    const rows = groups ?? [];
    if (rows.length === 0) return [];

    const ids = rows.map((g) => g.id);
    const [{ data: owners }, { data: members }, { data: msgs }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, display_name").in("id", rows.map((g) => g.owner_id)),
      supabaseAdmin.from("group_members").select("group_id").in("group_id", ids),
      supabaseAdmin.from("group_messages").select("group_id").in("group_id", ids),
    ]);

    const ownerMap = new Map((owners ?? []).map((o) => [o.id, o.display_name]));
    const count = (list: { group_id: string }[] | null, id: string) =>
      (list ?? []).filter((r) => r.group_id === id).length;

    return rows.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description ?? "",
      owner_id: g.owner_id,
      owner_name: ownerMap.get(g.owner_id) ?? "不明",
      is_open: !!g.is_open,
      members: count(members, g.id),
      messages: count(msgs, g.id),
      created_at: g.created_at,
    }));
  });

// ルームを丸ごと削除（投稿・メンバー・申請も一緒に消える）
export const adminDeleteGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { groupId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("group_messages").delete().eq("group_id", data.groupId);
    await supabaseAdmin.from("group_members").delete().eq("group_id", data.groupId);
    await supabaseAdmin.from("group_join_requests").delete().eq("group_id", data.groupId);
    await supabaseAdmin.from("group_reads").delete().eq("group_id", data.groupId);
    await supabaseAdmin.from("reports").update({ group_id: null }).eq("group_id", data.groupId);
    const { error } = await supabaseAdmin.from("groups").delete().eq("id", data.groupId);
    if (error) throw new Error("ルームを削除できませんでした");
    return { ok: true };
  });

// ルームを非公開に切り替える（削除せず一覧から隠す）
export const adminSetGroupOpen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { groupId: string; isOpen: boolean }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("groups").update({ is_open: data.isOpen }).eq("id", data.groupId);
    return { ok: true };
  });

// ルーム内の投稿だけをすべて削除
export const adminClearGroupMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { groupId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("group_messages").delete().eq("group_id", data.groupId);
    return { ok: true };
  });

// ダッシュボード用の集計
export const adminStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [users, groups, messages, todayMessages, openReports, bans] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("groups").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("messages").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("messages").select("id", { count: "exact", head: true }).gte("created_at", since),
      supabaseAdmin.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabaseAdmin.from("user_bans").select("user_id", { count: "exact", head: true }),
    ]);

    return {
      users: users.count ?? 0,
      groups: groups.count ?? 0,
      messages: messages.count ?? 0,
      todayMessages: todayMessages.count ?? 0,
      openReports: openReports.count ?? 0,
      bans: bans.count ?? 0,
    };
  });
