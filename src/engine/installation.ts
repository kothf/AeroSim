/**
 * Installation changes driven from the configuration schematic. Each returns an input patch
 * that keeps the rest of the airframe physically consistent.
 */
import { AircraftInputs, INPUT_BOUNDS } from './aircraft';
import type { Geometry } from './model';

const clamp = (k: keyof AircraftInputs, v: number) => {
  const b = INPUT_BOUNDS[k];
  return b ? Math.min(Math.max(v, b[0]), b[1]) : v;
};

/** Fuselage station of the MAC leading edge (constant-chord wing: MAC at mid semi-span). */
export function macLeadingEdge(inp: AircraftInputs, geo: Geometry): number {
  return inp.wingStation + (geo.span / 4) * Math.tan((inp.sweepDeg * Math.PI) / 180);
}

export function cgStation(inp: AircraftInputs, geo: Geometry): number {
  return macLeadingEdge(inp, geo) + inp.xcg * geo.mac;
}

/**
 * Slide the wing along the fuselage. The CG and the tail stay fixed in the airframe, so the CG
 * expressed in %MAC and the tail arm both change; the tail area is unchanged so V_h follows.
 */
export function moveWing(inp: AircraftInputs, geo: Geometry, newStation: number): Partial<AircraftInputs> {
  const shift = newStation - inp.wingStation;
  const tailArm = clamp('tailArm', inp.tailArm - shift);
  return {
    wingStation: newStation,
    xcg: clamp('xcg', inp.xcg - shift / geo.mac),
    tailArm,
    tailVolume: clamp('tailVolume', (geo.tailArea * tailArm) / (inp.wingArea * geo.mac)),
  };
}

/**
 * Move the engine (a point mass within the total mass). The aircraft CG moves by m_e dx / m,
 * and I_yy is updated with the parallel-axis theorem about the new CG.
 */
export function moveEngine(inp: AircraftInputs, geo: Geometry, newStation: number, newZ = inp.thrustLineZ): Partial<AircraftInputs> {
  const me = Math.min(inp.engineMass, inp.mass * 0.9);
  const m = inp.mass;
  const xcgOld = cgStation(inp, geo);
  const xcgNew = xcgOld + (me * (newStation - inp.engineStation)) / m;
  // I about CG: I = I_rest + m_rest d_rest^2 + m_e d_e^2. Recompute with the shifted engine.
  const mr = m - me;
  const xRestOld = (m * xcgOld - me * inp.engineStation) / mr; // unchanged by the move
  const iRest = inp.iyy - mr * (xRestOld - xcgOld) ** 2 - me * (inp.engineStation - xcgOld) ** 2;
  const iyy = iRest + mr * (xRestOld - xcgNew) ** 2 + me * (newStation - xcgNew) ** 2;
  return {
    engineStation: newStation,
    thrustLineZ: clamp('thrustLineZ', newZ),
    xcg: clamp('xcg', (xcgNew - macLeadingEdge(inp, geo)) / geo.mac),
    iyy: clamp('iyy', iyy),
  };
}
