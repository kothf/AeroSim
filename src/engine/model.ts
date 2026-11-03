/**
 * AeroSim Analytics core: maps an aircraft configuration onto
 * (1) section/wing aerodynamics, (2) longitudinal static stability & trim,
 * (3) the linearised longitudinal state-space model and its modes,
 * (4) maneuvering flight (stick-fixed maneuver point, stick force per g).
 *
 * Conventions: SI units, angles in radians internally, CG / NP as fraction of MAC
 * measured aft of the MAC leading edge, elevator positive trailing-edge down,
 * stick force positive = pull. Stability-axis small-disturbance theory (Nelson / Etkin).
 */
import { AircraftInputs, clampInputs } from './aircraft';
import { DEG, FT_TO_M, G0, KT_TO_MS, isa, AtmosphereState } from './atmosphere';
import { Complex } from './complex';
import { Matrix, eigenvalues, solve2 } from './linalg';
import { classifyModes, LongitudinalModes, shortPeriodApprox, phugoidApprox, ModeApprox } from './modes';
import { NacaProfile, parseNaca } from './naca';
import { SectionAero, flapEffectiveness, solveThinAirfoil } from './thinAirfoil';
import { downwashGradient, liftSlope3D } from './wing';
import { Propulsion, propulsion } from './propulsion';

/** Pitch-damping fuselage allowance: Nelson suggests ~10% over the tail-only estimate. */
export const CMQ_FUSELAGE_FACTOR = 1.1;

export interface Geometry {
  span: number;
  mac: number;
  tailArea: number;
  tailSpan: number;
  tailChord: number;
  elevatorArea: number;
  elevatorChord: number;
}

export interface AeroDerivatives {
  wing: SectionAero;
  tail: SectionAero;
  CLaWing: number;
  CLaTail: number;
  CLa: number; // whole aircraft
  deda: number;
  eps0: number; // downwash at alpha = 0 [rad]
  tau: number; // elevator effectiveness
  CL0: number; // whole aircraft at alpha = 0, delta_e = 0
  /** total Cm at alpha = 0, delta_e = 0, including the trim thrust-line moment */
  Cm0: number;
  /** aerodynamic part of Cm0 (wing + tail) */
  Cm0Aero: number;
  CmT: number;
  Cma: number;
  CLde: number;
  Cmde: number;
  Cmq: number;
  Cmadot: number;
  xac: number;
}

export interface StaticStability {
  xnp: number; // stick-fixed neutral point
  xnpFree: number; // stick-free neutral point
  staticMargin: number;
  staticMarginFree: number;
  stable: boolean;
  /** 'stable' > 5% MAC margin, 'marginal' 0..5%, 'unstable' < 0 */
  status: 'stable' | 'marginal' | 'unstable';
  trim: { CL: number; alpha: number; deltaE: number; feasible: boolean; alphaTail: number };
}

export interface StateSpace {
  /** state x = [du (m/s), dw (m/s), dq (rad/s), dtheta (rad)] */
  A: Matrix;
  /** input: delta_e [rad] */
  B: number[];
  dim: {
    Xu: number; Xw: number; Zu: number; Zw: number;
    Mu: number; Mw: number; Mwdot: number; Mq: number;
    Xde: number; Zde: number; Mde: number;
  };
  u0: number;
  theta0: number;
  eigenvalues: Complex[];
  modes: LongitudinalModes;
  approx: { shortPeriod: ModeApprox; phugoid: ModeApprox };
}

export interface Maneuver {
  /** elevator per g [rad / g] */
  deltaEPerG: number;
  alphaPerG: number;
  xmp: number; // stick-fixed maneuver point
  maneuverMargin: number;
  /** stick force per g [N / g] (positive = pull) */
  stickForcePerG: number;
  /** trim stick force at n = 1 [N] */
  stickForceTrim: number;
  chPerG: number;
  limitLoadFactor: number;
  handling: { status: 'too-light' | 'ok' | 'too-heavy' | 'reversed'; min: number; max: number; forceAtLimit: number; forceLimit: number };
}

export interface FlightState {
  atm: AtmosphereState;
  u0: number;
  mach: number;
  qbar: number;
  weight: number;
  CW: number; // weight coefficient W / (q S) cos(gamma)
}

export interface AnalysisResult {
  inputs: AircraftInputs;
  wingProfile: NacaProfile;
  tailProfile: NacaProfile;
  geometry: Geometry;
  flight: FlightState;
  aero: AeroDerivatives;
  stat: StaticStability;
  ss: StateSpace;
  man: Maneuver;
  prop: Propulsion;
}

export type AnalysisError = { ok: false; field: 'wingNaca' | 'tailNaca'; error: string };

