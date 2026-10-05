import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  primeAudio,
  requestNotificationPermission,
  showIncomingCallNotification,
  showMessageNotification,
  startRingtone,
  stopRingtone,
} from "@/lib/notify";
import { useGroupCallOptional } from "@/components/GroupCallProvider";
import type { Group, Message, GroupMessage, Profile } from "@/lib/rine";

// 全画面共通の通知係
// - 1対1メッセージの新着
// - グループ／オープンチャットの新着とルーム通話の開始
// - ルームに参加できたとき（承認された／参加した）
export function Notifications() {
  const { user } = useAuth();
  const nameCache = useRef<Map<string, string>>(new Map());
  const groupNames = useRef<Map<string, string>>(new Map());
  const groupCall = useGroupCallOptional();
  const groupCallRef = useRef(groupCall);
  groupCallRef.current = groupCall;

  // ログイン後の最初の操作で通知の許可を求める
  useEffect(() => {
    if (!user) return;
    const ask = () => {
      void requestNotificationPermission();
      primeAudio();
      window.removeEventListener("pointerdown", ask);
    };
    window.addEventListener("pointerdown", ask);
    return () => window.removeEventListener("pointerdown", ask);
  }, [user]);

  const senderName = async (id: string) => {
    const cached = nameCache.current.get(id);
    if (cached) return cached;
    const { data } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", id)
      .maybeSingle();
    const name = (data as Pick<Profile, "display_name"> | null)?.display_name ?? "だれか";
    nameCache.current.set(id, name);
    return name;
  };

  const groupName = async (id: string) => {
    const cached = groupNames.current.get(id);
    if (cached) return cached;
    const { data } = await supabase.from("groups").select("name").eq("id", id).maybeSingle();
    const name = (data as Pick<Group, "name"> | null)?.name ?? "ルーム";
    groupNames.current.set(id, name);
    return name;
  };

  // 節約: 画面を離れて10分たったら通知用の接続を休止し、戻ったら即再開する
  const [active, setActive] = useState(true);
  // 接続が切れたときの自動再接続用（値が変わると購読をやり直す）
  const [retryKey, setRetryKey] = useState(0);
  const retryDelay = useRef(5000);
  useEffect(() => {
    let timer: number | undefined;
    const onVis = () => {
      window.clearTimeout(timer);
      if (document.visibilityState === "hidden") {
        timer = window.setTimeout(() => setActive(false), 10 * 60 * 1000);
      } else {
        setActive(true);
      }
    };
    const onOnline = () => setRetryKey((k) => k + 1);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onOnline);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  useEffect(() => {
    if (!user || !active) return;
    let cancelled = false;
    let retryTimer: number | undefined;
    // 切断・エラー時は 5秒→10秒→…最大2分 の間隔で自動再接続（サーバーに負担をかけない）
    const onStatus = (status: string) => {
      if (cancelled) return;
      if (status === "SUBSCRIBED") {
        retryDelay.current = 5000;
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        window.clearTimeout(retryTimer);
        const wait = retryDelay.current;
        retryDelay.current = Math.min(wait * 2, 120000);
        retryTimer = window.setTimeout(() => setRetryKey((k) => k + 1), wait);
      }
    };
    const myGroups = new Set<string>();

    // 通知対象は直近の20ルームまで（受信量を抑えてクラウド費用を節約）
    const loadGroups = async () => {
      const { data } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      for (const row of data ?? []) myGroups.add(row.group_id);
    };

    const channel = supabase
      .channel(`notify-${user.id}`)
      // 1対1の新着メッセージ
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${user.id}`,
        },
        async (payload) => {
          const m = payload.new as Message;
          if (m.sender_id === user.id) return;
          const from = await senderName(m.sender_id);
          const body =
            m.media_type === "missed_call"
              ? "不在着信"
              : m.image_url
                ? m.media_type === "video"
                  ? "動画が届きました"
                  : "画像が届きました"
                : m.content;
          showMessageNotification(from, body, `rine-dm-${m.sender_id}`);
          // 画面を見ているときはアプリ内トーストで知らせる（開いているトーク以外）
          if (
            typeof document !== "undefined" &&
            document.visibilityState === "visible" &&
            !window.location.pathname.includes(m.sender_id)
          ) {
            toast(from, { description: body });
          }
        },
      )
      // ルームに参加できたとき
      // ルームに参加できたとき
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_members",
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const row = payload.new as { group_id: string };
          myGroups.add(row.group_id);
          const room = await groupName(row.group_id);
          if (cancelled) return;
          toast.success(`「${room}」に参加しました`);
          showMessageNotification("RINE", `「${room}」に参加しました`, "rine-joined");
        },
      )
      // 参加申請が承認・却下されたとき
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "group_join_requests",
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const row = payload.new as { group_id: string; status: string };
          const room = await groupName(row.group_id);
          if (cancelled) return;
          if (row.status === "approved") {
            toast.success(`「${room}」への参加が承認されました`);
            showMessageNotification("RINE", `「${room}」への参加が承認されました`, "rine-approved");
          } else if (row.status === "rejected") {
            toast(`「${room}」への参加申請は承認されませんでした`);
          }
        },
      )
      .subscribe(onStatus);

    // グループ・オープンチャットの新着（見える範囲は参加中のルームだけ＝データベース側で制限）
    // 1本の購読で、あとから参加したルームも自動で対象になる
    let groupChannel: ReturnType<typeof supabase.channel> | null = null;
    void loadGroups();
    groupChannel = supabase
      .channel(`notify-groups-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "group_messages" },
        async (payload) => {
          const m = payload.new as GroupMessage;
          if (m.sender_id === user.id) return;
          const [room, from] = await Promise.all([groupName(m.group_id), senderName(m.sender_id)]);
          if (cancelled) return;
          if (m.media_type === "call_start") {
            if (groupCallRef.current && groupCallRef.current.status !== "idle") return;
            startRingtone();
            const stopAt = window.setTimeout(() => stopRingtone(), 30000);
            showIncomingCallNotification(`${from}（${room}）`, m.content === "video");
            toast(`「${room}」でルーム通話が始まりました`, {
              description: `${from} さんが通話を開始しました`,
              duration: 30000,
              action: {
                label: "参加",
                onClick: () => {
                  window.clearTimeout(stopAt);
                  stopRingtone();
                  void groupCallRef.current?.joinCall(m.group_id, room, m.content === "video");
                },
              },
              cancel: {
                label: "あとで",
                onClick: () => {
                  window.clearTimeout(stopAt);
                  stopRingtone();
                },
              },
              onDismiss: () => {
                window.clearTimeout(stopAt);
                stopRingtone();
              },
            });
            return;
          }
          if (m.media_type === "call_end" || m.media_type === "system") return;
          const body = m.image_url
            ? m.media_type === "video"
              ? `${from}：動画`
              : `${from}：画像`
            : `${from}：${m.content}`;
          showMessageNotification(room, body, `rine-group-${m.group_id}`);
          if (
            document.visibilityState === "visible" &&
            !window.location.pathname.includes(m.group_id)
          ) {
            toast(room, { description: body });
          }
        },
      )
      .subscribe(onStatus);

    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      void supabase.removeChannel(channel);
      if (groupChannel) void supabase.removeChannel(groupChannel);
    };
  }, [user, active, retryKey]);

  return null;
}
