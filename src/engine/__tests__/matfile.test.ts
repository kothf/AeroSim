import { writeMat } from '../matfile';

describe('MAT-file export', () => {
  it('writes a Level 5 header and column-major double data', () => {
    const bytes = writeMat({ A: [[1, 2], [3, 4]], name: 'hi' });
    const dv = new DataView(bytes.buffer);
    expect(new TextDecoder().decode(bytes.slice(0, 10))).toBe('MATLAB 5.0');
    expect(dv.getUint16(124, true)).toBe(0x0100);
    expect(String.fromCharCode(bytes[126], bytes[127])).toBe('IM');
    // first element: miMATRIX
    expect(dv.getUint32(128, true)).toBe(14);
    const size = dv.getUint32(132, true);
    expect(size % 8).toBe(0);
    // flags (16) + dims (16) + name "A" (16) -> data tag at 128 + 8 + 48
    const dataTag = 128 + 8 + 48;
    expect(dv.getUint32(dataTag, true)).toBe(9);
    expect(dv.getUint32(dataTag + 4, true)).toBe(32);
    const vals = [0, 1, 2, 3].map((i) => dv.getFloat64(dataTag + 8 + 8 * i, true));
    expect(vals).toEqual([1, 3, 2, 4]);
    expect(bytes.length % 8).toBe(0);
  });
  it('rejects invalid variable names', () => {
    expect(() => writeMat({ '1bad': 1 })).toThrow();
  });
});