/** Handling-quality band for stick force per g (approximate, class I centre-stick/wheel). */
export const STICK_FORCE_PER_G_MIN = 13; // N/g  (~3 lbf/g)
export const STICK_FORCE_PER_G_MAX = 125; // N/g (~28 lbf/g)
/**
 * 14 CFR 23.143(c) (pre-amendment 23-64 table) temporary pitch force for a centre stick: 60 lbf.
 * (Wheel with two hands on the rim is 75 lbf; the model uses stick gearing, so the stick value applies.)
 */
export const STICK_FORCE_LIMIT = 267; // N

export function flightState(inp: AircraftInputs): FlightState {
  const atm = isa(inp.altitudeFt * FT_TO_M);
  const u0 = inp.speedKts * KT_TO_MS;
  const qbar = 0.5 * atm.density * u0 * u0;
  const weight = inp.mass * G0;
  return { atm, u0, mach: u0 / atm.speedOfSound, qbar, weight, CW: (weight * Math.cos(inp.flightPathDeg * DEG)) / (qbar * inp.wingArea) };
}

export function geometry(inp: AircraftInputs): Geometry {
  const span = Math.sqrt(inp.aspectRatio * inp.wingArea);
  const mac = inp.wingArea / span;
  const tailArea = (inp.tailVolume * inp.wingArea * mac) / inp.tailArm;
  const tailSpan = Math.sqrt(inp.tailAspectRatio * tailArea);
  const tailChord = tailArea / tailSpan;
  return {
    span, mac, tailArea, tailSpan, tailChord,
    elevatorArea: inp.elevatorChordRatio * tailArea,
    elevatorChord: inp.elevatorChordRatio * tailChord,
  };
}

export function aeroDerivatives(inp: AircraftInputs, wingP: NacaProfile, tailP: NacaProfile, geo: Geometry, mach: number, CmT = 0): AeroDerivatives {
  const wing = solveThinAirfoil(wingP);
  const tail = solveThinAirfoil(tailP);
  const sweep = inp.sweepDeg * DEG;
  const CLaWing = liftSlope3D(wing.clAlpha, inp.aspectRatio, sweep, mach, inp.liftSlopeMethod);
  const CLaTail = liftSlope3D(tail.clAlpha, inp.tailAspectRatio, 0, mach, inp.liftSlopeMethod);
  const deda = downwashGradient(CLaWing, inp.aspectRatio);
  const eps0 = -deda * wing.alpha0; // eps = deda * (alpha - alpha0_w)
  const tau = flapEffectiveness(inp.elevatorChordRatio);
  const eta = inp.tailEfficiency;
  const St_S = geo.tailArea / inp.wingArea;
  const Vh = inp.tailVolume;
  const it = inp.tailIncidenceDeg * DEG;
  const xac = inp.xacWing + inp.fuselageXacShift;

  // Tail angle of attack at alpha = 0, delta_e = 0 (measured from tail zero-lift line)
  const alphaT0 = it - eps0 - tail.alpha0;
  const CLw0 = -CLaWing * wing.alpha0;
  const CLt0 = CLaTail * alphaT0;
  const CL0 = CLw0 + eta * St_S * CLt0;
  const CLa = CLaWing + eta * St_S * CLaTail * (1 - deda);
  // FR-2.1: Cm = Cm_ac,w + CL_w (x_cg - x_ac) - V_h eta CL_t
  const Cm0Aero = wing.cmC4 + CLw0 * (inp.xcg - xac) - Vh * eta * CLt0;
  const Cm0 = Cm0Aero + CmT;
  const Cma = CLaWing * (inp.xcg - xac) - Vh * eta * CLaTail * (1 - deda);
  const CLde = eta * St_S * CLaTail * tau;
  const Cmde = -Vh * eta * CLaTail * tau;
  const ltc = inp.tailArm / geo.mac;
  const Cmq = -2 * CMQ_FUSELAGE_FACTOR * eta * CLaTail * Vh * ltc;
  const Cmadot = -2 * eta * CLaTail * Vh * ltc * deda;
  return { wing, tail, CLaWing, CLaTail, CLa, deda, eps0, tau, CL0, Cm0, Cm0Aero, CmT, Cma, CLde, Cmde, Cmq, Cmadot, xac };
}

/** Total pitching moment and lift coefficients at (alpha, delta_e) [rad]. */
export function cmAt(r: Pick<AnalysisResult, 'aero'>, alpha: number, deltaE = 0): number {
  return r.aero.Cm0 + r.aero.Cma * alpha + r.aero.Cmde * deltaE;
}
export function clAt(r: Pick<AnalysisResult, 'aero'>, alpha: number, deltaE = 0): number {
  return r.aero.CL0 + r.aero.CLa * alpha + r.aero.CLde * deltaE;
}

