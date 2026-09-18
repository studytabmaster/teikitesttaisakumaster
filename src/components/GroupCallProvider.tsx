import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { toast } from "sonner";
import { LOW_MEDIA_CONSTRAINTS, applyLowBitrate } from "@/lib/callQuality";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { GroupCallOverlay } from "@/components/GroupCallOverlay";
import { loadRtcConfig } from "@/lib/ice";

// グループ／オープンチャットのルーム通話（メッシュ方式）
// 同じルームに入った人同士を P2P でつないで、最大数人規模の音声・ビデオ通話を行う。

export type GroupCallStatus = "idle" | "joining" | "active";

export type RoomPeer = {
  id: string;
  stream: MediaStream | null;
};

type GroupCallContextValue = {
  status: GroupCallStatus;
  groupId: string | null;
  groupName: string;
  video: boolean;
  muted: boolean;
  cameraOff: boolean;
  seconds: number;
  peers: RoomPeer[];
  localStream: MediaStream | null;
  joinCall: (groupId: string, groupName: string, video: boolean) => Promise<void>;
  leaveCall: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
};

const GroupCallContext = createContext<GroupCallContextValue | null>(null);

// STUN/TURN はサーバーから取得した設定を使う

type SignalPayload = {
  from: string;
  to: string;
  kind: "offer" | "answer" | "ice";
  data: unknown;
};

