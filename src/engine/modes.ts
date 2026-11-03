/** FR-3.3 mode isolation and characterisation (natural frequency, damping, period, time to half/double). */
import { Complex, cabs } from './complex';

export interface ModeInfo {
  name: 'Short period' | 'Phugoid';
  /** 'oscillatory' = complex pair; 'aperiodic' = pair of real roots (mode has split) */
  kind: 'oscillatory' | 'aperiodic';
  roots: [Complex, Complex];
  /** natural frequency [rad/s] (for an aperiodic pair: sqrt(l1*l2) when the product is positive) */
  wn: number;
  /** damping ratio (aperiodic pair: (-(l1+l2)/2)/wn, can exceed 1) */
  zeta: number;
  /** damped frequency [rad/s] */
  wd: number;
  /** period [s] (oscillatory only) */
  period: number | null;
  /** time to half amplitude [s] (null if not convergent) */
  tHalf: number | null;
  /** time to double amplitude [s] (null if not divergent) */
  tDouble: number | null;
  stable: boolean;
}

export interface LongitudinalModes {
  shortPeriod: ModeInfo;
  phugoid: ModeInfo;
  stable: boolean;
}

export interface ModeApprox {
  wn: number;
  zeta: number;
}

const LN2 = Math.LN2;

function describe(name: ModeInfo['name'], r1: Complex, r2: Complex): ModeInfo {
  const oscillatory = Math.abs(r1.im) > 0;
  const worst = Math.max(r1.re, r2.re);
  const best = Math.min(r1.re, r2.re);
  let wn: number;
  let zeta: number;
  let wd = 0;
  if (oscillatory) {
    wn = cabs(r1);
    zeta = -r1.re / wn;
    wd = Math.abs(r1.im);
  } else {
    const prod = r1.re * r2.re;
    wn = prod > 0 ? Math.sqrt(prod) : NaN;
    zeta = prod > 0 ? -(r1.re + r2.re) / (2 * wn) : NaN;
  }
  return {
    name,
    kind: oscillatory ? 'oscillatory' : 'aperiodic',
    roots: [r1, r2],
    wn,
    zeta,
    wd,
    period: oscillatory ? (2 * Math.PI) / wd : null,
    tHalf: worst < 0 ? LN2 / -worst : null,
    tDouble: worst > 0 ? LN2 / worst : best > 0 ? LN2 / best : null,
    stable: worst < 0,
  };
}

/**
 * Split the four longitudinal roots into short-period and phugoid.
 * Two complex pairs: the pair with the higher natural frequency is the short period.
 * One pair + two reals: the pair is the phugoid if its |lambda| is below the geometric mean of
 * the real roots' magnitudes, otherwise it is the short period and the reals are a split phugoid.
 * Four reals: the two largest magnitudes form the (split) short period.
 */
export function classifyModes(roots: Complex[]): LongitudinalModes {
  const pairs: [Complex, Complex][] = [];
  const reals: Complex[] = [];
  const used = new Set<number>();
  roots.forEach((r, i) => {
    if (used.has(i)) return;
    if (r.im === 0) {
      reals.push(r);
      used.add(i);
      return;
    }
    // find conjugate
    let best = -1;
    let bestD = Infinity;
    roots.forEach((s, j) => {
      if (j === i || used.has(j)) return;
      const d = Math.abs(s.re - r.re) + Math.abs(s.im + r.im);
      if (d < bestD) { bestD = d; best = j; }
    });
    used.add(i);
    used.add(best);
    const pos = r.im > 0 ? r : roots[best];
    const neg = r.im > 0 ? roots[best] : r;
    pairs.push([pos, neg]);
  });
  let sp: [Complex, Complex];
  let ph: [Complex, Complex];
  if (pairs.length === 2) {
    pairs.sort((a, b) => cabs(b[0]) - cabs(a[0]));
    [sp, ph] = pairs;
  } else if (pairs.length === 1) {
    const rs = reals.sort((a, b) => Math.abs(b.re) - Math.abs(a.re)) as Complex[];
    const gm = Math.sqrt(Math.abs(rs[0].re * rs[1].re));
    if (cabs(pairs[0][0]) < gm) { ph = pairs[0]; sp = [rs[0], rs[1]]; }
    else { sp = pairs[0]; ph = [rs[0], rs[1]]; }
  } else {
    const rs = reals.sort((a, b) => Math.abs(b.re) - Math.abs(a.re));
    sp = [rs[0], rs[1]];
    ph = [rs[2], rs[3]];
  }
  const shortPeriod = describe('Short period', sp[0], sp[1]);
  const phugoid = describe('Phugoid', ph[0], ph[1]);
  return { shortPeriod, phugoid, stable: shortPeriod.stable && phugoid.stable };
}

type Dim = { Xu: number; Zu: number; Zw: number; Mw: number; Mwdot: number; Mq: number };

/** Short-period approximation (Nelson 4.3): l^2 - (Mq + Mwdot u0 + Zw) l + (Zw Mq - Mw u0) = 0. */
export function shortPeriodApprox(d: Dim, u0: number): ModeApprox {
  const wn2 = d.Zw * d.Mq - d.Mw * u0;
  const wn = wn2 > 0 ? Math.sqrt(wn2) : NaN;
  return { wn, zeta: -(d.Mq + d.Mwdot * u0 + d.Zw) / (2 * wn) };
}

/** Lanchester phugoid approximation: wn = sqrt(-Zu g / u0), zeta = -Xu / (2 wn). */
export function phugoidApprox(d: Dim & { Xu: number }, u0: number, g = 9.80665): ModeApprox {
  const wn = Math.sqrt(Math.max((-d.Zu * g) / u0, 0));
  return { wn, zeta: -d.Xu / (2 * wn) };
}
