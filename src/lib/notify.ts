// 着信通知まわりのユーティリティ
// - ブラウザ通知（Notification API）
// - 着信音（WebAudio のシンプルなベル音ループ）
// - バイブレーション（対応端末のみ）

let audioCtx: AudioContext | null = null;
let ringTimer: number | null = null;
let ringNodes: { osc: OscillatorNode; gain: GainNode } | null = null;

/** 通知許可をリクエスト（ユーザージェスチャ内で呼ぶこと） */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    const result = await Notification.requestPermission();
    return result === "granted";
  } catch {
    return false;
  }
}

/** 着信のブラウザ通知を表示。クリックでウィンドウにフォーカス。 */
export function showIncomingCallNotification(callerName: string, video: boolean) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const n = new Notification("RINE 着信", {
      body: `${callerName} さんから${video ? "ビデオ" : "音声"}通話がかかっています`,
      tag: "rine-incoming-call",
      icon: "/favicon.ico",
      requireInteraction: true,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* 通知不可環境は無視 */
  }
}

export function closeIncomingCallNotification() {
  // tag 指定の Notification は新しい通知で上書きされるため、明示 close は不可。
  // ブラウザ側で自動的に消えるのに任せる。
}

function ensureCtx(): AudioContext | null {
  if (typeof AudioContext === "undefined") return null;
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

/** ユーザー操作のタイミングで音声を使える状態にしておく（着信音を確実に鳴らすため） */
export function primeAudio() {
  const ctx = ensureCtx();
  if (!ctx) return;
  // 無音を一瞬鳴らしてブラウザの再生ロックを解除する
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.01);
  } catch {
    /* 無視 */
  }
}

function ringOnce() {
  const ctx = ensureCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.0);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 1.1);
  ringNodes = { osc, gain };
}

/** 着信音をループ再生開始 */
export function startRingtone() {
  stopRingtone();
  ringOnce();
  ringTimer = window.setInterval(ringOnce, 2000);
  if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]);
  // 音がブロックされている場合は、最初のタップで鳴らし直す
  const ctx = audioCtx;
  if (ctx && ctx.state !== "running") {
    const unlock = () => {
      window.removeEventListener("pointerdown", unlock);
      if (ringTimer === null) return;
      void ctx.resume().then(() => ringOnce());
    };
    window.addEventListener("pointerdown", unlock, { once: true });
  }
}

/** 着信音停止 */
export function stopRingtone() {
  if (ringTimer !== null) {
    clearInterval(ringTimer);
    ringTimer = null;
  }
  if (ringNodes) {
    try {
      ringNodes.osc.stop();
      ringNodes.gain.disconnect();
    } catch {
      /* 既に停止済み */
    }
    ringNodes = null;
  }
  if (navigator.vibrate) navigator.vibrate(0);
}

/** 新着メッセージのブラウザ通知（画面を見ていないときだけ） */
export function showMessageNotification(from: string, body: string, tag = "rine-message") {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (typeof document !== "undefined" && document.visibilityState === "visible") return;
  try {
    const n = new Notification(from, {
      body: body || "新しいメッセージ",
      tag,
      icon: "/favicon.ico",
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
    if (navigator.vibrate) navigator.vibrate(200);
  } catch {
    /* 通知不可環境は無視 */
  }
}
