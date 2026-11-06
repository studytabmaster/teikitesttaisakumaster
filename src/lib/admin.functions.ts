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
  muted_until: string | null;
};

// 呼び出し元が管理者かどうかを確認する
async function assertAdmin(supabase: { rpc: (fn: string, args: unknown) => Promise<{ data: unknown }> }, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (data !== true) throw new Error("管理者のみ操作できます");
}

// スタッフ（管理者 or モデレーター）かどうか
async function getStaffRole(
  supabase: { rpc: (fn: string, args: unknown) => Promise<{ data: unknown }> },
  userId: string,
): Promise<"admin" | "moderator" | null> {
  const { data: a } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (a === true) return "admin";
  const { data: m } = await supabase.rpc("has_role", { _user_id: userId, _role: "moderator" });
  return m === true ? "moderator" : null;
}

async function assertStaff(supabase: never, userId: string) {
  const role = await getStaffRole(supabase, userId);
  if (!role) throw new Error("運営スタッフのみ操作できます");
  return role;
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// パスワード入力で権限を付与（マスターパスワード or 管理者が発行した役職別パスワード）
export const unlockAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { password: string }) => input)
  .handler(async ({ data, context }): Promise<{ ok: true; role: "admin" | "moderator" }> => {
    const given = (data.password ?? "").trim();
    if (given.length === 0) throw new Error("パスワードを入力してください");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const expected = process.env["ADMIN_PASSWORD"];
    if (expected && given === expected) {
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: context.userId, role: "admin" }, { onConflict: "user_id,role" });
      return { ok: true, role: "admin" };
    }

    const hash = await sha256(given.toUpperCase());
    const { data: pc } = await supabaseAdmin
      .from("role_passcodes")
      .select("*")
      .eq("code_hash", hash)
      .maybeSingle();
    if (
      !pc ||
      pc.revoked ||
      pc.used_count >= pc.max_uses ||
      (pc.expires_at && new Date(pc.expires_at).getTime() < Date.now())
    ) {
      throw new Error("パスワードが違うか、有効期限切れです");
    }
    if (pc.role !== "admin" && pc.role !== "moderator") throw new Error("無効なパスワードです");

    await supabaseAdmin
      .from("role_passcodes")
      .update({ used_count: pc.used_count + 1, last_used_at: new Date().toISOString() })
      .eq("id", pc.id);
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: context.userId, role: pc.role }, { onConflict: "user_id,role" });
    return { ok: true, role: pc.role };
  });

// 自分の役職
export const getMyStaffRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => getStaffRole(context.supabase as never, context.userId));

export type RolePasscode = {
  id: string;
  role: "admin" | "moderator" | "user";
  label: string;
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  revoked: boolean;
  created_at: string;
  last_used_at: string | null;
};

