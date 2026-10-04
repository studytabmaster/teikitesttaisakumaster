import { supabase } from "@/integrations/supabase/client";

const TTL_SECONDS = 60 * 60 * 24; // 24h
const REFRESH_MARGIN_MS = 60 * 60 * 1000; // 1h前に作り直す
const STORAGE_KEY = "rine:media-url-cache:v1";

type Entry = { url: string; expiresAt: number };

const memory = new Map<string, Entry>();
const inflight = new Map<string, Promise<string | null>>();

function loadPersisted(): Record<string, Entry> {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, Entry>;
  } catch {
    return {};
  }
}

let persisted: Record<string, Entry> | null = null;

function getPersisted(path: string): Entry | undefined {
  if (!persisted) persisted = loadPersisted();
  return persisted[path];
}

function savePersisted(path: string, entry: Entry) {
  if (typeof localStorage === "undefined") return;
  if (!persisted) persisted = loadPersisted();
  persisted[path] = entry;
  // 古いものを掃除して肥大化を防ぐ
  const now = Date.now();
  for (const [k, v] of Object.entries(persisted)) {
    if (v.expiresAt < now) delete persisted[k];
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    /* 容量超過は無視 */
  }
}

function fresh(entry: Entry | undefined): entry is Entry {
  return !!entry && entry.expiresAt - REFRESH_MARGIN_MS > Date.now();
}

/** 署名付きURLを取得。外部URL（Cloudinary等）はそのまま返し、Supabase画像はキャッシュしてAPI呼び出しを抑える。 */
export async function getMediaUrl(path: string): Promise<string | null> {
  // Cloudinaryなど外部直URLの場合はそのまま返す
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  const cached = memory.get(path) ?? getPersisted(path);
  if (fresh(cached)) {
    memory.set(path, cached);
    return cached.url;
  }

  const running = inflight.get(path);
  if (running) return running;

  const task = (async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabase.storage
        .from("chat-images")
        .createSignedUrl(path, TTL_SECONDS);
      if (data?.signedUrl) {
        const entry: Entry = { url: data.signedUrl, expiresAt: Date.now() + TTL_SECONDS * 1000 };
        memory.set(path, entry);
        savePersisted(path, entry);
        return data.signedUrl;
      }
      if (!error) break;
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
    return null;
  })().finally(() => inflight.delete(path));

  inflight.set(path, task);
  return task;
}

/** 取り消し・削除したファイルのキャッシュを捨てる */
export function forgetMediaUrl(path: string) {
  memory.delete(path);
  inflight.delete(path);
  if (typeof localStorage === "undefined") return;
  if (!persisted) persisted = loadPersisted();
  delete persisted[path];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    /* 無視 */
  }
}

export function mediaFileName(path: string) {
  return path.split("/").pop() || "rine-media";
}

export async function downloadMedia(path: string) {
  const url = await getMediaUrl(path);
  if (!url) return false;
  const res = await fetch(url);
  if (!res.ok) return false;
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = mediaFileName(path);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  return true;
}
