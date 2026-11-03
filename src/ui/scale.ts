/** Small scale/tick helpers for the SVG charts. */
export function niceStep(span: number, target = 5): number {
  const raw = span / Math.max(target, 1);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const r = raw / mag;
  const step = r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10;
  return step * mag;
}

export function niceDomain(min: number, max: number, target = 5): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const d = Math.abs(min) * 0.1 || 1;
    min -= d;
    max += d;
  }
  const s = niceStep(max - min, target);
  return [Math.floor(min / s) * s, Math.ceil(max / s) * s];
}

export function ticks(min: number, max: number, target = 5): number[] {
  const s = niceStep(max - min, target);
  const out: number[] = [];
  for (let v = Math.ceil(min / s - 1e-9) * s; v <= max + s * 1e-9; v += s) out.push(Math.abs(v) < s * 1e-9 ? 0 : v);
  return out;
}

export function linear(d0: number, d1: number, r0: number, r1: number) {
  const k = (r1 - r0) / (d1 - d0 || 1);
  return (v: number) => r0 + (v - d0) * k;
}

export function fmt(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e5)) return v.toExponential(2);
  return Number(v.toPrecision(digits)).toString();
}

export function fixed(v: number | null | undefined, d = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return (Math.abs(v) < 0.5 * Math.pow(10, -d) ? 0 : v).toFixed(d);
}
