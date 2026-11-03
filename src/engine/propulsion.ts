/**
 * Powerplant model.
 * - Propeller: constant shaft power, T = eta_p P / V, altitude lapse P/P0 = 1.132 sigma - 0.132 (Gagg-Ferrar).
 * - Jet: constant thrust with speed, T/T0 = sigma^0.7.
 * Provides thrust required/available, throttle setting, excess-power climb rate, maximum level speed,
 * the thrust-line pitching moment used in trim, and the thrust speed derivative dT/du used in X_u and M_u.
 */
import type { AircraftInputs } from './aircraft';
import { DEG, G0, isa } from './atmosphere';

export interface Propulsion {
  type: AircraftInputs['engineType'];
  /** sea-level-equivalent lapse factor at altitude */
  lapse: number;
  thrustAvailable: number; // N at trim speed, full throttle
  thrustRequired: number; // N, level/steady flight at gamma_0
  drag: number; // N
  throttle: number; // fraction of full throttle (may exceed 1 -> not sustainable)
  powerRequired: number; // W, thrust power T_req * V
  shaftPowerRequired: number | null; // W (propeller only)
  powerAvailable: number; // W, thrust power available
  rateOfClimb: number; // m/s excess-power climb at the current speed (gamma_0 = 0 basis)
  vMax: number | null; // m/s, maximum level speed at this altitude (null if none found)
  /** dT/du at trim [N/(m/s)] */
  dTdu: number;
  /** thrust-line moment coefficient at trim, C_m,T = T z_T / (q S c) */
  CmT: number;
  /** pitching moment from thrust [N m] */
  thrustMoment: number;
}

export function thrustAvailableAt(inp: AircraftInputs, sigma: number, V: number): number {
  if (inp.engineType === 'jet') return inp.maxThrustKn * 1000 * Math.pow(sigma, 0.7);
  const P = inp.maxPowerKw * 1000 * Math.max(1.132 * sigma - 0.132, 0);
  // T = eta_p P / V is singular at V -> 0, so it is capped by the momentum-theory static thrust.
  return Math.min((inp.propEfficiency * P) / Math.max(V, 1), staticThrust(inp, sigma));
}

/** Propeller figure of merit used for the static-thrust cap (McCormick: about 0.7-0.8 for good propellers; the low end is used). */
export const PROP_FIGURE_OF_MERIT = 0.7;

/**
 * Statistical propeller diameter, Raymer (Aircraft Design: A Conceptual Approach, propeller sizing):
 * D = K_p P^(1/4) with K_p = 0.52 m/kW^0.25 (three-blade). P is the power of one engine.
 */
export function propDiameter(inp: AircraftInputs): number {
  return 0.52 * Math.pow(inp.maxPowerKw / Math.max(inp.engineCount, 1), 0.25);
}

/**
 * Static thrust from actuator-disk momentum theory (McCormick, Aerodynamics, Aeronautics and Flight
 * Mechanics): FM * P = T^(3/2) / sqrt(2 rho A)  ->  T = (FM P)^(2/3) (2 rho A)^(1/3), summed over engines.
 * Replaces an earlier fixed 12 N/kW cap, which was about half of typical light-aircraft static thrust
 * (~20-25 N/kW) and clipped full-throttle thrust below ~130 kt.
 */
export function staticThrust(inp: AircraftInputs, sigma: number): number {
  const n = Math.max(inp.engineCount, 1);
  const P = (inp.maxPowerKw * 1000 * Math.max(1.132 * sigma - 0.132, 0)) / n;
  const D = propDiameter(inp);
  const A = (Math.PI * D * D) / 4;
  const rho = 1.225 * sigma;
  return n * Math.pow(PROP_FIGURE_OF_MERIT * P, 2 / 3) * Math.cbrt(2 * rho * A);
}

export function dragAt(inp: AircraftInputs, rho: number, V: number, n = 1): number {
  const q = 0.5 * rho * V * V;
  const CL = (n * inp.mass * G0 * Math.cos(inp.flightPathDeg * DEG)) / (q * inp.wingArea);
  const CD = inp.cd0 + (CL * CL) / (Math.PI * inp.oswald * inp.aspectRatio);
  return q * inp.wingArea * CD;
}

export function propulsion(inp: AircraftInputs, altitudeM: number, V: number, mac: number): Propulsion {
  const atm = isa(altitudeM);
  const sigma = atm.density / 1.225;
  const W = inp.mass * G0;
  const q = 0.5 * atm.density * V * V;
  const drag = dragAt(inp, atm.density, V);
  const thrustRequired = drag + W * Math.sin(inp.flightPathDeg * DEG);
  const thrustAvailable = thrustAvailableAt(inp, sigma, V);
  const lapse = inp.engineType === 'jet' ? Math.pow(sigma, 0.7) : Math.max(1.132 * sigma - 0.132, 0);
  // Maximum level speed: largest V where T_avail(V) >= D(V)
  let vMax: number | null = null;
  const levelInp = { ...inp, flightPathDeg: 0 };
  const excess = (v: number) => thrustAvailableAt(inp, sigma, v) - dragAt(levelInp, atm.density, v);
  let hi = 20;
  for (let v = 400; v >= 20; v -= 2) if (excess(v) >= 0) { hi = v; break; }
  if (hi > 20 && hi < 400) {
    let a = hi, b = hi + 2;
    for (let k = 0; k < 50; k++) { const m = 0.5 * (a + b); if (excess(m) >= 0) a = m; else b = m; }
    vMax = a;
  }
  const dTdu = inp.engineType === 'jet' ? 0 : -thrustRequired / V; // constant power: T V = const
  const thrustMoment = thrustRequired * inp.thrustLineZ;
  return {
    type: inp.engineType,
    lapse,
    thrustAvailable,
    thrustRequired,
    drag,
    throttle: thrustRequired / thrustAvailable,
    powerRequired: thrustRequired * V,
    shaftPowerRequired: inp.engineType === 'propeller' ? (thrustRequired * V) / inp.propEfficiency : null,
    powerAvailable: thrustAvailable * V,
    rateOfClimb: ((thrustAvailable - drag) * V) / W,
    vMax,
    dTdu,
    CmT: thrustMoment / (q * inp.wingArea * mac),
    thrustMoment,
  };
}
