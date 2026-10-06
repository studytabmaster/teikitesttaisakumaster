import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Role = "admin" | "moderator";
let cache: Map<string, Role> | null = null;
let pending: Promise<Map<string, Role>> | null = null;
const listeners = new Set<() => void>();

// スタッフ一覧は1回だけ読み込み、全画面で使い回す（通信を最小限に）
function loadStaff() {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = (async () => {
      const { data } = await supabase.rpc("get_staff_ids");
      const m = new Map<string, Role>();
      for (const r of (data ?? []) as { user_id: string; role: Role }[]) {
        if (r.role === "admin" || !m.has(r.user_id)) m.set(r.user_id, r.role);
      }
      cache = m;
      listeners.forEach((l) => l());
      return m;
    })().catch(() => {
      pending = null;
      return new Map<string, Role>();
    });
  }
  return pending;
}

export function useStaffRole(userId?: string | null): Role | null {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    void loadStaff();
    return () => {
      listeners.delete(l);
    };
  }, []);
  if (!userId || !cache) return null;
  return cache.get(userId) ?? null;
}

// Roblox風の公式認証バッジ（ギザギザの星型＋チェック）
export function StaffBadge({ userId, size = 16 }: { userId?: string | null; size?: number }) {
  const role = useStaffRole(userId);
  if (!role) return null;
  const label = role === "admin" ? "RINE公式・管理者" : "RINE公式・スタッフ";
  return (
    <span
      title={label}
      aria-label={label}
      className="ml-1 inline-flex shrink-0 align-[-2px]"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" width={size} height={size}>
        <path
          fill={role === "admin" ? "#1D9BF0" : "#16A34A"}
          d="M12 1.5l2.4 1.8 3-.3 1.2 2.8 2.8 1.2-.3 3 1.8 2.4-1.8 2.4.3 3-2.8 1.2-1.2 2.8-3-.3L12 22.5l-2.4-1.8-3 .3-1.2-2.8-2.8-1.2.3-3L1.1 12l1.8-2.4-.3-3 2.8-1.2L6.6 2.6l3 .3z"
        />
        <path d="M7.5 12.3l3 3 6-6.3" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
