// ブラウザ標準機能だけで純正ZIPファイルを生成する軽量ユーティリティ（追加ライブラリ不要）
function makeCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
}
const crcTable = makeCrcTable();

function calculateCrc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (crcTable[(crc ^ (data[i] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export async function zipSingleFile(file: File): Promise<Blob> {
  const rawBytes = new Uint8Array(await file.arrayBuffer());
  const uncompressedSize = rawBytes.length;
  const crc = calculateCrc32(rawBytes);

  // ブラウザ標準の raw deflate 圧縮
  let compressedBytes: Uint8Array;
  try {
    const stream = new Blob([rawBytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    compressedBytes = new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    // 古いブラウザ用のフォールバック（無圧縮）
    compressedBytes = rawBytes;
  }

  const compressionMethod = compressedBytes === rawBytes ? 0 : 8;
  const compressedSize = compressedBytes.length;

  const enc = new TextEncoder();
  const nameBytes = enc.encode(file.name);
  const nameLen = nameBytes.length;

  const localHeader = new Uint8Array(30 + nameLen);
  const view = new DataView(localHeader.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, compressionMethod, true);
  view.setUint16(10, 0, true); // time
  view.setUint16(12, 0, true); // date
  view.setUint32(14, crc, true);
  view.setUint32(18, compressedSize, true);
  view.setUint32(22, uncompressedSize, true);
  view.setUint16(26, nameLen, true);
  view.setUint16(28, 0, true);
  localHeader.set(nameBytes, 30);

  const localOffset = 0;
  const cdHeader = new Uint8Array(46 + nameLen);
  const cdView = new DataView(cdHeader.buffer);
  cdView.setUint32(0, 0x02014b50, true);
  cdView.setUint16(4, 20, true);
  cdView.setUint16(6, 20, true);
  cdView.setUint16(8, 0, true);
  cdView.setUint16(10, compressionMethod, true);
  cdView.setUint16(12, 0, true);
  cdView.setUint16(14, 0, true);
  cdView.setUint32(16, crc, true);
  cdView.setUint32(20, compressedSize, true);
  cdView.setUint32(24, uncompressedSize, true);
  cdView.setUint16(28, nameLen, true);
  cdView.setUint16(30, 0, true);
  cdView.setUint16(32, 0, true);
  cdView.setUint16(34, 0, true);
  cdView.setUint16(36, 0, true);
  cdView.setUint32(38, 0, true);
  cdView.setUint32(42, localOffset, true);
  cdHeader.set(nameBytes, 46);

  const totalCdSize = cdHeader.length;
  const cdOffset = localHeader.length + compressedBytes.length;

  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, 1, true);
  eocdView.setUint16(10, 1, true);
  eocdView.setUint32(12, totalCdSize, true);
  eocdView.setUint32(16, cdOffset, true);
  eocdView.setUint16(20, 0, true);

  return new Blob([localHeader, compressedBytes, cdHeader, eocd] as BlobPart[], {
    type: "application/zip",
  });
}
