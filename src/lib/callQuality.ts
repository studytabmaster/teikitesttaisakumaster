// 通話を軽量にして、通信量・バッテリー・回線負荷を抑えるための設定。

/** 音声は会話用に十分な品質だけ確保し、映像は小さめ・低フレームレートにする。 */
export const LOW_MEDIA_CONSTRAINTS = (wantVideo: boolean): MediaStreamConstraints => ({
  audio: {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 16000,
  },
  video: wantVideo
    ? {
        facingMode: "user",
        width: { ideal: 320, max: 480 },
        height: { ideal: 240, max: 360 },
        frameRate: { ideal: 15, max: 20 },
      }
    : false,
});

const AUDIO_MAX_BITRATE = 24_000; // 24kbps ≒ 通話音声に十分
const VIDEO_MAX_BITRATE = 150_000; // 150kbps ≒ 小さめのビデオ通話

/** 送信ビットレートに上限をかけ、長時間の通話でも通信量が膨らまないようにする。 */
export async function applyLowBitrate(pc: RTCPeerConnection) {
  await Promise.all(
    pc.getSenders().map(async (sender) => {
      const kind = sender.track?.kind;
      if (!kind) return;
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      for (const enc of params.encodings) {
        enc.maxBitrate = kind === "video" ? VIDEO_MAX_BITRATE : AUDIO_MAX_BITRATE;
        if (kind === "video") {
          enc.maxFramerate = 15;
          enc.scaleResolutionDownBy = 1;
        }
      }
      // 混雑時は解像度を落として、カクつきよりも途切れないことを優先する
      (params as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference =
        "maintain-framerate";
      try {
        await sender.setParameters(params);
      } catch {
        /* 未対応ブラウザは無視 */
      }
    }),
  );
}
