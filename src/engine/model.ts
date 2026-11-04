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
import { Propulsion, propulsion, thrustAvailableAt } from './propulsion';
import {
  FlightCategory, Level, MIN_SPEED_STABILITY_GRADIENT, capLevel, minManeuverForce, phugoidLevel, spDampingLevel,
  spFrequencyLevel, stickForcePerGBand, stickForcePerGLevel, worst,
} from './criteria';

/** Pitch-damping fuselage allowance: Nelson suggests ~10% over the tail-only estimate. */
export const CMQ_FUSELAGE_FACTOR = 1.1;

export interface Geometry {
  span: number;
  mac: number;
  /** trapezoidal wing planform */
  rootChord: number;
  tipChord: number;
  /** spanwise station of the MAC from the centreline [m] */
  yMac: number;
  /** leading-edge sweep [rad] (input sweep is at the quarter chord) */
  sweepLE: number;
  /** fuselage station of the MAC leading edge [m] */
  macLe: number;
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
  /** wing zero-lift angle relative to the fuselage reference line: alpha0_w - i_w [rad] */
  alpha0Body: number;
  /** wing-alone lift at alpha = 0 (fuselage reference) */
  CLw0: number;
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
  /** load factor per unit angle of attack n/alpha [g/rad] */
  nAlpha: number;
  handling: {
    status: 'too-light' | 'ok' | 'too-heavy' | 'reversed';
    /** MIL-F-8785C Level 1 stick force per g band [N/g] for this limit load factor and n/alpha */
    min: number;
    max: number;
    forceAtLimit: number;
    /** temporary force limit, 14 CFR 23.143(c) [N] */
    forceLimit: number;
    /** minimum force to reach the limit load factor, 14 CFR 23.155 [N] */
    forceRequired: number;
  };
}

export interface FlightState {
  atm: AtmosphereState;
  u0: number;
  mach: number;
  qbar: number;
  weight: number;
  CW: number; // weight coefficient W / (q S) cos(gamma)
}

/**
 * Reference points along the fuselage. Positions are fractions of MAC (aft of the MAC LE) and
 * stations in metres aft of the nose.
 */
export interface ReferencePoints {
  /** wing aerodynamic centre (section/wing alone) */
  acWing: number;
  /** wing-body aerodynamic centre (with the fuselage shift) */
  acWingBody: number;
  /** whole-aircraft aerodynamic centre = stick-fixed neutral point */
  acAircraft: number;
  /** wing centre of pressure at the trim condition (null when the wing lift is ~0) */
  cpWing: number | null;
  /** centre of pressure of the total aerodynamic force (wing + tail + body) at trim */
  cpAircraft: number | null;
  /** wing lift coefficient at trim */
  CLwTrim: number;
  stations: {
    macLe: number; macTe: number; cg: number; acWing: number; acWingBody: number; acAircraft: number;
    cpWing: number | null; cpAircraft: number | null; tailAc: number; tailLe: number; tailTe: number;
  };
  /** overall length (nose to the furthest aft point of fuselage or tail) */
  overallLength: number;
  /** station of the wing tip leading edge */
  tipLe: number;
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
  points: ReferencePoints;
  hq: HandlingQualities;
}

export type AnalysisError = { ok: false; field: 'wingNaca' | 'tailNaca'; error: string };