export function staticStability(inp: AircraftInputs, a: AeroDerivatives, f: FlightState): StaticStability {
  const eta = inp.tailEfficiency;
  // FR-2.2: X_np = X_ac + V_h eta (CL_a,t / CL_a) (1 - de/da)   [CL_a = wing lift slope]
  const tailTerm = inp.tailVolume * eta * (a.CLaTail / a.CLaWing) * (1 - a.deda);
  const xnp = a.xac + tailTerm;
  // Stick-free: tail lift slope reduced by the floating elevator, factor (1 - tau Ch_a / Ch_d)
  const freeFactor = 1 - (a.tau * inp.chAlpha) / inp.chDelta;
  const xnpFree = a.xac + tailTerm * freeFactor;
  const staticMargin = xnp - inp.xcg;
  const [alpha, deltaE] = solve2(a.CLa, a.CLde, a.Cma, a.Cmde, f.CW - a.CL0, -a.Cm0);
  const feasible = Math.abs(deltaE) <= 25 * DEG && alpha < 16 * DEG && alpha > -8 * DEG;
  const alphaTail = alpha * (1 - a.deda) - a.eps0 + inp.tailIncidenceDeg * DEG;
  return {
    xnp, xnpFree, staticMargin, staticMarginFree: xnpFree - inp.xcg,
    stable: staticMargin > 0,
    status: staticMargin < 0 ? 'unstable' : staticMargin < 0.05 ? 'marginal' : 'stable',
    trim: { CL: f.CW, alpha, deltaE, feasible, alphaTail },
  };
}

/** FR-3.1 longitudinal small-disturbance model (Nelson, stability axes; Z_wdot, Z_q neglected). */
export function stateSpace(inp: AircraftInputs, a: AeroDerivatives, f: FlightState, geo: Geometry, trimCL: number, dTdu = 0): StateSpace {
  const { u0, qbar: Q, mach } = f;
  const S = inp.wingArea;
  const m = inp.mass;
  const cbar = geo.mac;
  const Iy = inp.iyy;
  const k = 1 / (Math.PI * inp.oswald * inp.aspectRatio);
  const CL = trimCL;
  const CD = inp.cd0 + k * CL * CL;
  const CDa = 2 * k * CL * a.CLa;
  const CLu = mach < 0.95 ? ((mach * mach) / (1 - mach * mach)) * CL : 0; // Prandtl-Glauert
  const CDu = 0;
  const Cmu = 0;
  const QS = Q * S;
  // X_u = (dT/du - dD/du)/m with dD/du = (2 C_D + C_Du) q S / u0
  const Xu = (-(CDu + 2 * CD) * QS) / (m * u0) + dTdu / m;
  const Xw = (-(CDa - CL) * QS) / (m * u0);
  const Zu = (-(CLu + 2 * CL) * QS) / (m * u0);
  const Zw = (-(a.CLa + CD) * QS) / (m * u0);
  // thrust line z_T below the CG: dM/du = z_T dT/du
  const Mu = (Cmu * QS * cbar) / (u0 * Iy) + (inp.thrustLineZ * dTdu) / Iy;
  const Mw = (a.Cma * QS * cbar) / (u0 * Iy);
  const Mwdot = (a.Cmadot * (cbar / (2 * u0)) * QS * cbar) / (u0 * Iy);
  const Mq = (a.Cmq * (cbar / (2 * u0)) * QS * cbar) / Iy;
  const Xde = 0;
  const Zde = (-a.CLde * QS) / m;
  const Mde = (a.Cmde * QS * cbar) / Iy;
  const th0 = inp.flightPathDeg * DEG;
  const g = G0;
  const A: Matrix = [
    [Xu, Xw, 0, -g * Math.cos(th0)],
    [Zu, Zw, u0, -g * Math.sin(th0)],
    // M row includes M_wdot * wdot, and wdot carries the -g sin(theta0) gravity term (Etkin & Reid, Dynamics of Flight, longitudinal equations in stability axes)
    [Mu + Mwdot * Zu, Mw + Mwdot * Zw, Mq + Mwdot * u0, -Mwdot * g * Math.sin(th0)],
    [0, 0, 1, 0],
  ];
  const B = [Xde, Zde, Mde + Mwdot * Zde, 0];
  const eig = eigenvalues(A);
  const dim = { Xu, Xw, Zu, Zw, Mu, Mw, Mwdot, Mq, Xde, Zde, Mde };
  return {
    A, B, dim, u0, theta0: th0, eigenvalues: eig,
    modes: classifyModes(eig),
    approx: { shortPeriod: shortPeriodApprox(dim, u0), phugoid: phugoidApprox(dim, u0) },
  };
}

