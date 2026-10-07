import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/lib/rine";

// アイコン画像（avatar_url）は重いので、端末内(IndexedDB)に保存して使い回す。
// 毎回は軽い列＋avatar_key（画像の指紋）だけ取得し、指紋が変わった人の画像だけ取り直す。
const LIGHT_COLS =
  "id,display_name,friend_code,status_message,username,created_at,updated_at,adult_verified_at,birth_date,avatar_key";

const DB_NAME = "rine-avatar-cache";
const STORE = "avatars";
const mem = new Map<string, string | null>(); // avatar_key -> avatar_url

let dbPromise: Promise<IDBDatabase | null> | null = null;
function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

async function idbGetMany(keys: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const db = await openDb();
  if (!db || keys.length === 0) return out;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const st = tx.objectStore(STORE);
    for (const k of keys) {
      const r = st.get(k);
      r.onsuccess = () => {
        if (r.result !== undefined) out.set(k, r.result as string | null);
      };
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
  return out;
}

async function idbPutMany(entries: [string, string | null][]) {
  const db = await openDb();
  if (!db || entries.length === 0) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    const st = tx.objectStore(STORE);
    for (const [k, v] of entries) st.put(v, k);
  } catch {
    /* 容量超過などは無視 */
  }
}

type LightRow = Omit<Profile, "avatar_url"> & { avatar_key: string | null };

export async function fetchProfiles(ids: string[]): Promise<Profile[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];
  const { data, error } = await supabase.from("profiles").select(LIGHT_COLS).in("id", unique);
  if (error || !data) return [];
  const rows = data as unknown as LightRow[];

  const keys = [...new Set(rows.map((r) => r.avatar_key).filter((k): k is string => !!k))];
  const missingMem = keys.filter((k) => !mem.has(k));
  const fromIdb = await idbGetMany(missingMem);
  fromIdb.forEach((v, k) => mem.set(k, v));

  const needIds = rows.filter((r) => r.avatar_key && !mem.has(r.avatar_key)).map((r) => r.id);
  if (needIds.length > 0) {
    const { data: avatars } = await supabase
      .from("profiles")
      .select("id,avatar_url,avatar_key")
      .in("id", needIds);
    const puts: [string, string | null][] = [];
    for (const a of (avatars ?? []) as { avatar_url: string | null; avatar_key: string | null }[]) {
      if (!a.avatar_key) continue;
      mem.set(a.avatar_key, a.avatar_url);
      puts.push([a.avatar_key, a.avatar_url]);
    }
    void idbPutMany(puts);
  }

  return rows.map(({ avatar_key, ...rest }) => ({
    ...(rest as Omit<Profile, "avatar_url">),
    avatar_url: avatar_key ? (mem.get(avatar_key) ?? null) : null,
  })) as Profile[];
}

export async function fetchProfile(id: string): Promise<Profile | null> {
  const [p] = await fetchProfiles([id]);
  return p ?? null;
}
