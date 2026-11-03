/**
 * Minimal MATLAB Level 5 MAT-file writer (uncompressed, little-endian).
 * Supports real double matrices and char row vectors; loads with MATLAB `load` and scipy.io.loadmat.
 */

export type MatValue = number | number[] | number[][] | Float64Array | string;

const miINT8 = 1, miUINT16 = 4, miINT32 = 5, miUINT32 = 6, miDOUBLE = 9, miMATRIX = 14;
const mxCHAR_CLASS = 4, mxDOUBLE_CLASS = 6;

const pad8 = (n: number) => (8 - (n % 8)) % 8;

class Buf {
  private chunks: Uint8Array[] = [];
  length = 0;
  push(u: Uint8Array) { this.chunks.push(u); this.length += u.length; }
  concat(): Uint8Array {
    const out = new Uint8Array(this.length);
    let o = 0;
    for (const c of this.chunks) { out.set(c, o); o += c.length; }
    return out;
  }
}

function element(type: number, data: Uint8Array): Uint8Array {
  const p = pad8(data.length);
  const out = new Uint8Array(8 + data.length + p);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, type, true);
  dv.setUint32(4, data.length, true);
  out.set(data, 8);
  return out;
}

function toMatrix(v: Exclude<MatValue, string>): { rows: number; cols: number; colMajor: Float64Array } {
  if (typeof v === 'number') return { rows: 1, cols: 1, colMajor: new Float64Array([v]) };
  if (v instanceof Float64Array) return { rows: v.length, cols: 1, colMajor: v };
  if (v.length === 0) return { rows: 0, cols: 0, colMajor: new Float64Array(0) };
  if (typeof v[0] === 'number') {
    const a = v as number[];
    return { rows: a.length, cols: 1, colMajor: Float64Array.from(a) };
  }
  const m = v as number[][];
  const rows = m.length, cols = m[0].length;
  const cm = new Float64Array(rows * cols);
  for (let j = 0; j < cols; j++) for (let i = 0; i < rows; i++) cm[j * rows + i] = m[i][j];
  return { rows, cols, colMajor: cm };
}

function variable(name: string, value: MatValue): Uint8Array {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(name)) throw new Error(`Invalid MATLAB variable name: ${name}`);
  const isChar = typeof value === 'string';
  const flags = new Uint8Array(8);
  new DataView(flags.buffer).setUint32(0, isChar ? mxCHAR_CLASS : mxDOUBLE_CLASS, true);
  let rows: number, cols: number, data: Uint8Array, dataType: number;
  if (isChar) {
    rows = 1;
    cols = value.length;
    data = new Uint8Array(cols * 2);
    const dv = new DataView(data.buffer);
    for (let i = 0; i < cols; i++) dv.setUint16(i * 2, value.charCodeAt(i), true);
    dataType = miUINT16;
  } else {
    const m = toMatrix(value);
    rows = m.rows;
    cols = m.cols;
    data = new Uint8Array(m.colMajor.buffer.slice(m.colMajor.byteOffset, m.colMajor.byteOffset + m.colMajor.byteLength));
    dataType = miDOUBLE;
  }
  const dims = new Uint8Array(8);
  const ddv = new DataView(dims.buffer);
  ddv.setInt32(0, rows, true);
  ddv.setInt32(4, cols, true);
  const body = new Buf();
  body.push(element(miUINT32, flags));
  body.push(element(miINT32, dims));
  body.push(element(miINT8, new TextEncoder().encode(name)));
  body.push(element(dataType, data));
  return element(miMATRIX, body.concat());
}

export function writeMat(vars: Record<string, MatValue>, description = 'AeroSim Analytics export'): Uint8Array {
  const header = new Uint8Array(128);
  const text = `MATLAB 5.0 MAT-file, Platform: web, Created on: ${new Date().toUTCString()} ${description}`.slice(0, 116);
  header.fill(0x20, 0, 116);
  header.set(new TextEncoder().encode(text), 0);
  const dv = new DataView(header.buffer);
  dv.setUint16(124, 0x0100, true);
  header[126] = 'I'.charCodeAt(0);
  header[127] = 'M'.charCodeAt(0);
  const out = new Buf();
  out.push(header);
  for (const [k, v] of Object.entries(vars)) out.push(variable(k, v));
  return out.concat();
}
