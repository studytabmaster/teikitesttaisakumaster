import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SCOPE = "https://www.googleapis.com/auth/youtube.readonly openid profile";

function creds() {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Google OAuth not configured");
  return { id, secret };
}

export const ytDeviceStart = createServerFn({ method: "POST" }).handler(async () => {
  const { id } = creds();
  const res = await fetch("https://oauth2.googleapis.com/device/code", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, scope: SCOPE }),
  });
  const j: any = await res.json();
  if (!res.ok) return { error: String(j.error_description || j.error || "start failed") };
  return {
    device_code: String(j.device_code),
    user_code: String(j.user_code),
    verification_url: String(j.verification_url || "https://www.google.com/device"),
    interval: Number(j.interval || 5),
  };
});

async function tokenRequest(params: Record<string, string>) {
  const { id, secret } = creds();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, ...params }),
  });
  return { ok: res.ok, j: (await res.json()) as any };
}

async function profile(access: string) {
  const r = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
    headers: { Authorization: `Bearer ${access}` },
  });
  const j: any = await r.json();
  const s = j.items?.[0]?.snippet;
  return {
    name: String(s?.title || "YouTube ユーザー"),
    handle: String(s?.customUrl || ""),
    avatar: String(s?.thumbnails?.default?.url || ""),
  };
}

export const ytDevicePoll = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ device_code: z.string().min(1).max(500) }).parse(d))
  .handler(async ({ data }) => {
    const { ok, j } = await tokenRequest({
      device_code: data.device_code,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });
    if (!ok) return { status: String(j.error || "error") }; // authorization_pending / slow_down / access_denied / expired_token
    const p = await profile(j.access_token);
    return {
      status: "ok",
      access_token: String(j.access_token),
      refresh_token: String(j.refresh_token || ""),
      expires_at: Date.now() + Number(j.expires_in || 3600) * 1000,
      ...p,
    };
  });

export const ytRefresh = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ refresh_token: z.string().min(1).max(1000) }).parse(d))
  .handler(async ({ data }) => {
    const { ok, j } = await tokenRequest({ refresh_token: data.refresh_token, grant_type: "refresh_token" });
    if (!ok) return { error: String(j.error || "refresh failed") };
    return { access_token: String(j.access_token), expires_at: Date.now() + Number(j.expires_in || 3600) * 1000 };
  });

// 登録チャンネルの最新動画（ページトークン対応）
export const ytSubsFeed = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ access_token: z.string().min(1).max(4000), pageToken: z.string().max(200).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const h = { Authorization: `Bearer ${data.access_token}` };
    const subsUrl = new URL("https://www.googleapis.com/youtube/v3/subscriptions");
    subsUrl.search = new URLSearchParams({
      part: "snippet", mine: "true", maxResults: "8", order: "relevance",
      ...(data.pageToken ? { pageToken: data.pageToken } : {}),
    }).toString();
    const sr = await fetch(subsUrl, { headers: h });
    const sj: any = await sr.json();
    if (!sr.ok) return { error: String(sj.error?.message || "feed failed"), items: [], nextPageToken: null };
    const chIds: string[] = (sj.items || []).map((i: any) => i.snippet?.resourceId?.channelId).filter(Boolean);
    const lists = await Promise.all(
      chIds.map(async (c) => {
        const u = `https://www.googleapis.com/youtube/v3/activities?part=snippet,contentDetails&channelId=${c}&maxResults=3`;
        const r = await fetch(u, { headers: h });
        const j: any = await r.json();
        return (j.items || [])
          .filter((a: any) => a.contentDetails?.upload?.videoId)
          .map((a: any) => ({
            id: String(a.contentDetails.upload.videoId),
            title: String(a.snippet?.title || ""),
            author: String(a.snippet?.channelTitle || ""),
            publishedText: String(a.snippet?.publishedAt || "").slice(0, 10),
            viewCountText: "",
          }));
      }),
    );
    return { items: lists.flat(), nextPageToken: (sj.nextPageToken as string) || null };
  });
