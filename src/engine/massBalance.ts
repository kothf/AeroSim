/**
 * Mass & balance: the CG, total mass and pitch inertia computed from a component breakdown.
 *
 * Each component is a mass at a longitudinal position given in one of four references, so that
 * items attached to the wing or tail move with them when the layout changes:
 *  - 'nose'     : station in metres aft of the nose (fuselage-fixed: payload, systems, gear)
 *  - 'fuselage' : fraction of the fuselage length (fuselage structure)
 *  - 'mac'      : fraction of the wing MAC aft of the MAC leading edge (wing structure, wing fuel)
 *  - 'tail'     : metres aft of the tail aerodynamic centre (tail structure)
 * The engine is always included from the powerplant inputs (engineMass at engineStation).
 *
 * Each item also has a height z below the fuselage reference line, which gives the CG height. The
 * engine sits on its thrust line, so in this mode thrustLineZ is the thrust-line height below the
 * reference line and the thrust offset from the CG, z_T = z_engine − z_cg, is what the model uses.
 *
 * I_yy about the CG = Σ m_i [(x_i − x_cg)² + (z_i − z_cg)²] + Σ m_i k_i², with radius of gyration
 * k_i of each item about its own CG (k = 0 for point masses; a uniform rod of length L has
 * k² = L²/12) plus a small allowance for the vertical spread inside each item.
 */
import type { AircraftInputs, MassItem } from './aircraft';
import { geometry, Geometry } from './model';

export interface MassBreakdownRow {
  id: string;
  name: string;
  mass: number;
  station: number; // m aft of nose
  z: number; // m below the fuselage reference line
  moment: number; // kg m about the nose
  /** own pitch inertia about the item's CG [kg m^2] */
  ownInertia: number;
}

export interface MassProperties {
  mass: number;
  station: number; // CG station [m aft of nose]
  /** CG height below the fuselage reference line [m] */
  z: number;
  /** thrust line offset below the CG [m] = engine z − CG z */
  thrustLineBelowCg: number;
  /** CG in fraction of MAC; NOT clamped (can lie outside 0..1) */
  xcg: number;
  iyy: number;
  rows: MassBreakdownRow[];
}

/** Allowance for the vertical spread inside each item: m · (VERTICAL_GYRATION · fuselage diameter)². */
export const VERTICAL_GYRATION = 0.25;

export function itemStation(item: MassItem, inp: AircraftInputs, geo: Geometry): number {
  switch (item.ref) {
    case 'nose': return item.pos;
    case 'fuselage': return item.pos * inp.fuselageLength;
    case 'mac': return geo.macLe + item.pos * geo.mac;
    case 'tail': return geo.macLe + inp.xacWing * geo.mac + inp.tailArm + item.pos;
  }
}

/** Position value (in the item's own reference) that puts the item at a given station. */
export function itemPosFromStation(item: MassItem, station: number, inp: AircraftInputs, geo: Geometry): number {
  switch (item.ref) {
    case 'nose': return station;
    case 'fuselage': return station / inp.fuselageLength;
    case 'mac': return (station - geo.macLe) / geo.mac;
    case 'tail': return station - (geo.macLe + inp.xacWing * geo.mac + inp.tailArm);
  }
}

/** Own inertia of a component about its CG: rods for the fuselage, the wing chord and the tail. */
function ownInertia(item: MassItem, inp: AircraftInputs, geo: Geometry): number {
  const L = item.ref === 'fuselage' ? inp.fuselageLength * 0.8 : item.ref === 'mac' ? geo.mac : item.ref === 'tail' ? geo.tailChord * 2 : 0;
  return (item.mass * L * L) / 12;
}

export function massProperties(inp: AircraftInputs, geo: Geometry = geometry(inp)): MassProperties {
  const rows: MassBreakdownRow[] = inp.massItems.map((it) => {
    const station = itemStation(it, inp, geo);
    return { id: it.id, name: it.name, mass: it.mass, station, z: it.z, moment: it.mass * station, ownInertia: ownInertia(it, inp, geo) };
  });
  // engine mass sits on its thrust line (thrustLineZ is measured from the reference line in this mode)
  rows.push({ id: 'engine', name: inp.engineCount === 2 ? 'Engines (2)' : 'Engine', mass: inp.engineMass, station: inp.engineStation, z: inp.thrustLineZ, moment: inp.engineMass * inp.engineStation, ownInertia: 0 });
  const mass = rows.reduce((s, r) => s + r.mass, 0);
  const station = rows.reduce((s, r) => s + r.moment, 0) / mass;
  const z = rows.reduce((s, r) => s + r.mass * r.z, 0) / mass;
  const kz = VERTICAL_GYRATION * inp.fuselageDiameter;
  const iyy = rows.reduce((s, r) => s + r.mass * ((r.station - station) ** 2 + (r.z - z) ** 2) + r.ownInertia, 0) + mass * kz * kz;
  return { mass, station, z, thrustLineBelowCg: inp.thrustLineZ - z, xcg: (station - geo.macLe) / geo.mac, iyy, rows };
}

/**
 * The inputs the analysis should use: in 'components' mode mass, x_cg and I_yy are replaced by the
 * values computed from the breakdown, and thrustLineZ becomes the offset below the computed CG. In 'manual' mode the inputs are returned unchanged.
 */
export function applyMassBreakdown(inp: AircraftInputs): AircraftInputs {
  if (inp.massMode !== 'components') return inp;
  const mp = massProperties(inp);
  return { ...inp, mass: mp.mass, xcg: mp.xcg, iyy: mp.iyy, thrustLineZ: mp.thrustLineBelowCg };
}
