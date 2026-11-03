/**
 * FR-3.4 time history of the linear longitudinal model plus altitude.
 *
 * The model is linear and the elevator pulse is piecewise constant, so the response is propagated with the
 * exact zero-order-hold discretisation  y(t+h) = e^{A h} y(t) + (int_0^h e^{A s} ds) B u
 * (Franklin, Powell & Workman, Digital Control of Dynamic Systems, ch. 4), evaluated with the augmented
 * matrix exponential exp([[A, B], [0, 0]] h) (Van Loan 1978). Unlike fixed-step RK4 this is exact to
 * round-off and unconditionally stable, so stiff corners of the input space (tiny I_yy, high q) no longer
 * blow up. Steps that contain a pulse edge are split at the edge, so the input timing is exact too.
 */
import type { StateSpace } from './model';
import { Matrix, expm } from './linalg';

export interface PulseInput {
  /** elevator deflection during the pulse [rad]; negative = trailing edge up (nose-up) */
  amplitude: number;
  /** pulse duration [s] */
  duration: number;
  /** pulse start time [s] */
  start?: number;
}

export interface TimeHistory {
  t: Float64Array;
  du: Float64Array; // m/s
  dw: Float64Array; // m/s
  dq: Float64Array; // rad/s
  dtheta: Float64Array; // rad
  dalpha: Float64Array; // rad
  dh: Float64Array; // m
  deltaE: Float64Array; // rad
}

/** Continuous augmented system: y = [u, w, q, theta, h], ydot = F y + G delta_e. */
export function augmentedSystem(ss: StateSpace): { F: Matrix; G: number[] } {
  const { A, B, u0, theta0 } = ss;
  const s0 = Math.sin(theta0);
  const c0 = Math.cos(theta0);
  const F: Matrix = A.map((r) => [...r, 0]);
  // h_dot = u sin(theta0) - w cos(theta0) + u0 cos(theta0) theta  (stability axes, z down)
  F.push([s0, -c0, 0, u0 * c0, 0]);
  return { F, G: [...B, 0] };
}

/** Zero-order-hold transition over h: returns [Phi (5x5), Gamma (5)]. */
function zoh(F: Matrix, G: number[], h: number): { Phi: Matrix; Gam: number[] } {
  const n = F.length;
  const M: Matrix = F.map((r, i) => [...r.map((v) => v * h), G[i] * h]);
  M.push(new Array(n + 1).fill(0));
  const E = expm(M);
  return { Phi: E.slice(0, n).map((r) => r.slice(0, n)), Gam: E.slice(0, n).map((r) => r[n]) };
}

function step(Phi: Matrix, Gam: number[], y: number[], u: number): number[] {
  return Phi.map((r, i) => r.reduce((s, v, j) => s + v * y[j], 0) + Gam[i] * u);
}

export function simulatePulse(ss: StateSpace, pulse: PulseInput, tEnd = 120, dt = 0.02): TimeHistory {
  const n = Math.floor(tEnd / dt) + 1;
  const out: TimeHistory = {
    t: new Float64Array(n), du: new Float64Array(n), dw: new Float64Array(n), dq: new Float64Array(n),
    dtheta: new Float64Array(n), dalpha: new Float64Array(n), dh: new Float64Array(n), deltaE: new Float64Array(n),
  };
  const { F, G } = augmentedSystem(ss);
  const full = zoh(F, G, dt);
  const t0 = pulse.start ?? 0.5;
  const t1 = t0 + pulse.duration;
  const de = (t: number) => (t >= t0 && t < t1 ? pulse.amplitude : 0);
  let y = [0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    out.t[i] = t;
    out.du[i] = y[0];
    out.dw[i] = y[1];
    out.dq[i] = y[2];
    out.dtheta[i] = y[3];
    out.dalpha[i] = y[1] / ss.u0;
    out.dh[i] = y[4];
    out.deltaE[i] = de(t);
    const edges = [t0, t1].filter((e) => e > t + 1e-12 && e < t + dt - 1e-12);
    if (edges.length === 0) {
      y = step(full.Phi, full.Gam, y, de(t));
    } else {
      // split the step at each pulse edge so the input switches at the exact time
      let ta = t;
      for (const tb of [...edges, t + dt]) {
        const p = zoh(F, G, tb - ta);
        y = step(p.Phi, p.Gam, y, de(ta));
        ta = tb;
      }
    }
  }
  return out;
}
