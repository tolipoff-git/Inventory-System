// ============================================================================
// ZipStore — minimal ZIP reader/writer using STORED (method 0) entries.
// Lets us unpack the embedded REQ-003 corporate template, replace the sheet XML
// and rebuild the archive WITHOUT re-compressing it (no ExcelJS round-trip), so
// styles, theme, dataValidation and formulas stay byte-for-byte identical.
// ============================================================================

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

interface CentralRecord {
  nameBytes: Uint8Array;
  crc: number;
  size: number;
  offset: number;
}

export const ZipStore = {
  _crcTable: null as Uint32Array | null,

  /** IEEE CRC32 lookup table, built lazily */
  crcTable(): Uint32Array {
    if (this._crcTable) return this._crcTable;
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return (this._crcTable = t);
  },

  crc32(bytes: Uint8Array): number {
    const t = this.crcTable();
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  },

  fromBase64(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },

  text(bytes: Uint8Array): string { return new TextDecoder('utf-8').decode(bytes); },
  encode(str: string): Uint8Array { return new TextEncoder().encode(str); },

  /** Read archive into { name, data } entries in original order */
  read(buf: Uint8Array): ZipEntry[] {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    // Find EOCD (0x06054b50) scanning backwards
    let eocd = -1;
    for (let i = buf.length - 22; i >= 0; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('ZIP: EOCD not found');
    const count = dv.getUint16(eocd + 10, true);
    let pos = dv.getUint32(eocd + 16, true);
    const entries: ZipEntry[] = [];
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(pos, true) !== 0x02014b50) throw new Error('ZIP: bad central record');
      const method = dv.getUint16(pos + 10, true);
      const size = dv.getUint32(pos + 20, true);
      const nameLen = dv.getUint16(pos + 28, true);
      const extraLen = dv.getUint16(pos + 30, true);
      const commentLen = dv.getUint16(pos + 32, true);
      const localOff = dv.getUint32(pos + 42, true);
      const name = this.text(buf.subarray(pos + 46, pos + 46 + nameLen));
      if (method !== 0) throw new Error(`ZIP: "${name}" is deflated, template must be stored`);
      // Local header: skip name+extra to reach the data
      const lNameLen = dv.getUint16(localOff + 26, true);
      const lExtraLen = dv.getUint16(localOff + 28, true);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      entries.push({ name, data: buf.slice(dataStart, dataStart + size) });
      pos += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  },

  /** Rebuild archive: local headers -> central directory -> EOCD */
  write(entries: ZipEntry[]): Uint8Array {
    const enc = new TextEncoder();
    const parts: Uint8Array[] = [];
    const central: CentralRecord[] = [];
    let offset = 0;
    entries.forEach(e => {
      const nameBytes = enc.encode(e.name);
      const crc = this.crc32(e.data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);          // version needed
      lh.setUint16(6, 0x0800, true);      // UTF-8 flag
      lh.setUint16(8, 0, true);           // method: stored
      lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true); // fixed time/date
      lh.setUint32(14, crc, true);
      lh.setUint32(18, e.data.length, true);
      lh.setUint32(22, e.data.length, true);
      lh.setUint16(26, nameBytes.length, true);
      lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), nameBytes, e.data);
      central.push({ nameBytes, crc, size: e.data.length, offset });
      offset += 30 + nameBytes.length + e.data.length;
    });
    const cdStart = offset;
    central.forEach(c => {
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true);
      ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true);
      ch.setUint32(16, c.crc, true);
      ch.setUint32(20, c.size, true); ch.setUint32(24, c.size, true);
      ch.setUint16(28, c.nameBytes.length, true);
      ch.setUint32(42, c.offset, true);
      parts.push(new Uint8Array(ch.buffer), c.nameBytes);
      offset += 46 + c.nameBytes.length;
    });
    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true);
    eocd.setUint16(8, entries.length, true);
    eocd.setUint16(10, entries.length, true);
    eocd.setUint32(12, offset - cdStart, true);
    eocd.setUint32(16, cdStart, true);
    parts.push(new Uint8Array(eocd.buffer));
    // Concatenate into a single buffer
    const total = parts.reduce((a, p) => a + p.length, 0);
    const out = new Uint8Array(total);
    let p = 0;
    parts.forEach(part => { out.set(part, p); p += part.length; });
    return out;
  },

  /** XML text escaping for a cell value */
  xmlEsc(s: unknown): string {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  /**
   * Surgically replace a cell's content while preserving its style.
   * Text is written as inlineStr — otherwise Excel flags the file as corrupt.
   */
  patchCell(xml: string, ref: string, value: unknown, numeric = false): string {
    const re = new RegExp(`(<c r="${ref}"[^>]*>)([\\s\\S]*?)(</c>)`);
    if (!re.test(xml)) { console.warn('Template cell missing:', ref); return xml; }
    return xml.replace(re, (_m, open: string, _inner: string, close: string) => {
      if (numeric) return `${open.replace(/ t="[^"]*"/, '')}<v>${value}</v>${close}`;
      const typed = open.includes(' t="')
        ? open.replace(/ t="[^"]*"/, ' t="inlineStr"')
        : open.replace(/>$/, ' t="inlineStr">');
      return `${typed}<is><t>${this.xmlEsc(value)}</t></is>${close}`;
    });
  },

  /** Cell with formula + cached value: Excel recalcs, any viewer shows the number */
  patchFormula(xml: string, ref: string, formula: string, cached: unknown): string {
    const re = new RegExp(`(<c r="${ref}"[^>]*>)([\\s\\S]*?)(</c>)`);
    if (!re.test(xml)) { console.warn('Template cell missing:', ref); return xml; }
    return xml.replace(re, (_m, open: string, _inner: string, close: string) =>
      `${open.replace(/ t="[^"]*"/, '')}<f>${formula}</f><v>${cached}</v>${close}`);
  },
};
