import { getIceServers, type IceServer } from "@/lib/ice.functions";

const FALLBACK: RTCConfiguration = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    {
      urls: ["turn:openrelay.metered.ca:80", "turn:openrelay.metered.ca:443"],
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
  iceCandidatePoolSize: 2,
};

let cached: RTCConfiguration | null = null;
let inflight: Promise<RTCConfiguration> | null = null;

/** 通話に使う STUN/TURN 設定を取得（1回だけ取得してキャッシュ） */
export async function loadRtcConfig(): Promise<RTCConfiguration> {
  if (cached) return cached;
  if (!inflight) {
    inflight = (async () => {
      try {
        const res = (await getIceServers()) as { iceServers: IceServer[] };
        const config: RTCConfiguration = {
          iceServers: res.iceServers as RTCIceServer[],
          iceCandidatePoolSize: 2,
        };
        cached = config;
        return config;
      } catch {
        cached = FALLBACK;
        return FALLBACK;
      } finally {
        inflight = null;
      }
    })();
  }
  return inflight;
}
