import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// YouTube の内部検索をサーバー側から呼ぶ（APIキー不要・CORSなし）
const CONTEXT = { client: { clientName: "WEB", clientVersion: "2.20241101.00.00", hl: "ja", gl: "JP" } };

type Item = {
  id: string;
  title: string;
  author: string;
  publishedText: string;
  viewCountText: string;
  durationText?: string;
};

function collect(o: any, videos: Item[], conts: string[]) {
  if (Array.isArray(o)) {
    for (const v of o) collect(v, videos, conts);
    return;
  }
  if (!o || typeof o !== "object") return;
  const vr = o.videoRenderer;
  if (vr?.videoId) {
    videos.push({
      id: String(vr.videoId),
      title: String(vr.title?.runs?.[0]?.text ?? ""),
      author: String(vr.ownerText?.runs?.[0]?.text ?? ""),
      publishedText: String(vr.publishedTimeText?.simpleText ?? ""),
      viewCountText: String(vr.viewCountText?.simpleText ?? vr.viewCountText?.runs?.map((r: any) => r.text).join("") ?? ""),
      durationText: vr.lengthText?.simpleText ? String(vr.lengthText.simpleText) : undefined,
    });
    return;
  }
  const ci = o.continuationItemRenderer;
  const tok = ci?.continuationEndpoint?.continuationCommand?.token;
  if (tok) conts.push(String(tok));
  for (const k in o) collect(o[k], videos, conts);
}

export const ytSearch = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({ q: z.string().max(200).optional(), continuation: z.string().max(2000).optional() })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const body = data.continuation
      ? { context: CONTEXT, continuation: data.continuation }
      : { context: CONTEXT, query: data.q || "おすすめ", params: "EgIQAQ%3D%3D" };
    try {
      const res = await fetch("https://www.youtube.com/youtubei/v1/search?prettyPrint=false", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return { items: [] as Item[], continuation: null as string | null, error: `status ${res.status}` };
      const j = await res.json();
      const items: Item[] = [];
      const conts: string[] = [];
      collect(j, items, conts);
      return { items, continuation: conts[conts.length - 1] ?? null, error: null as string | null };
    } catch (e) {
      return { items: [] as Item[], continuation: null as string | null, error: String(e) };
    }
  });
