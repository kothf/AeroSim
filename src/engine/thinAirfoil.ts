/**
 * Classical thin airfoil theory (Glauert). The camber-line slope is expanded as
 *   dy_c/dx = (alpha - A0) + sum A_n cos(n theta),  x = (1 - cos theta)/2.
 * Integrals are evaluated numerically with composite Simpson's rule, split at the
 * camber-line breakpoint so the piecewise slope is integrated without a kink inside a panel.
 */
import { NacaProfile, camberBreakpoint, camberSlope } from './naca';

export interface SectionAero {
  /** zero-lift angle of attack [rad] */
  alpha0: number;
  /** Fourier coefficients of the camber line (A0 at alpha = 0) */
  A0: number;
  A1: number;
  A2: number;
  /** pitching moment about the quarter chord (= aerodynamic centre in thin airfoil theory) */
  cmC4: number;
  /** section lift slope [1/rad] */
  clAlpha: number;
  /** ideal (design) angle of attack [rad], where A0 = 0 */
  alphaIdeal: number;
}

const PANELS = 400; // per sub-interval, even

function simpson(f: (th: number) => number, a: number, b: number, n = PANELS): number {
  if (b <= a) return 0;
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(a + i * h);
  return (s * h) / 3;
}

/** Integral over theta in [0, pi], split at the camber breakpoint. */
export function integrateTheta(profile: NacaProfile, g: (th: number) => number): number {
  const xb = camberBreakpoint(profile);
  const f = (th: number) => camberSlope(profile, 0.5 * (1 - Math.cos(th))) * g(th);
  if (xb === null || xb <= 0 || xb >= 1) return simpson(f, 0, Math.PI);
  const thb = Math.acos(1 - 2 * xb);
  return simpson(f, 0, thb) + simpson(f, thb, Math.PI);
}

export function solveThinAirfoil(profile: NacaProfile): SectionAero {
  const I0 = integrateTheta(profile, () => 1);
  const A0 = -I0 / Math.PI; // at alpha = 0
  const A1 = (2 / Math.PI) * integrateTheta(profile, (th) => Math.cos(th));
  const A2 = (2 / Math.PI) * integrateTheta(profile, (th) => Math.cos(2 * th));
  // FR-1.2: alpha_0 = -(1/pi) * int (dyc/dx)(cos theta - 1) dtheta
  const alpha0 = -(1 / Math.PI) * integrateTheta(profile, (th) => Math.cos(th) - 1);
  // Glauert: c_m,c/4 = (pi/4)(A2 - A1). (The FRS prints pi/2; pi/4 is the correct
  // coefficient and reproduces the classical NACA 2412 result c_m,c/4 = -0.053.)
  const cmC4 = (Math.PI / 4) * (A2 - A1);
  return { alpha0, A0, A1, A2, cmC4, clAlpha: 2 * Math.PI, alphaIdeal: I0 / Math.PI };
}

/**
 * Plain flap (elevator) effectiveness from thin airfoil theory:
 *   tau = d alpha_0 / d delta = 1 - (theta_h - sin theta_h)/pi,  cos theta_h = 1 - 2 x_h.
 */
export function flapEffectiveness(flapChordRatio: number): number {
  const cf = Math.min(Math.max(flapChordRatio, 0), 1);
  const xh = 1 - cf;
  const th = Math.acos(1 - 2 * xh);
  return 1 - (th - Math.sin(th)) / Math.PI;
}
