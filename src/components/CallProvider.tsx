import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { CallSignal, Profile } from "@/lib/rine";
import { CallOverlay } from "@/components/CallOverlay";
import { loadRtcConfig } from "@/lib/ice";
import { toast } from "sonner";
import {
  requestNotificationPermission,
  showIncomingCallNotification,
  startRingtone,
  stopRingtone,
} from "@/lib/notify";

export type CallStatus = "idle" | "calling" | "incoming" | "connecting" | "active";

type CallState = {
  status: CallStatus;
  peer: Profile | null;
  video: boolean;
  muted: boolean;
  cameraOff: boolean;
  seconds: number;
};

type CallContextValue = CallState & {
  startCall: (peer: Profile, video: boolean) => Promise<void>;
  acceptCall: () => Promise<void>;
  hangUp: (notify?: boolean) => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
};

const CallContext = createContext<CallContextValue | null>(null);

// STUN/TURN は loadRtcConfig() でサーバーから取得（TURN 経由で厳しい回線でもつながる）

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<CallStatus>("idle");
  const [peer, setPeer] = useState<Profile | null>(null);
  const [video, setVideo] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const peerIdRef = useRef<string | null>(null);
  const pendingOffer = useRef<RTCSessionDescriptionInit | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);

  const sendSignal = useCallback(
    async (kind: CallSignal["kind"], payload: unknown, isVideo = false) => {
      const to = peerIdRef.current;
      if (!user || !to) return;
      await supabase.from("call_signals").insert({
        from_user: user.id,
        to_user: to,
        kind,
        payload: payload as never,
        video: isVideo,
      });
    },
    [user],
  );

  const cleanup = useCallback(() => {
    stopRingtone();
    pcRef.current?.close();
    pcRef.current = null;
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    pendingOffer.current = null;
    pendingIce.current = [];
    peerIdRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setStatus("idle");
    setPeer(null);
    setSeconds(0);
    setMuted(false);
    setCameraOff(false);
  }, []);

  // 応答がなかった通話を「不在着信」としてトークに残す
  const logMissedCall = useCallback(
    async (toId: string, isVideo: boolean) => {
      if (!user) return;
      await supabase.from("messages").insert({
        sender_id: user.id,
        receiver_id: toId,
        content: isVideo ? "video" : "audio",
        media_type: "missed_call",
      });
    },
    [user],
  );

  const logMissedCallRef = useRef(logMissedCall);
  useEffect(() => {
    logMissedCallRef.current = logMissedCall;
  }, [logMissedCall]);

  const hangUp = useCallback(
    (notify = true) => {
      // 発信中（相手が応答していない）状態で切った場合は不在着信を記録
      if (statusRef.current === "calling" && peerIdRef.current) {
        void logMissedCallRef.current(peerIdRef.current, videoRef.current);
      }
      if (notify) void sendSignal("end", null);
      cleanup();
    },
    [sendSignal, cleanup],
  );

  const createPeerConnection = useCallback(async (wantVideo: boolean) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: wantVideo ? { facingMode: "user" } : false,
    });
    localRef.current = stream;
    setLocalStream(stream);

    const pc = new RTCPeerConnection(await loadRtcConfig());
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    const remote = new MediaStream();
    setRemoteStream(remote);
    pc.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((t) => remote.addTrack(t));
      setRemoteStream(new MediaStream(remote.getTracks()));
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) void sendSignalRef.current("ice", event.candidate.toJSON());
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setStatus("active");
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        toast.error("通話が切断されました");
        cleanupRef.current();
      }
    };
    pcRef.current = pc;
    return pc;
  }, []);

  // stable refs to avoid stale closures inside RTC callbacks
  const sendSignalRef = useRef(sendSignal);
  const cleanupRef = useRef(cleanup);
  useEffect(() => {
    sendSignalRef.current = sendSignal;
    cleanupRef.current = cleanup;
  }, [sendSignal, cleanup]);

  const startCall = useCallback(
    async (target: Profile, wantVideo: boolean) => {
      if (status !== "idle") return;
      try {
        peerIdRef.current = target.id;
        setPeer(target);
        setVideo(wantVideo);
        setStatus("calling");
        const pc = await createPeerConnection(wantVideo);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignalRef.current("offer", offer, wantVideo);
      } catch {
        toast.error("カメラ・マイクを利用できませんでした");
        cleanup();
      }
    },
    [status, createPeerConnection, cleanup],
  );

  const acceptCall = useCallback(async () => {
    const offer = pendingOffer.current;
    if (!offer) return;
    try {
      stopRingtone();
      setStatus("connecting");
      const pc = await createPeerConnection(video);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      for (const c of pendingIce.current) await pc.addIceCandidate(new RTCIceCandidate(c));
      pendingIce.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignalRef.current("answer", answer);
    } catch {
      toast.error("カメラ・マイクを利用できませんでした");
      hangUp();
    }
  }, [video, createPeerConnection, hangUp]);

  // realtime signaling
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`call-signals-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "call_signals",
          filter: `to_user=eq.${user.id}`,
        },
        async (payload) => {
          const signal = payload.new as CallSignal;
          const pc = pcRef.current;

          if (signal.kind === "offer") {
            if (statusRef.current !== "idle") {
              peerIdRef.current = signal.from_user;
              await sendSignalRef.current("reject", null);
              peerIdRef.current = null;
              return;
            }
            peerIdRef.current = signal.from_user;
            pendingOffer.current = signal.payload as RTCSessionDescriptionInit;
            setVideo(signal.video);
            setStatus("incoming");
            startRingtone();
            const { data } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", signal.from_user)
              .maybeSingle();
            setPeer((data as Profile) ?? null);
            showIncomingCallNotification(
              (data as Profile | null)?.display_name ?? "不明なユーザー",
              signal.video,
            );
            return;
          }

          if (signal.kind === "answer" && pc) {
            await pc.setRemoteDescription(
              new RTCSessionDescription(signal.payload as RTCSessionDescriptionInit),
            );
            for (const c of pendingIce.current) await pc.addIceCandidate(new RTCIceCandidate(c));
            pendingIce.current = [];
            setStatus("connecting");
            return;
          }

          if (signal.kind === "ice") {
            const candidate = signal.payload as RTCIceCandidateInit;
            if (pc?.remoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
            } else {
              pendingIce.current.push(candidate);
            }
            return;
          }

          if (signal.kind === "end" || signal.kind === "reject") {
            if (statusRef.current !== "idle") {
              // 発信中に相手が拒否/切断した場合は不在着信として記録
              if (statusRef.current === "calling" && peerIdRef.current) {
                void logMissedCallRef.current(peerIdRef.current, videoRef.current);
              }
              toast(signal.kind === "reject" ? "応答がありませんでした" : "通話が終了しました");
              cleanupRef.current();
            }
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user]);

  const statusRef = useRef(status);
  const videoRef = useRef(video);
  useEffect(() => {
    statusRef.current = status;
    videoRef.current = video;
  }, [status, video]);

  // ログイン中の最初のタップ/クリックで通知許可をリクエスト
  useEffect(() => {
    if (!user) return;
    const ask = () => {
      void requestNotificationPermission();
      window.removeEventListener("pointerdown", ask);
    };
    window.addEventListener("pointerdown", ask);
    return () => window.removeEventListener("pointerdown", ask);
  }, [user]);

  useEffect(() => {
    if (status !== "active") return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

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

  useEffect(() => () => cleanupRef.current(), []);

  return (
    <CallContext.Provider
      value={{
        status,
        peer,
        video,
        muted,
        cameraOff,
        seconds,
        startCall,
        acceptCall,
        hangUp,
        toggleMute,
        toggleCamera,
        localStream,
        remoteStream,
      }}
    >
      {children}
      <CallOverlay />
    </CallContext.Provider>
  );
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used within CallProvider");
  return ctx;
}