/**
 * Absolute bounds of the MIL-F-8785C Level 1 centre-stick band (3 and 28 lbf/g). The band actually applied
 * depends on the limit load factor and n/alpha (criteria.ts stickForcePerGBand).
 */
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
  const lam = inp.taperRatio;
  const rootChord = (2 * inp.wingArea) / (span * (1 + lam));
  const tipChord = lam * rootChord;
  const mac = (2 / 3) * rootChord * ((1 + lam + lam * lam) / (1 + lam));
  const yMac = (span / 6) * ((1 + 2 * lam) / (1 + lam));
  const sweepLE = Math.atan(Math.tan(inp.sweepDeg * DEG) + (1 / inp.aspectRatio) * ((1 - lam) / (1 + lam)));
  const macLe = inp.wingStation + yMac * Math.tan(sweepLE);
  const tailArea = (inp.tailVolume * inp.wingArea * mac) / inp.tailArm;
  const tailSpan = Math.sqrt(inp.tailAspectRatio * tailArea);
  const tailChord = tailArea / tailSpan;
  return {
    span, mac, rootChord, tipChord, yMac, sweepLE, macLe, tailArea, tailSpan, tailChord,
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
  // alpha is the fuselage (body x axis) angle of attack; the wing sees alpha + i_w
  const alpha0Body = wing.alpha0 - inp.wingIncidenceDeg * DEG;
  const eps0 = -deda * alpha0Body; // eps = deda * (alpha + i_w - alpha0_w)
  const tau = flapEffectiveness(inp.elevatorChordRatio);
  const eta = inp.tailEfficiency;
  const St_S = geo.tailArea / inp.wingArea;
  const Vh = inp.tailVolume;
  const it = inp.tailIncidenceDeg * DEG;
  const xac = inp.xacWing + inp.fuselageXacShift;

  // Tail angle of attack at alpha = 0, delta_e = 0 (measured from tail zero-lift line)
  const alphaT0 = it - eps0 - tail.alpha0;
  const CLw0 = -CLaWing * alpha0Body;
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
  return { wing, tail, CLaWing, CLaTail, CLa, deda, eps0, alpha0Body, CLw0, tau, CL0, Cm0, Cm0Aero, CmT, Cma, CLde, Cmde, Cmq, Cmadot, xac };
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
  // the down-spring pushes the stick forward, so the pilot (or the tab) must hold an equal pull
  const stickForceTrim = hingeScale * chTrim + (inp.downSpringN ?? 0);
  // Pull force needed to reach n_limit from trimmed 1 g flight (trim tab assumed to null the 1 g force)
  const forceAtLimit = stickForcePerG * (inp.limitLoadFactor - 1);
  const nAlpha = (a.CLa * qbar * inp.wingArea) / f.weight;
  const band = stickForcePerGBand(inp.limitLoadFactor, nAlpha, 1);
  const status = stickForcePerG <= 0 ? 'reversed' : stickForcePerG < band.min ? 'too-light' : stickForcePerG > band.max ? 'too-heavy' : 'ok';
  return {
    deltaEPerG, alphaPerG, xmp, maneuverMargin: xmp - inp.xcg, stickForcePerG, stickForceTrim, chPerG,
    limitLoadFactor: inp.limitLoadFactor, nAlpha,
    handling: { status, min: band.min, max: band.max, forceAtLimit, forceLimit: STICK_FORCE_LIMIT, forceRequired: minManeuverForce(f.weight) },
  };
}

