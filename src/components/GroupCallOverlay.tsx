import { useEffect, useRef, useState } from "react";
import { ChevronDown, Mic, MicOff, PhoneOff, Users, Video, VideoOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfile, fetchProfiles } from "@/lib/profileCache";
import { useAuth } from "@/hooks/useAuth";
import { useGroupCall, type RoomPeer } from "@/components/GroupCallProvider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatDuration, initials, type Profile } from "@/lib/rine";
import { cn } from "@/lib/utils";

function PeerTile({
  peer,
  profile,
  video,
}: {
  peer: RoomPeer;
  profile: Profile | undefined;
  video: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (videoRef.current && peer.stream) videoRef.current.srcObject = peer.stream;
    if (audioRef.current && peer.stream) audioRef.current.srcObject = peer.stream;
  }, [peer.stream]);

  const hasVideo = video && (peer.stream?.getVideoTracks().length ?? 0) > 0;

  return (
    <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-3xl bg-white/10">
      {hasVideo ? (
        <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover" />
      ) : (
        <div className="flex flex-col items-center gap-2">
          <Avatar className="size-16 border-2 border-white/20">
            <AvatarImage src={profile?.avatar_url ?? undefined} alt={profile?.display_name ?? ""} />
            <AvatarFallback className="bg-brand-gradient text-lg text-primary-foreground">
              {initials(profile?.display_name ?? "?")}
            </AvatarFallback>
          </Avatar>
          <audio ref={audioRef} autoPlay />
        </div>
      )}
      <span className="absolute bottom-2 left-2 max-w-[80%] truncate rounded-full bg-black/40 px-2 py-0.5 text-[11px] font-semibold">
        {profile?.display_name ?? "参加者"}
      </span>
      {!peer.stream && (
        <span className="absolute inset-x-0 top-2 text-center text-[11px] opacity-70">接続中…</span>
      )}
    </div>
  );
}

export function GroupCallOverlay() {
  const { user } = useAuth();
  const {
    status,
    groupName,
    video,
    muted,
    cameraOff,
    seconds,
    peers,
    localStream,
    leaveCall,
    toggleMute,
    toggleCamera,
  } = useGroupCall();
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [minimized, setMinimized] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream, minimized, status]);

  useEffect(() => {
    const missing = peers.map((p) => p.id).filter((id) => !profiles[id]);
    if (missing.length === 0) return;
    void (async () => {
      const { data } = { data: await fetchProfiles(missing) };
      if (!data) return;
      setProfiles((prev) => {
        const next = { ...prev };
        for (const p of data as Profile[]) next[p.id] = p;
        return next;
      });
    })();
  }, [peers, profiles]);

  if (status === "idle") return null;

  const count = peers.length + 1;

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-[var(--brand-dark)] px-5 py-3 text-sm font-semibold text-primary-foreground shadow-soft"
      >
        <span className="size-2 animate-pulse rounded-full bg-[hsl(var(--brand))]" />
        {groupName || "ルーム通話"}・{count}人
        <span className="tabular-nums opacity-80">{formatDuration(seconds)}</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--brand-dark)] text-primary-foreground">
      <div className="flex items-center gap-3 px-5 pt-6">
        <Button
          variant="callSoft"
          size="icon"
          className="rounded-full"
          aria-label="最小化"
          onClick={() => setMinimized(true)}
        >
          <ChevronDown className="size-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold">{groupName || "ルーム通話"}</p>
          <p className="flex items-center gap-1.5 text-xs opacity-70">
            <Users className="size-3.5" />
            {count}人が参加中
            {status === "active" && <span className="tabular-nums">・{formatDuration(seconds)}</span>}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-3xl bg-white/15">
            {video && !cameraOff ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />
            ) : (
              <Avatar className="size-16 border-2 border-white/20">
                <AvatarFallback className="bg-brand-gradient text-lg text-primary-foreground">
                  自分
                </AvatarFallback>
              </Avatar>
            )}
            <span className="absolute bottom-2 left-2 rounded-full bg-black/40 px-2 py-0.5 text-[11px] font-semibold">
              自分{muted && "（ミュート）"}
            </span>
          </div>
          {peers.map((p) => (
            <PeerTile key={p.id} peer={p} profile={profiles[p.id]} video={video} />
          ))}
        </div>
        {peers.length === 0 && (
          <p className="mt-6 text-center text-sm opacity-70">
            {user ? "ほかのメンバーの参加を待っています…" : ""}
          </p>
        )}
      </div>

      <div className="flex items-center justify-center gap-5 pb-12">
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
          onClick={leaveCall}
          aria-label="通話から退出"
          className={cn(status === "joining" && "animate-pulse")}
        >
          <PhoneOff className="size-7" />
        </Button>
      </div>
    </div>
  );
}
