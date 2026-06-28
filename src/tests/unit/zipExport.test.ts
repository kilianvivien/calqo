import { describe, it, expect } from 'vitest';
import { createZip, zipBytes } from '@/editor/export/zip';

/** Independent CRC-32 so the test doesn't share the implementation under test. */
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let k = 0; k < 8; k++) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

describe('createZip', () => {
  it('produces a valid store-method archive with correct CRCs and record count', () => {
    const enc = new TextEncoder();
    const a = enc.encode('hello world');
    const b = enc.encode('second file contents — π');
    expect(createZip([{ name: 'a.txt', data: a }]).type).toBe('application/zip');

    const buf = zipBytes([
      { name: 'a.txt', data: a },
      { name: 'nested/b.txt', data: b },
    ]);
    const view = new DataView(buf.buffer);

    // First local file header signature.
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    // Store method (0) and matching CRC for the first entry.
    expect(view.getUint16(8, true)).toBe(0);
    expect(view.getUint32(14, true)).toBe(crc32(a));
    // Compressed size === uncompressed size for store.
    expect(view.getUint32(18, true)).toBe(a.length);
    expect(view.getUint32(22, true)).toBe(a.length);

    // End-of-central-directory at the tail (no archive comment): 2 records.
    const eocd = buf.length - 22;
    expect(view.getUint32(eocd, true)).toBe(0x06054b50);
    expect(view.getUint16(eocd + 8, true)).toBe(2);
    expect(view.getUint16(eocd + 10, true)).toBe(2);

    // Stored data appears verbatim (uncompressed).
    const text = new TextDecoder().decode(buf);
    expect(text).toContain('hello world');
    expect(text).toContain('second file contents — π');
    expect(text).toContain('nested/b.txt');
  });

  it('handles an empty entry list', () => {
    const buf = zipBytes([]);
    expect(buf.length).toBe(22); // EOCD only
    expect(new DataView(buf.buffer).getUint32(0, true)).toBe(0x06054b50);
  });
});
