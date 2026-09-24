export type Profile = {
  id: string;
  display_name: string;
  status_message: string;
  avatar_url: string | null;
  friend_code: string;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  image_url: string | null;
  media_type?: string | null;
  read_at: string | null;
  created_at: string;
  reply_to_id?: string | null;
};


export type CallSignal = {
  id: string;
  from_user: string;
  to_user: string;
  kind: "offer" | "answer" | "ice" | "end" | "reject";
  payload: unknown;
  video: boolean;
  created_at: string;
};

export function initials(name: string) {
  return name.trim().slice(0, 2) || "??";
}

// 端末のタイムゾーン設定に左右されないよう、日本時間で表示する
const TZ = "Asia/Tokyo";

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

export function formatListTime(iso: string) {
  const d = new Date(iso);
  const day = (x: Date) => x.toLocaleDateString("ja-JP", { timeZone: TZ });
  if (day(d) === day(new Date())) return formatTime(iso);
  return d.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", timeZone: TZ });
}

export function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

export type Group = {
  id: string;
  name: string;
  avatar_url: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
  is_open?: boolean;
  description?: string;
  requires_approval?: boolean;
};

export type JoinRequest = {
  id: string;
  group_id: string;
  user_id: string;
  message: string;
  status: string;
  created_at: string;
};

export type GroupMember = {
  id: string;
  group_id: string;
  user_id: string;
  created_at: string;
};

export type GroupMessage = {
  id: string;
  group_id: string;
  sender_id: string;
  content: string;
  image_url: string | null;
  media_type?: string | null;
  created_at: string;
  reply_to_id?: string | null;
};

export type GroupRead = {
  group_id: string;
  user_id: string;
  last_read_at: string;
};

