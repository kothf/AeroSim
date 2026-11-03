/** Aircraft configuration inputs (the "digital twin" design parameters). */
import type { LiftSlopeMethod } from './wing';

export type EngineType = 'propeller' | 'jet';

/** Where a component's position is measured from (see massBalance.ts). */
export type MassRef = 'nose' | 'fuselage' | 'mac' | 'tail';

export interface MassItem {
  id: string;
  name: string;
  mass: number; // kg
  ref: MassRef;
  /** position in the reference's unit: m (nose, tail) or fraction (fuselage length, MAC) */
  pos: number;
  /** height below the fuselage reference line [m] (positive down) */
  z: number;
  /** size of the item (box length along x and height along z) [m]; sets its own pitch inertia */
  len: number;
  h: number;
}

/** 'components': CG, mass and I_yy come from massItems + the engine; 'manual': typed in directly. */
export type MassMode = 'components' | 'manual';

export interface AircraftInputs {
  // Main wing
  wingNaca: string;
  aspectRatio: number;
  sweepDeg: number; // quarter-chord sweep
  taperRatio: number; // tip chord / root chord
  wingArea: number; // m^2
  xacWing: number; // fraction of MAC
  fuselageXacShift: number; // fraction of MAC (Munk/Multhopp body effect, negative = forward)
  // Installation (schematic layout; fuselage stations measured aft of the nose)
  fuselageLength: number; // m
  fuselageDiameter: number; // m (max width/height)
  wingStation: number; // wing root leading edge station [m]
  // Tail plane
  tailNaca: string;
  tailAspectRatio: number;
  tailVolume: number; // V_h
  tailArm: number; // l_t [m]
  tailEfficiency: number; // eta
  tailIncidenceDeg: number; // i_t
  elevatorChordRatio: number; // c_e / c_t
  // Hinge moments & control system
  ch0: number;
  chAlpha: number; // 1/rad
  chDelta: number; // 1/rad
  stickGearing: number; // G [rad/m]
  // Powerplant
  engineType: EngineType;
  engineCount: number; // 1 or 2 (2 = wing-mounted pair)
  maxPowerKw: number; // total sea-level shaft power (propeller)
  propEfficiency: number; // eta_p
  maxThrustKn: number; // total sea-level static thrust (jet)
  engineStation: number; // m aft of nose (propeller disc / nozzle reference = engine CG)
  /**
   * m, thrust line height, positive DOWN. Manual mass mode: below the CG. Components mode: below the
   * fuselage reference line (the offset from the CG then follows from the computed CG height).
   */
  thrustLineZ: number;
  engineMass: number; // kg (included in total mass)
  // Mass & balance
  massMode: MassMode;
  massItems: MassItem[];
  xcg: number; // fraction of MAC, 0..1
  mass: number; // kg
  iyy: number; // kg m^2
  // Drag polar
  cd0: number;
  oswald: number;
  // Environment / flight state
  speedKts: number;
  altitudeFt: number;
  flightPathDeg: number; // gamma_0 (theta_0 in stability axes)
  limitLoadFactor: number;
  liftSlopeMethod: LiftSlopeMethod;
}

/** Mass breakdown of the default four-seat aircraft at MTOW (engine comes from the powerplant). */
export const DEFAULT_MASS_ITEMS: MassItem[] = [
  { id: 'wing', name: 'Wing structure', mass: 150, ref: 'mac', pos: 0.4, z: 0.3, len: 1.3, h: 0.15 },
  { id: 'fuel', name: 'Fuel (wing tanks)', mass: 150, ref: 'mac', pos: 0.3, z: 0.3, len: 0.7, h: 0.15 },
  { id: 'fus', name: 'Fuselage structure', mass: 160, ref: 'fuselage', pos: 0.38, z: 0, len: 6.5, h: 1.0 },
  { id: 'tail', name: 'Tail (H + V)', mass: 35, ref: 'tail', pos: 0.1, z: -0.6, len: 1.6, h: 1.2 },
  { id: 'gear', name: 'Landing gear', mass: 60, ref: 'nose', pos: 2.5, z: 0.5, len: 0.4, h: 0.6 },
  { id: 'sys', name: 'Systems & avionics', mass: 80, ref: 'nose', pos: 1.5, z: -0.2, len: 0.6, h: 0.4 },
  { id: 'front', name: 'Pilot + front pax', mass: 170, ref: 'nose', pos: 2.5, z: -0.2, len: 0.7, h: 0.9 },
  { id: 'rear', name: 'Rear pax', mass: 85, ref: 'nose', pos: 3.4, z: -0.2, len: 0.7, h: 0.9 },
  { id: 'bag', name: 'Baggage', mass: 30, ref: 'nose', pos: 3.9, z: -0.1, len: 0.6, h: 0.5 },
];