export function GroupCallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<GroupCallStatus>("idle");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");
  const [video, setVideo] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [peers, setPeers] = useState<RoomPeer[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const iceQueue = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const announcedRef = useRef(false);
  const rtcConfigRef = useRef<RTCConfiguration | null>(null);

  const setPeerStream = useCallback((id: string, stream: MediaStream | null) => {
    setPeers((prev) => {
      const next = prev.filter((p) => p.id !== id);
      next.push({ id, stream });
      return next;
    });
  }, []);

  const sendSignal = useCallback((payload: SignalPayload) => {
    void channelRef.current?.send({ type: "broadcast", event: "signal", payload });
  }, []);

  const dropPeer = useCallback((id: string) => {
    pcsRef.current.get(id)?.close();
    pcsRef.current.delete(id);
    iceQueue.current.delete(id);
    setPeers((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const ensurePeer = useCallback(
    (peerId: string) => {
      const existing = pcsRef.current.get(peerId);
      if (existing) return existing;
      const pc = new RTCPeerConnection(rtcConfigRef.current ?? undefined);
      pcsRef.current.set(peerId, pc);

      localRef.current?.getTracks().forEach((t) => pc.addTrack(t, localRef.current!));
      void applyLowBitrate(pc);

      const remote = new MediaStream();
      pc.ontrack = (event) => {
        event.streams[0]?.getTracks().forEach((t) => {
          if (!remote.getTracks().some((x) => x.id === t.id)) remote.addTrack(t);
        });
        setPeerStream(peerId, new MediaStream(remote.getTracks()));
      };
      pc.onicecandidate = (event) => {
        if (event.candidate && user) {
          sendSignal({ from: user.id, to: peerId, kind: "ice", data: event.candidate.toJSON() });
        }
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") dropPeer(peerId);
      };
      setPeerStream(peerId, null);
      return pc;
    },
    [user, sendSignal, setPeerStream, dropPeer],
  );

  const cleanup = useCallback(() => {
    pcsRef.current.forEach((pc) => pc.close());
    pcsRef.current.clear();
    iceQueue.current.clear();
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    if (channelRef.current) void supabase.removeChannel(channelRef.current);
    channelRef.current = null;
    announcedRef.current = false;
    setLocalStream(null);
    setPeers([]);
    setStatus("idle");
    setGroupId(null);
    setGroupName("");
    setSeconds(0);
    setMuted(false);
    setCameraOff(false);
  }, []);

  const cleanupRef = useRef(cleanup);
  useEffect(() => {
    cleanupRef.current = cleanup;
  }, [cleanup]);

  const joinCall = useCallback(
    async (id: string, name: string, wantVideo: boolean) => {
      if (!user || status !== "idle") return;
      setGroupId(id);
      setGroupName(name);
      setVideo(wantVideo);
      setStatus("joining");
      rtcConfigRef.current = await loadRtcConfig();
      try {
        const stream = await navigator.mediaDevices.getUserMedia(LOW_MEDIA_CONSTRAINTS(wantVideo));
        localRef.current = stream;
        setLocalStream(stream);
      } catch {
        toast.error("カメラ・マイクを利用できませんでした");
        cleanup();
        return;
      }

      const channel = supabase.channel(`gcall-${id}`, {
        config: { presence: { key: user.id } },
      });
      channelRef.current = channel;

      channel.on("broadcast", { event: "signal" }, async ({ payload }) => {
        const signal = payload as SignalPayload;
        if (signal.to !== user.id || signal.from === user.id) return;
        const pc = ensurePeer(signal.from);

        if (signal.kind === "offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.data as RTCSessionDescriptionInit));
          for (const c of iceQueue.current.get(signal.from) ?? []) {
            await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
          }
          iceQueue.current.delete(signal.from);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal({ from: user.id, to: signal.from, kind: "answer", data: answer });
          return;
        }

        if (signal.kind === "answer") {
          await pc
            .setRemoteDescription(new RTCSessionDescription(signal.data as RTCSessionDescriptionInit))
            .catch(() => {});
          for (const c of iceQueue.current.get(signal.from) ?? []) {
            await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
          }
          iceQueue.current.delete(signal.from);
          return;
        }

        const candidate = signal.data as RTCIceCandidateInit;
        if (pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
        } else {
          const list = iceQueue.current.get(signal.from) ?? [];
          list.push(candidate);
          iceQueue.current.set(signal.from, list);
        }
      });

      channel.on("presence", { event: "sync" }, () => {
        const ids = Object.keys(channel.presenceState()).filter((x) => x !== user.id);
        setStatus("active");

        // 誰もいなければ「通話がはじまりました」をトークに残す（通知のきっかけにもなる）
        if (!announcedRef.current) {
          announcedRef.current = true;
          if (ids.length === 0) {
            void supabase.from("group_messages").insert({
              group_id: id,
              sender_id: user.id,
              content: wantVideo ? "video" : "audio",
              media_type: "call_start",
            });
          }
        }

        // 既に退出した相手を掃除
        pcsRef.current.forEach((_pc, peerId) => {
          if (!ids.includes(peerId)) dropPeer(peerId);
        });

        // 接続はIDの大小で発信側を決める（両者が同時に発信しないように）
        for (const peerId of ids) {
          if (pcsRef.current.has(peerId)) continue;
          if (user.id > peerId) {
            const pc = ensurePeer(peerId);
            void (async () => {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              sendSignal({ from: user.id, to: peerId, kind: "offer", data: offer });
            })();
          } else {
            ensurePeer(peerId);
          }
        }
      });

      channel.subscribe((state) => {
        if (state === "SUBSCRIBED") void channel.track({ joined_at: new Date().toISOString() });
      });
    },
    [user, status, cleanup, ensurePeer, sendSignal, dropPeer],
  );

  const leaveCall = useCallback(() => {
    cleanup();
  }, [cleanup]);

  useEffect(() => {
    if (status !== "active") return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => () => cleanupRef.current(), []);

  const toggleMute = useCallback(() => {
    const stream = localRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }, [muted]);

  const toggleCamera = useCallback(() => {
    const stream = localRef.current;
    if (!stream) return;
    const next = !cameraOff;
    stream.getVideoTracks().forEach((t) => (t.enabled = !next));
    setCameraOff(next);
  }, [cameraOff]);

  return (
    <GroupCallContext.Provider
      value={{
        status,
        groupId,
        groupName,
        video,
        muted,
        cameraOff,
        seconds,
        peers,
        localStream,
        joinCall,
        leaveCall,
        toggleMute,
        toggleCamera,
      }}
    >
      {children}
      <GroupCallOverlay />
    </GroupCallContext.Provider>
  );
}

export function useGroupCall() {
  const ctx = useContext(GroupCallContext);
  if (!ctx) throw new Error("useGroupCall must be used within GroupCallProvider");
  return ctx;
}
