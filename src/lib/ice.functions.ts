import { createServerFn } from "@tanstack/react-start";

export type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

// 通話の接続先（STUN / TURN）を返す。
// TURN_URLS / TURN_USERNAME / TURN_CREDENTIAL が設定されていればそれを使い、
// 無ければ公開の無料 TURN（OpenRelay）にフォールバックする。
export const getIceServers = createServerFn({ method: "GET" }).handler(async () => {
  const urls = process.env["TURN_URLS"];
  const username = process.env["TURN_USERNAME"];
  const credential = process.env["TURN_CREDENTIAL"];

  const stun: IceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];

  if (urls && username && credential) {
    return {
      iceServers: [
        ...stun,
        {
          urls: urls.split(",").map((u) => u.trim()).filter(Boolean),
          username,
          credential,
        },
      ] satisfies IceServer[],
    };
  }

  // 公開のオープンリレー TURN（誰でも使える共有クレデンシャル）
  return {
    iceServers: [
      ...stun,
      {
        urls: [
          "turn:openrelay.metered.ca:80",
          "turn:openrelay.metered.ca:443",
          "turns:openrelay.metered.ca:443?transport=tcp",
        ],
        username: "openrelayproject",
        credential: "openrelayproject",
      },
    ] satisfies IceServer[],
  };
});