/** Defaults: a four-seat, single-engine general-aviation aircraft in cruise. */
export const DEFAULT_INPUTS: AircraftInputs = {
  wingNaca: '4415',
  aspectRatio: 9.5,
  sweepDeg: 0,
  taperRatio: 1,
  wingArea: 16.2,
  xacWing: 0.25,
  fuselageXacShift: -0.12,
  fuselageLength: 8.2,
  fuselageDiameter: 1.2,
  wingStation: 2.1,
  tailNaca: '0012',
  tailAspectRatio: 4.0,
  tailVolume: 0.65,
  tailArm: 4.6,
  tailEfficiency: 0.9,
  tailIncidenceDeg: 0,
  elevatorChordRatio: 0.35,
  ch0: 0,
  chAlpha: -0.1,
  chDelta: -0.32,
  stickGearing: 2.0,
  engineType: 'propeller',
  engineCount: 1,
  maxPowerKw: 310,
  propEfficiency: 0.82,
  maxThrustKn: 9,
  engineStation: 0.7,
  thrustLineZ: 0.12,
  engineMass: 230,
  massMode: 'components',
  massItems: DEFAULT_MASS_ITEMS,
  xcg: 0.24,
  mass: 1150,
  iyy: 2400,
  cd0: 0.027,
  oswald: 0.8,
  speedKts: 180,
  altitudeFt: 5000,
  flightPathDeg: 0,
  limitLoadFactor: 3.8,
  liftSlopeMethod: 'lifting-line',
};

/** Numeric sanity bounds used by the UI and by the engine to sanitise inputs. */
export const INPUT_BOUNDS: Partial<Record<keyof AircraftInputs, [number, number]>> = {
  aspectRatio: [2, 30],
  sweepDeg: [0, 60],
  taperRatio: [0.1, 1],
  wingArea: [2, 500],
  xacWing: [0.15, 0.4],
  fuselageXacShift: [-0.3, 0.1],
  fuselageLength: [2, 80],
  fuselageDiameter: [0.3, 8],
  wingStation: [0.2, 60],
  tailAspectRatio: [1, 10],
  tailVolume: [0.1, 1.5],
  tailArm: [0.5, 40],
  tailEfficiency: [0.5, 1.0],
  tailIncidenceDeg: [-10, 10],
  elevatorChordRatio: [0.05, 0.8],
  ch0: [-0.2, 0.2],
  chAlpha: [-1, 0.5],
  chDelta: [-1.5, -0.01],
  stickGearing: [0.1, 10],
  engineCount: [1, 2],
  maxPowerKw: [10, 20000],
  propEfficiency: [0.4, 0.92],
  maxThrustKn: [0.5, 1000],
  engineStation: [0, 80],
  thrustLineZ: [-3, 3],
  engineMass: [5, 50000],
  xcg: [0, 1],
  mass: [50, 400000],
  iyy: [10, 5e7],
  cd0: [0.005, 0.1],
  oswald: [0.5, 1],
  speedKts: [40, 450],
  altitudeFt: [0, 36000],
  flightPathDeg: [-15, 20],
  limitLoadFactor: [1.5, 9],
};

export function clampInputs(inp: AircraftInputs): AircraftInputs {
  const out = { ...inp };
  for (const [k, b] of Object.entries(INPUT_BOUNDS) as [keyof AircraftInputs, [number, number]][]) {
    const v = out[k];
    if (typeof v === 'number') {
      const n = Number.isFinite(v) ? v : (DEFAULT_INPUTS[k] as number);
      (out[k] as number) = Math.min(Math.max(n, b[0]), b[1]);
    }
  }
  return out;
}