export function referencePoints(inp: AircraftInputs, geo: Geometry, a: AeroDerivatives, st: StaticStability): ReferencePoints {
  const c = geo.mac;
  const at = (x: number) => geo.macLe + x * c;
  // Wing alone: C_m,ac about the AC, so x_cp = x_ac - C_m,ac / C_L,w
  const CLwTrim = a.CLaWing * (st.trim.alpha - a.alpha0Body);
  const cpWing = Math.abs(CLwTrim) > 0.02 ? inp.xacWing - a.wing.cmC4 / CLwTrim : null;
  // Whole aircraft: trimmed, so the aerodynamic moment about the CG balances the thrust moment C_m,T
  const CL = st.trim.CL;
  const cpAircraft = Math.abs(CL) > 0.02 ? inp.xcg + a.CmT / CL : null;
  const acWing = inp.xacWing;
  const tailAc = at(acWing) + inp.tailArm;
  const tailLe = tailAc - 0.25 * geo.tailChord;
  const tailTe = tailLe + geo.tailChord;
  const tipLe = inp.wingStation + (geo.span / 2) * Math.tan(geo.sweepLE);
  return {
    acWing, acWingBody: a.xac, acAircraft: st.xnp, cpWing, cpAircraft, CLwTrim,
    stations: {
      macLe: geo.macLe, macTe: at(1), cg: at(inp.xcg), acWing: at(acWing), acWingBody: at(a.xac), acAircraft: at(st.xnp),
      cpWing: cpWing === null ? null : at(cpWing), cpAircraft: cpAircraft === null ? null : at(cpAircraft),
      tailAc, tailLe, tailTe,
    },
    overallLength: Math.max(inp.fuselageLength, tailTe, tipLe + geo.tipChord, inp.wingStation + geo.rootChord),
    tipLe,
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
  const points = referencePoints(inputs, geo, aero, stat);
  const hq = handlingQualities(inputs, geo, flight, aero, stat, ss, man, speedStabilityGradient(inputs, w.profile, t.profile, geo, prop));
  return { ok: true, result: { inputs, wingProfile: w.profile, tailProfile: t.profile, geometry: geo, flight, aero, stat, ss, man, prop, points, hq } };
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

/** Elevator travel limit used for trim feasibility and the forward CG limit [rad] (trailing edge up). */
export const ELEVATOR_UP_LIMIT = -25 * DEG;

export interface Criterion {
  value: number;
  level: Level;
}

export interface HandlingQualities {
  category: FlightCategory;
  /** n/alpha [g/rad] and control anticipation parameter omega_sp^2 / (n/alpha) [1/(g s^2)] */
  nAlpha: number;
  spDamping: Criterion;
  cap: Criterion;
  spFrequency: Criterion;
  phugoid: Criterion & { tDouble: number | null };
  /** stick force per g against the MIL-F-8785C bands (Level 1 band in min/max) */
  stickForcePerG: Criterion & { min: number; max: number };
  /** 14 CFR 23.155: pull to reach the limit load factor from trimmed 1 g [N] */
  maneuverForce: { value: number; required: number; pass: boolean };
  /** 14 CFR 23.173(c): stable stick-force/speed gradient around the trim speed, tab trimmed [N/kt] (> 0 = stable) */
  speedStability: { value: number; required: number; pass: boolean };
  /** worst MIL-F-8785C level of the dynamic and stick-force criteria */
  level: Level;
  /** stick-free maneuver point: CG where the stick force per g vanishes [fraction MAC] (null if not found) */
  xmpFree: number | null;
  /** CG envelope [fraction MAC]: forward limit from elevator authority at C_L,max (free air, power off), aft limit
   *  from 5% stick-free static margin and the minimum Level 1 stick force per g */
  cgLimits: { forward: number | null; aftStickFree: number; aftForce: number | null; aft: number };
  stall: { CLmax: number; vStall: number; speedRatio: number; clRatio: number; status: 'ok' | 'low-margin' | 'stalled' };
  performance: { LDmax: number; CLbestLD: number; vBestLD: number; vMinPower: number; LD: number };
}

function shiftCg(a: AeroDerivatives, inp: AircraftInputs, xcg: number): AeroDerivatives {
  const dx = xcg - inp.xcg;
  return { ...a, Cm0: a.Cm0 + a.CLw0 * dx, Cm0Aero: a.Cm0Aero + a.CLw0 * dx, Cma: a.Cma + a.CLaWing * dx };
}

function bisect(fn: (x: number) => number, lo: number, hi: number, iters = 50): number | null {
  let flo = fn(lo);
  const fhi = fn(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < iters; i++) {
    const m = 0.5 * (lo + hi);
    const fm = fn(m);
    if (fm * flo > 0) { lo = m; flo = fm; } else hi = m;
  }
  return 0.5 * (lo + hi);
}

/**
 * 14 CFR 23.173 stick-free speed stability: with the tab set for zero stick force at the trim speed and the
 * throttle held, the stick force at V0 -/+ 5 kt (re-trimmed alpha and delta_e, thrust-line moment at the fixed
 * throttle). A down-spring pushes the stick forward with a constant force that the tab must cancel with a hinge moment growing with q, so it
 * steepens the gradient by about 2 F_spring / V0. Returns the average gradient [N/kt], positive when a pull is needed to fly slower (stable).
 */
export function speedStabilityGradient(inp: AircraftInputs, wingP: NacaProfile, tailP: NacaProfile, geo: Geometry, prop: Propulsion): number {
  const dV = 5;
  const force = (kts: number, chTab: number) => {
    const ii = { ...inp, speedKts: kts };
    const f = flightState(ii);
    const T = prop.throttle * thrustAvailableAt(ii, f.atm.density / 1.225, f.u0);
    const CmT = (T * inp.thrustLineZ) / (f.qbar * inp.wingArea * geo.mac);
    const a = aeroDerivatives(ii, wingP, tailP, geo, f.mach, CmT);
    const st = staticStability(ii, a, f);
    const ch = inp.chAlpha * st.trim.alphaTail + inp.chDelta * st.trim.deltaE;
    const K = inp.stickGearing * inp.tailEfficiency * f.qbar * geo.elevatorArea * geo.elevatorChord;
    return { F: K * (ch - chTab) + inp.downSpringN, ch, K };
  };
  const t0 = force(inp.speedKts, 0);
  // the tab nulls the elevator hinge moment and the down-spring push together at the trim speed
  const chTab = t0.ch + inp.downSpringN / t0.K;
  return (force(inp.speedKts - dV, chTab).F - force(inp.speedKts + dV, chTab).F) / (2 * dV);
}

/** Handling-quality levels, certification-style force checks, CG envelope, stall and best-L/D speeds. */
export function handlingQualities(
  inp: AircraftInputs, geo: Geometry, f: FlightState, a: AeroDerivatives, st: StaticStability, ss: StateSpace, man: Maneuver,
  gradient: number,
): HandlingQualities {
  const cat = inp.flightCategory ?? 'B';
  const sp = ss.modes.shortPeriod;
  const ph = ss.modes.phugoid;
  const nAlpha = man.nAlpha;
  const cap = (sp.wn * sp.wn) / nAlpha;
  const nL = inp.limitLoadFactor;
  const fsLevel = man.stickForcePerG > 0 ? stickForcePerGLevel(man.stickForcePerG, nL, nAlpha) : 4;
  const spDamping = { value: sp.zeta, level: sp.stable ? spDampingLevel(sp.zeta, cat) : 4 } as Criterion;
  const capC = { value: cap, level: sp.stable ? capLevel(cap, cat) : 4 } as Criterion;
  const spFrequency = { value: sp.wn, level: sp.stable ? spFrequencyLevel(sp.wn, cat) : 4 } as Criterion;
  const phugoid = { value: ph.zeta, tDouble: ph.tDouble, level: phugoidLevel(ph.stable, ph.kind === 'oscillatory', ph.zeta, ph.tDouble) };

  // CG where the stick force per g has a given value (the per-g force does not depend on the trim state)
  const fsAt = (x: number) => maneuver({ ...inp, xcg: x }, shiftCg(a, inp, x), f, geo, st).stickForcePerG;
  const xmpFree = bisect(fsAt, inp.xcg - 2, inp.xcg + 2);
  const band = stickForcePerGBand(nL, nAlpha, 1);
  const aftForce = bisect((x) => fsAt(x) - band.min, inp.xcg - 2, xmpFree ?? inp.xcg + 2);
  // Forward CG: trim at C_L,max needs full up elevator (aerodynamic moment only, no thrust)
  const deAtClMax = (x: number) => {
    const ax = shiftCg(a, inp, x);
    return solve2(ax.CLa, ax.CLde, ax.Cma, ax.Cmde, inp.clMax - ax.CL0, -ax.Cm0Aero)[1] - ELEVATOR_UP_LIMIT;
  };
  const forward = bisect(deAtClMax, st.xnp - 3, st.xnp - 1e-3);
  const aftStickFree = st.xnpFree - 0.05;
  const aft = aftForce === null ? aftStickFree : Math.min(aftStickFree, aftForce);

  // Stall and drag polar
  const rho = f.atm.density;
  const W = f.weight * Math.cos(inp.flightPathDeg * DEG);
  const vStall = Math.sqrt((2 * W) / (rho * inp.wingArea * inp.clMax));
  const speedRatio = f.u0 / vStall;
  const clRatio = f.CW / inp.clMax;
  const k = 1 / (Math.PI * inp.oswald * inp.aspectRatio);
  const CLbestLD = Math.sqrt(inp.cd0 / k);
  const vAt = (CL: number) => Math.sqrt((2 * W) / (rho * inp.wingArea * CL));

  return {
    category: cat,
    nAlpha,
    spDamping,
    cap: capC,
    spFrequency,
    phugoid,
    stickForcePerG: { value: man.stickForcePerG, level: fsLevel, min: band.min, max: band.max },
    maneuverForce: { value: man.handling.forceAtLimit, required: man.handling.forceRequired, pass: man.handling.forceAtLimit >= man.handling.forceRequired },
    speedStability: { value: gradient, required: MIN_SPEED_STABILITY_GRADIENT, pass: gradient >= MIN_SPEED_STABILITY_GRADIENT },
    level: worst(spDamping.level, capC.level, spFrequency.level, phugoid.level, fsLevel),
    xmpFree,
    cgLimits: { forward, aftStickFree, aftForce, aft },
    stall: { CLmax: inp.clMax, vStall, speedRatio, clRatio, status: clRatio > 1 ? 'stalled' : speedRatio < 1.3 ? 'low-margin' : 'ok' },
    performance: {
      LDmax: 1 / (2 * Math.sqrt(inp.cd0 * k)),
      CLbestLD,
      vBestLD: vAt(CLbestLD),
      vMinPower: vAt(Math.sqrt(3) * CLbestLD),
      LD: f.CW / (inp.cd0 + k * f.CW * f.CW),
    },
  };
}
