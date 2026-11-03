/** 3D finite-wing corrections and downwash. */

export type LiftSlopeMethod = 'lifting-line' | 'datcom';

/**
 * FR-1.3 finite wing lift slope.
 * - 'lifting-line': C_La = a0 cosL / (1 + a0 cosL/(pi AR)), with Prandtl-Glauert on the section slope.
 *   At L = 0 and M = 0 this is exactly the FRS formula C_La = c_la / (1 + c_la/(pi AR)).
 * - 'datcom': Helmbold-Diederich / Polhamus (USAF DATCOM 1.2.2.1), valid for swept and low-AR wings.
 * @param clAlpha section slope [1/rad]; @param sweep sweep of the mid-chord (datcom) / quarter chord (lifting line) [rad]
 */
export function liftSlope3D(clAlpha: number, AR: number, sweep = 0, mach = 0, method: LiftSlopeMethod = 'lifting-line'): number {
  const beta = Math.sqrt(Math.max(1 - mach * mach, 0.05));
  if (method === 'datcom') {
    const kappa = clAlpha / (2 * Math.PI);
    const t = Math.tan(sweep);
    return (2 * Math.PI * AR) / (2 + Math.sqrt(((AR * AR * beta * beta) / (kappa * kappa)) * (1 + (t * t) / (beta * beta)) + 4));
  }
  const a0 = (clAlpha * Math.cos(sweep)) / beta;
  return a0 / (1 + a0 / (Math.PI * AR));
}

/** Downwash gradient at the tail from an elliptic-loading estimate: d(eps)/d(alpha) = 2 C_La,w / (pi AR). */
export function downwashGradient(CLaWing: number, AR: number): number {
  return (2 * CLaWing) / (Math.PI * AR);
}
