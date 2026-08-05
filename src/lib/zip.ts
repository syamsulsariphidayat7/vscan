/**
 * Builder ZIP minimal (format store, tanpa kompresi) — tanpa dependensi luar.
 *
 * Cukup untuk file teks kecil seperti file Scanner Agent. Format mengikuti
 * spec ZIP (APPNOTE): local file header + data + central directory + EOCD.
 * Diverifikasi dengan `unzip -t` / `python3 -m zipfile -t`.
 */

let crcTable: Uint32Array | null = null;

/** CRC-32 (IEEE) — standar yang dipakai format ZIP. */
function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Waktu dalam format DOS (dipakai header ZIP). */
function dosDateTime(now: Date): { time: number; date: number } {
  const time =
    ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) &
    0xffff;
  const date =
    (((now.getFullYear() - 1980) << 9) |
      ((now.getMonth() + 1) << 5) |
      now.getDate()) &
    0xffff;
  return { time, date };
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export interface ZipFile {
  name: string;
  data: Uint8Array;
}

/** Bangun arsip ZIP (metode stored) dari daftar file. */
export function buildZip(files: ZipFile[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const { time, date } = dosDateTime(new Date());

  const body: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;

    // --- Local file header ---
    const lh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true); // signature "PK\x03\x04"
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // general purpose: UTF-8 names
    lv.setUint16(8, 0, true); // method: stored
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true); // compressed size
    lv.setUint32(22, size, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // extra length
    lh.set(nameBytes, 30);

    // --- Central directory header ---
    const ch = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); // signature "PK\x01\x02"
    cv.setUint16(4, (3 << 8) | 20, true); // version made by: Unix (3) + 2.0
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0x0800, true); // UTF-8 names
    cv.setUint16(10, 0, true); // method: stored
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // extra length
    cv.setUint16(32, 0, true); // comment length
    cv.setUint16(34, 0, true); // disk number start
    cv.setUint16(36, 0, true); // internal attributes
    // External attributes (Unix mode): script (.sh/.bat) dapat dieksekusi,
    // sisanya baca-tulis — supaya ./start-agent.sh tetap +x setelah ekstrak.
    cv.setUint32(38, (f.name.endsWith(".sh") || f.name.endsWith(".bat") ? 0o755 : 0o644) << 16, true);
    cv.setUint32(42, offset, true); // local header offset
    ch.set(nameBytes, 46);

    body.push(lh, f.data);
    central.push(ch);
    offset += lh.length + size;
  }

  const centralBytes = concat(central);
  const centralStart = offset;

  // --- End of central directory ---
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // signature "PK\x05\x06"
  ev.setUint16(4, 0, true); // disk number
  ev.setUint16(6, 0, true); // disk with central dir
  ev.setUint16(8, files.length, true); // entries on this disk
  ev.setUint16(10, files.length, true); // total entries
  ev.setUint32(12, centralBytes.length, true);
  ev.setUint32(16, centralStart, true);
  ev.setUint16(20, 0, true); // comment length

  return concat([...body, centralBytes, eocd]);
}
