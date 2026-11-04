/**
 * Handling-quality and certification criteria (longitudinal, Class I light aircraft, centre stick).
 *
 * - MIL-F-8785C (1980) flying qualities: short-period damping (3.2.2.1.2), CAP / short-period frequency
 *   (3.2.2.1.1, Class I), phugoid stability (3.2.1.2) and stick force per g (3.2.2.2.1, table V, centre stick).
 * - 14 CFR 23 (pre-amendment 23-64 wording, still accepted as a means of compliance via ASTM F3173):
 *   23.155 minimum control force to reach the limit load factor, 23.173 stick-force/speed gradient.
 *
 * Levels: 1 = clearly adequate, 2 = adequate with some pilot workload, 3 = controllable, 4 = worse than Level 3.
 */
import { N_TO_LBF } from './atmosphere';

export type Level = 1 | 2 | 3 | 4;
/** MIL-F-8785C flight phase category: A = non-terminal precision (combat, formation), B = cruise/climb, C = terminal (take-off, approach, landing). */
export type FlightCategory = 'A' | 'B' | 'C';

const LBF = 1 / N_TO_LBF; // N per lbf

const inBand = (v: number, lo: number, hi: number) => Number.isFinite(v) && v >= lo && v <= hi;

/** Short-period damping ratio limits (MIL-F-8785C table IV). */
export const SP_DAMPING: Record<FlightCategory, [number, number][]> = {
  A: [[0.35, 1.3], [0.25, 2.0], [0.15, Infinity]],
  B: [[0.3, 2.0], [0.2, 2.0], [0.15, Infinity]],
  C: [[0.35, 1.3], [0.25, 2.0], [0.15, Infinity]],
};

/** Control anticipation parameter CAP = ω_n,sp² / (n/α) [1/(g s²)] (MIL-F-8785C figs. 1–3, Level 1 and 2 bands). */
export const CAP_BANDS: Record<FlightCategory, [number, number][]> = {
  A: [[0.28, 3.6], [0.16, 10]],
  B: [[0.085, 3.6], [0.038, 10]],
  C: [[0.16, 3.6], [0.096, 10]],
};

/** Minimum short-period frequency [rad/s], Class I (Category B has none). */
export const SP_WN_MIN: Record<FlightCategory, [number, number]> = { A: [1.0, 0.6], B: [0, 0], C: [0.87, 0.6] };

export function bandLevel(v: number, bands: [number, number][]): Level {
  for (let i = 0; i < bands.length; i++) if (inBand(v, bands[i][0], bands[i][1])) return (i + 1) as Level;
  return (bands.length + 1 > 3 ? 4 : bands.length + 1) as Level;
}

export const spDampingLevel = (zeta: number, cat: FlightCategory): Level => bandLevel(zeta, SP_DAMPING[cat]);

/** CAP outside the Level 2 band is Level 3 while CAP > 0 (the short period still has a positive stiffness). */
export function capLevel(cap: number, cat: FlightCategory): Level {
  const l = bandLevel(cap, CAP_BANDS[cat]);
  return l <= 2 ? l : cap > 0 ? 3 : 4;
}

export function spFrequencyLevel(wn: number, cat: FlightCategory): Level {
  const [l1, l2] = SP_WN_MIN[cat];
  if (!Number.isFinite(wn)) return 4;
  return wn >= l1 ? 1 : wn >= l2 ? 2 : 3;
}

/** Phugoid (MIL-F-8785C 3.2.1.2): Level 1 ζ ≥ 0.04, Level 2 ζ ≥ 0, Level 3 time to double ≥ 55 s. */
export function phugoidLevel(stable: boolean, oscillatory: boolean, zeta: number, tDouble: number | null): Level {
  if (stable) return !oscillatory || zeta >= 0.04 ? 1 : 2;
  return tDouble !== null && tDouble >= 55 ? 3 : 4;
}

export interface ForceBand {
  /** N/g */
  min: number;
  max: number;
}

/**
 * Stick force per g band for a centre stick (MIL-F-8785C table V), in N/g, for limit load factor nL and
 * load factor per angle of attack nAlpha [g/rad].
 */
export function stickForcePerGBand(nL: number, nAlpha: number, level: 1 | 2 | 3 = 1): ForceBand {
  const n1 = Math.max(nL - 1, 0.1);
  const na = Math.max(nAlpha, 1e-6);
  let min: number, max: number;
  if (level === 1) {
    min = Math.max(21 / n1, 3.0);
    max = Math.max(Math.min(240 / na, 28.0), 56 / n1);
  } else if (level === 2) {
    min = Math.max(18 / n1, 3.0);
    max = Math.max(Math.min(360 / na, 42.5), 85 / n1);
  } else {
    min = Math.max(12 / n1, 2.0);
    max = 56.0;
  }
  return { min: min * LBF, max: max * LBF };
}

export function stickForcePerGLevel(fs: number, nL: number, nAlpha: number): Level {
  for (const l of [1, 2, 3] as const) {
    const b = stickForcePerGBand(nL, nAlpha, l);
    if (fs >= b.min && fs <= b.max) return l;
  }
  return 4;
}

/** 14 CFR 23.155(a)(2), stick: force to reach the limit load factor ≥ W/140 or 15 lbf, need not exceed 35 lbf [N]. */
export function minManeuverForce(weightN: number): number {
  const w = weightN * N_TO_LBF;
  return Math.min(Math.max(w / 140, 15), 35) * LBF;
}

/** 14 CFR 23.173(c): stable stick-force/speed gradient of at least 1 lbf per 6 kt [N/kt]. */
export const MIN_SPEED_STABILITY_GRADIENT = LBF / 6;

export const worst = (...ls: Level[]): Level => Math.max(...ls) as Level;