/** FR-4.1 / FR-4.2: steady symmetric pull-up. */
export function maneuver(inp: AircraftInputs, a: AeroDerivatives, f: FlightState, geo: Geometry, st: StaticStability): Maneuver {
  const { u0, qbar, CW } = f;
  const g = G0;
  // Non-dimensional pitch rate per (n-1):  q_hat = q c / (2 u0),  q = (n-1) g / u0
  const qhatPerG = (g * geo.mac) / (2 * u0 * u0);
  // [CLa CLde; Cma Cmde] [da; dde] = [CW; -Cmq qhat]  per unit (n - 1)
  const [alphaPerG, deltaEPerG] = solve2(a.CLa, a.CLde, a.Cma, a.Cmde, CW, -a.Cmq * qhatPerG);
  // dde/dn = 0 where Cma = -CLa Cmq qhat / CW, with Cma = CLa_w (x_cg - x_np)
  const xmp = st.xnp - (a.CLa / a.CLaWing) * (a.Cmq * qhatPerG) / CW;
  // Elevator hinge moment Ch = Ch0 + Ch_a alpha_t + Ch_d delta_e
  const dAlphaTdn = alphaPerG * (1 - a.deda) + (g * inp.tailArm) / (u0 * u0);
  const chPerG = inp.chAlpha * dAlphaTdn + inp.chDelta * deltaEPerG;
  const hingeScale = inp.stickGearing * inp.tailEfficiency * qbar * geo.elevatorArea * geo.elevatorChord;
  const stickForcePerG = hingeScale * chPerG;
  const chTrim = inp.ch0 + inp.chAlpha * st.trim.alphaTail + inp.chDelta * st.trim.deltaE;
  const stickForceTrim = hingeScale * chTrim;
  // Pull force needed to reach n_limit from trimmed 1 g flight (trim tab assumed to null the 1 g force)
  const forceAtLimit = stickForcePerG * (inp.limitLoadFactor - 1);
  const status =
    stickForcePerG <= 0 ? 'reversed' : stickForcePerG < STICK_FORCE_PER_G_MIN ? 'too-light' : stickForcePerG > STICK_FORCE_PER_G_MAX ? 'too-heavy' : 'ok';
  return {
    deltaEPerG, alphaPerG, xmp, maneuverMargin: xmp - inp.xcg, stickForcePerG, stickForceTrim, chPerG,
    limitLoadFactor: inp.limitLoadFactor,
    handling: { status, min: STICK_FORCE_PER_G_MIN, max: STICK_FORCE_PER_G_MAX, forceAtLimit, forceLimit: STICK_FORCE_LIMIT },
  };
}

export function analyze(raw: AircraftInputs): { ok: true; result: AnalysisResult } | AnalysisError {
  const inputs = clampInputs(raw);
  const w = parseNaca(inputs.wingNaca);
  if (!w.ok) return { ok: false, field: 'wingNaca', error: w.error };
  const t = parseNaca(inputs.tailNaca);
  if (!t.ok) return { ok: false, field: 'tailNaca', error: t.error };
  const geo = geometry(inputs);
  const flight = flightState(inputs);
  const prop = propulsion(inputs, flight.atm.altitude, flight.u0, geo.mac);
  const aero = aeroDerivatives(inputs, w.profile, t.profile, geo, flight.mach, prop.CmT);
  const stat = staticStability(inputs, aero, flight);
  const ss = stateSpace(inputs, aero, flight, geo, flight.CW, prop.dTdu);
  const man = maneuver(inputs, aero, flight, geo, stat);
  return { ok: true, result: { inputs, wingProfile: w.profile, tailProfile: t.profile, geometry: geo, flight, aero, stat, ss, man, prop } };
}

/** Root locus of the longitudinal poles as the CG is swept across the MAC. */
export function cgRootLocus(inp: AircraftInputs, from = 0.05, to = 0.6, steps = 45): { xcg: number; roots: Complex[] }[] {
  const out: { xcg: number; roots: Complex[] }[] = [];
  const w = parseNaca(inp.wingNaca);
  const t = parseNaca(inp.tailNaca);
  if (!w.ok || !t.ok) return out;
  const base = clampInputs(inp);
  const geo = geometry(base);
  const f = flightState(base);
  const prop = propulsion(base, f.atm.altitude, f.u0, geo.mac);
  for (let i = 0; i <= steps; i++) {
    const xcg = from + ((to - from) * i) / steps;
    const ii = { ...base, xcg };
    const a = aeroDerivatives(ii, w.profile, t.profile, geo, f.mach, prop.CmT);
    out.push({ xcg, roots: stateSpace(ii, a, f, geo, f.CW, prop.dTdu).eigenvalues });
  }
  return out;
}
