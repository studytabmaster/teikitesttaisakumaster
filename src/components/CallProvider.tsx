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
import { pairChannelName } from "@/lib/realtime";
import { toast } from "sonner";
import {
  primeAudio,
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

type RtSignal = {
  kind: CallSignal["kind"];
  payload: unknown;
  video: boolean;
  from_user: string;
  to_user: string;
};

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

  const statusRef = useRef(status);
  const videoRef = useRef(video);
  useEffect(() => {
    statusRef.current = status;
    videoRef.current = video;
  }, [status, video]);

  // 通話専用の直通チャンネル（ICE などの大量のやり取りをここで行い、DB を使わない）
  const callChanRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const peerReadyRef = useRef(false);
  const rtQueue = useRef<RtSignal[]>([]);
  const handleSignalRef = useRef<(s: CallSignal) => void | Promise<void>>(() => {});

  const closeCallChannel = useCallback(() => {
    peerReadyRef.current = false;
    rtQueue.current = [];
    const ch = callChanRef.current;
    callChanRef.current = null;
    if (ch) void supabase.removeChannel(ch);
  }, []);

  const openCallChannel = useCallback(
    (peerId: string) => {
      if (!user || callChanRef.current) return;
      peerReadyRef.current = false;
      rtQueue.current = [];
      const ch = supabase
        .channel(pairChannelName("call", user.id, peerId), {
          config: { broadcast: { self: false } },
        })
        .on("broadcast", { event: "ready" }, () => {
          const first = !peerReadyRef.current;
          peerReadyRef.current = true;
          // 相手にもこちらの準備完了を返す（1往復で止まる）
          if (first) void ch.send({ type: "broadcast", event: "ready", payload: {} });
          const queued = rtQueue.current;
          rtQueue.current = [];
          for (const m of queued) void ch.send({ type: "broadcast", event: "sig", payload: m });
        })
        .on("broadcast", { event: "sig" }, ({ payload }) => {
          void handleSignalRef.current(payload as CallSignal);
        })
        .subscribe((st) => {
          if (st === "SUBSCRIBED") void ch.send({ type: "broadcast", event: "ready", payload: {} });
        });
      callChanRef.current = ch;
    },
    [user],
  );

  // DB 経由（相手がアプリのどこにいても確実に届く）
  const sendDbSignal = useCallback(
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

  // 直通チャンネル経由（速くて通信量も少ない。相手の準備ができるまで一時保管）
  const sendRtSignal = useCallback(
    (kind: CallSignal["kind"], payload: unknown, isVideo = false) => {
      const to = peerIdRef.current;
      if (!user || !to) return;
      const msg: RtSignal = { kind, payload, video: isVideo, from_user: user.id, to_user: to };
      if (!callChanRef.current || !peerReadyRef.current) {
        rtQueue.current.push(msg);
        return;
      }
      void callChanRef.current.send({ type: "broadcast", event: "sig", payload: msg });
    },
    [user],
  );

  const sendSignal = useCallback(
    async (kind: CallSignal["kind"], payload: unknown, isVideo = false) => {
      if (kind === "ice") {
        // 接続のための細かいやり取りは直通のみ（DB に書かないので無料枠にやさしい）
        sendRtSignal(kind, payload, isVideo);
        return;
      }
      if (kind !== "offer") sendRtSignal(kind, payload, isVideo);
      await sendDbSignal(kind, payload, isVideo);
    },
    [sendRtSignal, sendDbSignal],
  );

  const cleanup = useCallback(() => {
    stopRingtone();
    closeCallChannel();
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
  }, [closeCallChannel]);

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

  // stable refs to avoid stale closures inside RTC callbacks
  const sendSignalRef = useRef(sendSignal);
  const cleanupRef = useRef(cleanup);
  useEffect(() => {
    sendSignalRef.current = sendSignal;
    cleanupRef.current = cleanup;
  }, [sendSignal, cleanup]);

  const hangUp = useCallback(
    (notify = true) => {
      // 発信中（相手が応答していない）状態で切った場合は不在着信を記録
      if (statusRef.current === "calling" && peerIdRef.current) {
        void logMissedCallRef.current(peerIdRef.current, videoRef.current);
      }
      if (notify) void sendSignalRef.current("end", null);
      cleanup();
    },
    [cleanup],
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

  const startCall = useCallback(
    async (target: Profile, wantVideo: boolean) => {
      if (status !== "idle") return;
      try {
        peerIdRef.current = target.id;
        setPeer(target);
        setVideo(wantVideo);
        setStatus("calling");
        openCallChannel(target.id);
        const pc = await createPeerConnection(wantVideo);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignalRef.current("offer", offer, wantVideo);
      } catch {
        toast.error("カメラ・マイクを利用できませんでした");
        cleanup();
      }
    },
    [status, createPeerConnection, cleanup, openCallChannel],
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

  // 着信・応答・切断の処理（DB 経由と直通チャンネルの両方から呼ばれる。二重でも安全）
  const handleSignal = async (signal: CallSignal) => {
    const pc = pcRef.current;

    if (signal.kind === "offer") {
      if (statusRef.current !== "idle") {
        if (peerIdRef.current === signal.from_user) return;
        peerIdRef.current = signal.from_user;
        await sendDbSignal("reject", null);
        peerIdRef.current = null;
        return;
      }
      peerIdRef.current = signal.from_user;
      pendingOffer.current = signal.payload as RTCSessionDescriptionInit;
      setVideo(signal.video);
      setStatus("incoming");
      startRingtone();
      openCallChannel(signal.from_user);
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

    if (signal.kind === "answer") {
      if (!pc || pc.signalingState !== "have-local-offer") return;
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
      if (statusRef.current === "idle") return;
      if (peerIdRef.current && signal.from_user !== peerIdRef.current) return;
      // 発信中に相手が拒否/切断した場合は不在着信として記録
      if (statusRef.current === "calling" && peerIdRef.current) {
        void logMissedCallRef.current(peerIdRef.current, videoRef.current);
      }
      toast(signal.kind === "reject" ? "応答がありませんでした" : "通話が終了しました");
      cleanupRef.current();
    }
  };
  handleSignalRef.current = handleSignal;

  // 着信の呼び出しは DB 経由で受け取る（どの画面にいても届く）
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
        (payload) => {
          void handleSignalRef.current(payload.new as CallSignal);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user]);

  // ログイン中の最初のタップ/クリックで通知許可と着信音の準備をする
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

/** 通話機能が使えない場所（読み込み途中など）では null を返す安全版 */
export function useCallOptional() {
  return useContext(CallContext);
}
