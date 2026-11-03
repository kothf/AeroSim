/** FR-3.4 time-history integration (classical RK4) of the linear longitudinal model plus altitude. */
import type { StateSpace } from './model';

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

export function simulatePulse(ss: StateSpace, pulse: PulseInput, tEnd = 120, dt = 0.02): TimeHistory {
  const n = Math.floor(tEnd / dt) + 1;
  const out: TimeHistory = {
    t: new Float64Array(n), du: new Float64Array(n), dw: new Float64Array(n), dq: new Float64Array(n),
    dtheta: new Float64Array(n), dalpha: new Float64Array(n), dh: new Float64Array(n), deltaE: new Float64Array(n),
  };
  const A = ss.A;
  const B = ss.B;
  const { u0, theta0 } = ss;
  const s0 = Math.sin(theta0);
  const c0 = Math.cos(theta0);
  const t0 = pulse.start ?? 0.5;
  const de = (t: number) => (t >= t0 && t < t0 + pulse.duration ? pulse.amplitude : 0);
  // augmented state y = [u, w, q, theta, h]
  const f = (y: number[], t: number, o: number[]) => {
    const d = de(t);
    for (let i = 0; i < 4; i++) o[i] = A[i][0] * y[0] + A[i][1] * y[1] + A[i][2] * y[2] + A[i][3] * y[3] + B[i] * d;
    o[4] = s0 * y[0] - c0 * y[1] + u0 * c0 * y[3];
  };
  let y = [0, 0, 0, 0, 0];
  const k1 = [0, 0, 0, 0, 0], k2 = [0, 0, 0, 0, 0], k3 = [0, 0, 0, 0, 0], k4 = [0, 0, 0, 0, 0];
  const tmp = [0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    out.t[i] = t;
    out.du[i] = y[0];
    out.dw[i] = y[1];
    out.dq[i] = y[2];
    out.dtheta[i] = y[3];
    out.dalpha[i] = y[1] / u0;
    out.dh[i] = y[4];
    out.deltaE[i] = de(t);
    // RK4 step; evaluate the discontinuous input at sub-step times
    f(y, t, k1);
    for (let j = 0; j < 5; j++) tmp[j] = y[j] + 0.5 * dt * k1[j];
    f(tmp, t + 0.5 * dt, k2);
    for (let j = 0; j < 5; j++) tmp[j] = y[j] + 0.5 * dt * k2[j];
    f(tmp, t + 0.5 * dt, k3);
    for (let j = 0; j < 5; j++) tmp[j] = y[j] + dt * k3[j];
    f(tmp, t + dt, k4);
    y = y.map((v, j) => v + (dt / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
  }
  return out;
}