// 役職別パスワード発行（管理者のみ）。平文は発行時に1回だけ返す
export const adminCreatePasscode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { role: "admin" | "moderator"; label?: string; maxUses?: number; days?: number }) => input,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    if (data.role !== "admin" && data.role !== "moderator") throw new Error("役職が不正です");
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    let raw = "";
    for (const b of bytes) raw += chars[b % chars.length];
    const code = `${data.role === "admin" ? "ADM" : "MOD"}-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
    const maxUses = Math.min(Math.max(Math.floor(data.maxUses ?? 1), 1), 100);
    const days = Math.floor(data.days ?? 7);
    const expires_at = days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("role_passcodes").insert({
      code_hash: await sha256(code),
      role: data.role,
      label: (data.label ?? "").trim().slice(0, 60),
      max_uses: maxUses,
      expires_at,
      created_by: context.userId,
    });
    if (error) throw new Error("発行に失敗しました");
    return { code };
  });

export const adminListPasscodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RolePasscode[]> => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("role_passcodes")
      .select("id, role, label, max_uses, used_count, expires_at, revoked, created_at, last_used_at")
      .order("created_at", { ascending: false })
      .limit(100);
    return (data ?? []) as RolePasscode[];
  });

export const adminRevokePasscode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("role_passcodes").update({ revoked: true }).eq("id", data.id);
    return { ok: true };
  });

// ユーザー一覧（名前・ID で検索）
export const adminListUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { q?: string }) => input)
  .handler(async ({ data, context }): Promise<AdminUser[]> => {
    await assertStaff(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("profiles")
      .select("id, display_name, username, friend_code, avatar_url, created_at")
      .order("created_at", { ascending: false })
      .limit(150);
    const q = (data.q ?? "").trim();
    if (q) query = query.or(`display_name.ilike.%${q}%,username.ilike.%${q}%,friend_code.ilike.%${q}%`);

    const { data: profiles } = await query;
    const rows = profiles ?? [];
    const ids = rows.map((p) => p.id);
    if (ids.length === 0) return [];

    const [{ data: roles }, { data: bans }, { data: mutes }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
      supabaseAdmin.from("user_bans").select("user_id, reason, until").in("user_id", ids),
      supabaseAdmin.from("user_mutes").select("user_id, until").in("user_id", ids),
    ]);
    const muteMap = new Map((mutes ?? []).map((m) => [m.user_id, m.until]));

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
        muted_until: (() => {
          const u = muteMap.get(p.id);
          return u && new Date(u).getTime() > Date.now() ? u : null;
        })(),
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
    const myRole = await assertStaff(context.supabase as never, context.userId);
    if (myRole === "moderator") {
      const targetRole = await getStaffRole(context.supabase as never, data.userId);
      if (targetRole) throw new Error("モデレーターは運営スタッフを停止できません");
    }
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
    await assertStaff(context.supabase as never, context.userId);
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
    await assertStaff(context.supabase as never, context.userId);
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

// ルームを丸ごと削除
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

// ルームを非公開に切り替える
export const adminSetGroupOpen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { groupId: string; isOpen: boolean }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("groups").update({ is_open: data.isOpen }).eq("id", data.groupId);
    return { ok: true };
  });

// ルーム内の投稿だけをすべて削除
export const adminClearGroupMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { groupId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("group_messages").delete().eq("group_id", data.groupId);
    return { ok: true };
  });

export type AdminMessage = {
  id: string;
  kind: "direct" | "group";
  sender_id: string;
  sender_name: string;
  content: string;
  media_type: string | null;
  group_name: string | null;
  created_at: string;
};

// 投稿を本文で検索
export const adminSearchMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { q?: string }) => input)
  .handler(async ({ data, context }): Promise<AdminMessage[]> => {
    await assertStaff(context.supabase as never, context.userId);
    const q = (data.q ?? "").trim();
    if (!q) return [];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: dMsgs }, { data: gMsgs }] = await Promise.all([
      supabaseAdmin
        .from("messages")
        .select("id, sender_id, content, media_type, created_at")
        .ilike("content", `%${q}%`)
        .order("created_at", { ascending: false })
        .limit(40),
      supabaseAdmin
        .from("group_messages")
        .select("id, sender_id, content, media_type, group_id, created_at")
        .ilike("content", `%${q}%`)
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

    const senderIds = Array.from(
      new Set([...(dMsgs ?? []).map((m) => m.sender_id), ...(gMsgs ?? []).map((m) => m.sender_id)]),
    );
    const groupIds = Array.from(new Set((gMsgs ?? []).map((m) => m.group_id)));

    const [{ data: senders }, { data: groups }] = await Promise.all([
      senderIds.length > 0
        ? supabaseAdmin.from("profiles").select("id, display_name").in("id", senderIds)
        : Promise.resolve({ data: [] }),
      groupIds.length > 0
        ? supabaseAdmin.from("groups").select("id, name").in("id", groupIds)
        : Promise.resolve({ data: [] }),
    ]);

    const senderMap = new Map((senders ?? []).map((s) => [s.id, s.display_name]));
    const groupMap = new Map((groups ?? []).map((g) => [g.id, g.name]));

    const direct: AdminMessage[] = (dMsgs ?? []).map((m) => ({
      id: m.id,
      kind: "direct",
      sender_id: m.sender_id,
      sender_name: senderMap.get(m.sender_id) ?? "不明",
      content: m.content,
      media_type: m.media_type,
      group_name: null,
      created_at: m.created_at,
    }));

    const group: AdminMessage[] = (gMsgs ?? []).map((m) => ({
      id: m.id,
      kind: "group",
      sender_id: m.sender_id,
      sender_name: senderMap.get(m.sender_id) ?? "不明",
      content: m.content,
      media_type: m.media_type,
      group_name: groupMap.get(m.group_id) ?? "不明なルーム",
      created_at: m.created_at,
    }));

    return [...direct, ...group].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  });

// 投稿を1件削除
export const adminDeleteMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { kind: "direct" | "group"; id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.kind === "direct") {
      await supabaseAdmin.from("messages").delete().eq("id", data.id);
    } else {
      await supabaseAdmin.from("group_messages").delete().eq("id", data.id);
    }
    return { ok: true };
  });

// 統計情報の取得
export const adminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      { count: users },
      { count: groups },
      { count: openGroups },
      { count: dMsgs },
      { count: gMsgs },
      { count: todayDMsgs },
      { count: todayGMsgs },
      { count: reports },
      { count: bans },
      { count: invites },
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("groups").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("groups").select("id", { count: "exact", head: true }).eq("is_open", true),
      supabaseAdmin.from("messages").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("group_messages").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .gte("created_at", todayStart.toISOString()),
      supabaseAdmin
        .from("group_messages")
        .select("id", { count: "exact", head: true })
        .gte("created_at", todayStart.toISOString()),
      supabaseAdmin.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabaseAdmin.from("user_bans").select("user_id", { count: "exact", head: true }),
      supabaseAdmin.from("invitations").select("id", { count: "exact", head: true }),
    ]);

    return {
      users: users ?? 0,
      groups: groups ?? 0,
      openGroups: openGroups ?? 0,
      messages: (dMsgs ?? 0) + (gMsgs ?? 0),
      todayMessages: (todayDMsgs ?? 0) + (todayGMsgs ?? 0),
      openReports: reports ?? 0,
      bans: bans ?? 0,
      invites: invites ?? 0,
    };
  });

// 招待リーダーボード（ランキングTOP100）
export type InviteLeaderboardItem = {
  user_id: string;
  display_name: string;
  friend_code: string;
  avatar_url: string | null;
  invite_count: number;
};

export const adminGetInviteLeaderboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InviteLeaderboardItem[]> => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin.rpc("get_invite_leaderboard");
    if (error || !data) return [];
    return data as InviteLeaderboardItem[];
  });

// 不正招待の削除
export const adminRevokeInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { invitedId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("invitations").delete().eq("invited_id", data.invitedId);
    return { ok: true };
  });

// 全ユーザー向けアナウンスの公開
export const adminPublishAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { content: string; pollOptions?: string[] }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const content = (data.content ?? "").trim();
    if (!content) throw new Error("アナウンス本文を入力してください");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      content,
      pollOptions: data.pollOptions && data.pollOptions.length >= 2 ? data.pollOptions : null,
      publishedAt: new Date().toISOString(),
      publishedBy: context.userId,
    };

    await supabaseAdmin.from("app_state").upsert({
      key: "active_announcement",
      last_run_at: new Date().toISOString(),
    });

    const channel = supabaseAdmin.channel("system-announcements");
    await channel.send({
      type: "broadcast",
      event: "new_announcement",
      payload,
    });

    return { ok: true };
  });

// アナウンスの終了
export const adminCloseAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("app_state").delete().eq("key", "active_announcement");

    const channel = supabaseAdmin.channel("system-announcements");
    await channel.send({
      type: "broadcast",
      event: "close_announcement",
      payload: {},
    });

    return { ok: true };
  });

export type AnnouncementData = {
  id: string;
  active: boolean;
  content: string;
  pollOptions: string[] | null;
  pollCounts: number[] | null;
  hasVotedIndex: number | null;
};

export const getActiveAnnouncement = createServerFn({ method: "GET" }).handler(
  async (): Promise<AnnouncementData | null> => {
    return null;
  },
);

export const voteAnnouncement = createServerFn({ method: "POST" })
  .inputValidator((input: { optionIndex: number }) => input)
  .handler(async ({ data }) => {
    return { pollCounts: [] as number[], hasVotedIndex: data.optionIndex as number | null };
  });

// オープンチャットへの一斉アナウンス送信
export const adminBroadcastToOpenGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { message: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const text = (data.message ?? "").trim();
    if (!text) throw new Error("本文を入力してください");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: groups } = await supabaseAdmin.from("groups").select("id").eq("is_open", true);
    const openGroups = groups ?? [];
    if (openGroups.length === 0) return { count: 0 };

    const rows = openGroups.map((g) => ({
      group_id: g.id,
      sender_id: context.userId,
      content: `📢【運営アナウンス】\n${text}`,
      media_type: "text",
    }));

    await supabaseAdmin.from("group_messages").insert(rows);
    return { count: rows.length };
  });

// 一時ミュート（スタッフ）。minutes=0で解除
export const adminSetMute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; minutes: number; reason?: string }) => input)
  .handler(async ({ data, context }) => {
    const myRole = await assertStaff(context.supabase as never, context.userId);
    if (data.userId === context.userId) throw new Error("自分はミュートできません");
    const target = await getStaffRole(context.supabase as never, data.userId);
    if (target === "admin" || (target === "moderator" && myRole !== "admin"))
      throw new Error("この相手はミュートできません");
    const minutes = Math.min(Math.max(Math.floor(data.minutes || 0), 0), 60 * 24 * 7);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const until = new Date(Date.now() + minutes * 60000).toISOString();
    const { error } = await supabaseAdmin.from("user_mutes").upsert(
      {
        user_id: data.userId,
        until,
        reason: minutes ? (data.reason ?? "運営による一時ミュート").slice(0, 100) : "",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error("ミュートの設定に失敗しました");
    return { ok: true, until: minutes ? until : null };
  });

export type StaffMember = {
  user_id: string;
  role: "admin" | "moderator";
  display_name: string;
  friend_code: string;
  avatar_url: string | null;
  since: string;
};

// スタッフ一覧（管理者のみ）
export const adminListStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StaffMember[]> => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role, created_at")
      .in("role", ["admin", "moderator"]);
    const ids = [...new Set((roles ?? []).map((r) => r.user_id))];
    if (ids.length === 0) return [];
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, friend_code, avatar_url")
      .in("id", ids);
    const pm = new Map((profs ?? []).map((p) => [p.id, p]));
    const best = new Map<string, StaffMember>();
    for (const r of roles ?? []) {
      const prev = best.get(r.user_id);
      if (prev && prev.role === "admin") continue;
      const p = pm.get(r.user_id);
      best.set(r.user_id, {
        user_id: r.user_id,
        role: r.role as "admin" | "moderator",
        display_name: p?.display_name ?? "（不明）",
        friend_code: p?.friend_code ?? "",
        avatar_url: p?.avatar_url ?? null,
        since: r.created_at,
      });
    }
    return [...best.values()].sort((a, b) => (a.role === b.role ? 0 : a.role === "admin" ? -1 : 1));
  });

export type AdminReport = {
  id: string;
  reporter_id: string;
  reported_id: string;
  reason: string;
  detail: string;
  reported_code: string | null;
  context: string;
  group_id: string | null;
  status: string;
  created_at: string;
  reporter_name: string;
  reported_name: string;
  reported_friend_code: string;
  reported_report_count: number;
};

// 通報一覧（スタッフ全員）
export const adminListReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { status?: string }) => input)
  .handler(async ({ data, context }): Promise<AdminReport[]> => {
    await assertStaff(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("reports").select("*").order("created_at", { ascending: false }).limit(200);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error("通報を読み込めませんでした");
    const list = rows ?? [];
    const ids = Array.from(new Set(list.flatMap((r) => [r.reporter_id, r.reported_id])));
    const { data: profs } = ids.length
      ? await supabaseAdmin.from("profiles").select("id, display_name, friend_code").in("id", ids)
      : { data: [] as { id: string; display_name: string; friend_code: string }[] };
    const pm = new Map((profs ?? []).map((p) => [p.id, p]));
    const counts = new Map<string, number>();
    for (const r of list) counts.set(r.reported_id, (counts.get(r.reported_id) ?? 0) + 1);
    return list.map((r) => ({
      ...(r as unknown as AdminReport),
      reporter_name: pm.get(r.reporter_id)?.display_name ?? "不明",
      reported_name: pm.get(r.reported_id)?.display_name ?? "不明",
      reported_friend_code: pm.get(r.reported_id)?.friend_code ?? "",
      reported_report_count: counts.get(r.reported_id) ?? 1,
    }));
  });

// 通報の対応状況を変更（スタッフ全員）
export const adminUpdateReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[]; status: "open" | "reviewing" | "resolved" }) => input)
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase as never, context.userId);
    if (!["open", "reviewing", "resolved"].includes(data.status)) throw new Error("不正な状態です");
    const ids = data.ids.slice(0, 200);
    if (!ids.length) return { ok: true };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("reports").update({ status: data.status }).in("id", ids);
    if (error) throw new Error("更新できませんでした");
    return { ok: true };
  });
