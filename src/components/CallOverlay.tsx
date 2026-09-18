import { useEffect, useRef, useState } from "react";
import { ChevronDown, Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from "lucide-react";
import { useCallOptional } from "@/components/CallProvider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatDuration, initials } from "@/lib/rine";
import { cn } from "@/lib/utils";

export function CallOverlay() {
  const call = useCallOptional();
  const {
    status,
    peer,
    video,
    muted,
    cameraOff,
    seconds,
    acceptCall,
    hangUp,
    toggleMute,
    toggleCamera,
    localStream,
    remoteStream,
  } = call ?? ({} as NonNullable<typeof call>);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream, status, minimized]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
    if (remoteAudioRef.current && remoteStream) remoteAudioRef.current.srcObject = remoteStream;
  }, [remoteStream, status, minimized]);

  // 着信中は必ず全画面で表示する
  useEffect(() => {
    if (status === "incoming" || status === "idle") setMinimized(false);
  }, [status]);

  if (status === "idle" || !peer) return null;

  const label =
    status === "calling"
      ? "呼び出し中…"
      : status === "incoming"
        ? `${video ? "ビデオ通話" : "音声通話"}の着信`
        : status === "connecting"
          ? "接続中…"
          : formatDuration(seconds);

  if (minimized) {
    return (
      <>
        {!video && <audio ref={remoteAudioRef} autoPlay />}
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-[var(--brand-dark)] px-5 py-3 text-sm font-semibold text-primary-foreground shadow-soft"
        >
          <span className="size-2 animate-pulse rounded-full bg-[hsl(var(--brand))]" />
          {peer.display_name}
          <span className="tabular-nums opacity-80">{label}</span>
        </button>
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[var(--brand-dark)] text-primary-foreground">
      {/* 背景: 相手のアイコンをぼかして敷く */}
      {peer.avatar_url && !(video && status === "active") && (
        <img
          src={peer.avatar_url}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-2xl"
        />
      )}

      {video && (status === "active" || status === "connecting") && (
        <>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute right-4 top-20 z-10 h-40 w-28 rounded-2xl border border-white/20 object-cover shadow-soft"
          />
          <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/60 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/70 to-transparent" />
        </>
      )}
      {!video && <audio ref={remoteAudioRef} autoPlay />}

      <div className="relative z-10 flex h-full flex-col items-center justify-between px-6 py-8">
        <div className="flex w-full items-center">
          {status !== "incoming" && (
            <Button
              variant="callSoft"
              size="icon"
              className="rounded-full"
              aria-label="最小化"
              onClick={() => setMinimized(true)}
            >
              <ChevronDown className="size-5" />
            </Button>
          )}
          <span className="mx-auto rounded-full bg-black/30 px-3 py-1 text-xs font-semibold tabular-nums backdrop-blur">
            {label}
          </span>
          {status !== "incoming" && <span className="size-9" />}
        </div>

        <div className="flex flex-col items-center gap-4 text-center">
          {!(video && status === "active") && (
            <Avatar className="size-32 border-4 border-white/20 shadow-soft">
              <AvatarImage src={peer.avatar_url ?? undefined} alt={peer.display_name} />
              <AvatarFallback className="bg-brand-gradient text-4xl text-primary-foreground">
                {initials(peer.display_name)}
              </AvatarFallback>
            </Avatar>
          )}
          <div>
            <p className="text-2xl font-bold">{peer.display_name}</p>
            <p className="mt-1 font-mono text-[11px] opacity-60">ID: {peer.friend_code}</p>
            {status === "calling" && (
              <p className="mt-2 text-sm opacity-70">相手の応答を待っています…</p>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center gap-4">
          {status !== "incoming" && (
            <div className="flex items-center gap-3 text-[11px] opacity-70">
              {muted && <span className="rounded-full bg-black/30 px-2 py-0.5">ミュート中</span>}
              {video && cameraOff && (
                <span className="rounded-full bg-black/30 px-2 py-0.5">カメラオフ</span>
              )}
            </div>
          )}
          <div className="flex items-center gap-5">
            {status === "incoming" ? (
              <>
                <Button variant="call" size="call" onClick={() => hangUp(true)} aria-label="拒否">
                  <PhoneOff className="size-7" />
                </Button>
                <Button
                  variant="answer"
                  size="call"
                  onClick={acceptCall}
                  aria-label="応答"
                  className="animate-pulse"
                >
                  <Phone className="size-7" />
                </Button>
              </>
            ) : (
              <>
                <Button variant="callSoft" size="call" onClick={toggleMute} aria-label="ミュート">
                  {muted ? <MicOff className="size-6" /> : <Mic className="size-6" />}
                </Button>
                {video && (
                  <Button variant="callSoft" size="call" onClick={toggleCamera} aria-label="カメラ">
                    {cameraOff ? <VideoOff className="size-6" /> : <Video className="size-6" />}
                  </Button>
                )}
                <Button
                  variant="call"
                  size="call"
                  onClick={() => hangUp(true)}
                  aria-label="通話を終了"
                  className={cn(status === "calling" && "animate-pulse")}
                >
                  <PhoneOff className="size-7" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
