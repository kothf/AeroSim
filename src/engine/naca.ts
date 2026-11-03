/**
 * NACA 4- and 5-digit airfoil parsing and mean-camber-line geometry.
 * Chord-normalised coordinates: x in [0, 1].
 */

export type NacaProfile =
  | { series: 4; code: string; m: number; p: number; t: number }
  | {
      series: 5;
      code: string;
      /** design lift coefficient = 0.15 * L */
      clDesign: number;
      /** location of max camber x_f = 0.05 * P */
      xf: number;
      reflex: boolean;
      t: number;
      r: number;
      k1: number;
      /** k2/k1 ratio (reflexed only) */
      k21: number;
    };

export type NacaParseResult = { ok: true; profile: NacaProfile } | { ok: false; error: string };

// Abbott & von Doenhoff camber-line constants (tabulated for c_li = 0.3; scaled linearly).
const FIVE_DIGIT_NORMAL: Record<number, { r: number; k1: number }> = {
  1: { r: 0.058, k1: 361.4 },
  2: { r: 0.126, k1: 51.64 },
  3: { r: 0.2025, k1: 15.957 },
  4: { r: 0.29, k1: 6.643 },
  5: { r: 0.391, k1: 3.23 },
};
const FIVE_DIGIT_REFLEX: Record<number, { r: number; k1: number; k21: number }> = {
  2: { r: 0.13, k1: 51.99, k21: 0.000764 },
  3: { r: 0.217, k1: 15.793, k21: 0.00677 },
  4: { r: 0.318, k1: 6.52, k21: 0.0303 },
  5: { r: 0.441, k1: 3.191, k21: 0.1355 },
};

/** Strict client-side parser: only exact 4- or 5-digit strings describing a valid NACA section are accepted. */
export function parseNaca(raw: string): NacaParseResult {
  const code = raw.trim().toUpperCase().replace(/^NACA\s*/, '');
  if (!/^\d+$/.test(code)) return { ok: false, error: 'Digits only (e.g. 2412, 0012, 23015)' };
  if (code.length === 4) {
    const m = Number(code[0]) / 100;
    const p = Number(code[1]) / 10;
    const t = Number(code.slice(2)) / 100;
    if (t <= 0) return { ok: false, error: 'Thickness (last two digits) must be > 0' };
    if (t > 0.4) return { ok: false, error: 'Thickness above 40% is outside the series' };
    if (m > 0 && p === 0) return { ok: false, error: 'Cambered section needs a max-camber position (2nd digit 1-9)' };
    if (m === 0 && p !== 0) return { ok: false, error: 'Symmetric section must have 2nd digit 0 (e.g. 0012)' };
    return { ok: true, profile: { series: 4, code, m, p, t } };
  }
  if (code.length === 5) {
    const L = Number(code[0]);
    const P = Number(code[1]);
    const Q = Number(code[2]);
    const t = Number(code.slice(3)) / 100;
    if (L < 1) return { ok: false, error: 'First digit (design C_l x 20/3) must be 1-9' };
    if (Q > 1) return { ok: false, error: 'Third digit must be 0 (normal) or 1 (reflexed)' };
    if (t <= 0 || t > 0.4) return { ok: false, error: 'Thickness (last two digits) must be 1-40' };
    const reflex = Q === 1;
    const table = reflex ? FIVE_DIGIT_REFLEX[P] : FIVE_DIGIT_NORMAL[P];
    if (!table)
      return { ok: false, error: reflex ? 'Reflexed 5-digit needs 2nd digit 2-5' : '5-digit needs 2nd digit 1-5' };
    const k21 = 'k21' in table ? (table as { k21: number }).k21 : 0;
    return {
      ok: true,
      profile: { series: 5, code, clDesign: 0.15 * L, xf: 0.05 * P, reflex, t, r: table.r, k1: table.k1, k21 },
    };
  }
  return { ok: false, error: 'Enter a 4-digit or 5-digit NACA code' };
}

/** Chordwise point where the camber-line slope formula switches branch (used to split integrals). */
export function camberBreakpoint(p: NacaProfile): number | null {
  if (p.series === 4) return p.m > 0 ? p.p : null;
  return p.r;
}

/** Mean camber line ordinate y_c(x)/c. */
export function camber(p: NacaProfile, x: number): number {
  if (p.series === 4) {
    const { m, p: pp } = p;
    if (m === 0) return 0;
    return x < pp ? (m / (pp * pp)) * (2 * pp * x - x * x) : (m / ((1 - pp) * (1 - pp))) * (1 - 2 * pp + 2 * pp * x - x * x);
  }
  const { r, k1, k21, reflex, clDesign } = p;
  const s = clDesign / 0.3;
  let y: number;
  if (!reflex) {
    y = x < r ? (k1 / 6) * (x ** 3 - 3 * r * x * x + r * r * (3 - r) * x) : ((k1 * r ** 3) / 6) * (1 - x);
  } else {
    const c = k21 * (1 - r) ** 3;
    y =
      x < r
        ? (k1 / 6) * ((x - r) ** 3 - c * x - r ** 3 * x + r ** 3)
        : (k1 / 6) * (k21 * (x - r) ** 3 - c * x - r ** 3 * x + r ** 3);
  }
  return s * y;
}

/** Mean camber line slope dy_c/dx. */
export function camberSlope(p: NacaProfile, x: number): number {
  if (p.series === 4) {
    const { m, p: pp } = p;
    if (m === 0) return 0;
    return x < pp ? ((2 * m) / (pp * pp)) * (pp - x) : ((2 * m) / ((1 - pp) * (1 - pp))) * (pp - x);
  }
  const { r, k1, k21, reflex, clDesign } = p;
  const s = clDesign / 0.3;
  let d: number;
  if (!reflex) {
    d = x < r ? (k1 / 6) * (3 * x * x - 6 * r * x + r * r * (3 - r)) : -(k1 * r ** 3) / 6;
  } else {
    const c = k21 * (1 - r) ** 3;
    d = x < r ? (k1 / 6) * (3 * (x - r) ** 2 - c - r ** 3) : (k1 / 6) * (3 * k21 * (x - r) ** 2 - c - r ** 3);
  }
  return s * d;
}

/** Half-thickness distribution (closed trailing edge variant not used; classic open TE). */
export function thickness(p: NacaProfile, x: number): number {
  const t = p.t;
  return 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1015 * x ** 4);
}

/** Upper and lower surface coordinates for plotting (cosine spacing). */
export function surfaceCoordinates(p: NacaProfile, n = 60): { upper: [number, number][]; lower: [number, number][] } {
  const upper: [number, number][] = [];
  const lower: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const x = 0.5 * (1 - Math.cos((Math.PI * i) / n));
    const yc = camber(p, x);
    const yt = thickness(p, x);
    const th = Math.atan(camberSlope(p, x));
    upper.push([x - yt * Math.sin(th), yc + yt * Math.cos(th)]);
    lower.push([x + yt * Math.sin(th), yc - yt * Math.cos(th)]);
  }
  return { upper, lower };
}
