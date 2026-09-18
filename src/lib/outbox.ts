// オフライン時のメッセージ送信キュー。
// 送れなかったテキストメッセージを localStorage に保存し、
// オンラインに戻ったら順番に送信する（スマホアプリと同じ挙動）。

import { supabase } from "@/integrations/supabase/client";

export type PendingMessage = {
  id: string;
  kind: "direct" | "group";
  senderId: string;
  targetId: string;
  content: string;
  createdAt: string;
};

const KEY = "rine-outbox";
const EVENT = "rine-outbox-change";

function read(): PendingMessage[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as PendingMessage[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: PendingMessage[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* 保存できない環境は無視 */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

export function getOutbox(): PendingMessage[] {
  return read();
}

export function getOutboxFor(kind: PendingMessage["kind"], targetId: string) {
  return read().filter((m) => m.kind === kind && m.targetId === targetId);
}

export function enqueueMessage(
  item: Omit<PendingMessage, "id" | "createdAt">,
): PendingMessage {
  const full: PendingMessage = {
    ...item,
    id: `pending-${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
  };
  write([...read(), full]);
  return full;
}

export function removeFromOutbox(id: string) {
  write(read().filter((m) => m.id !== id));
}

export function onOutboxChange(fn: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}

let flushing = false;

/** 送信待ちをまとめて送る。送れた件数を返す。 */
export async function flushOutbox(): Promise<number> {
  if (flushing) return 0;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return 0;
  const items = read();
  if (items.length === 0) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const item of items) {
      const { error } =
        item.kind === "direct"
          ? await supabase.from("messages").insert({
              sender_id: item.senderId,
              receiver_id: item.targetId,
              content: item.content,
            })
          : await supabase.from("group_messages").insert({
              group_id: item.targetId,
              sender_id: item.senderId,
              content: item.content,
            });
      if (error) {
        // ネットワーク以外の理由（ブロック等）で送れないものは破棄して詰まりを防ぐ
        const offline = typeof navigator !== "undefined" && navigator.onLine === false;
        if (offline) break;
        removeFromOutbox(item.id);
        continue;
      }
      removeFromOutbox(item.id);
      sent += 1;
    }
  } finally {
    flushing = false;
  }
  return sent;
}
