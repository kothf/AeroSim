/** Aircraft configuration inputs (the "digital twin" design parameters). */
import type { LiftSlopeMethod } from './wing';

export interface AircraftInputs {
  // Main wing
  wingNaca: string;
  aspectRatio: number;
  sweepDeg: number;
  wingArea: number; // m^2
  xacWing: number; // fraction of MAC
  fuselageXacShift: number; // fraction of MAC (Munk/Multhopp body effect, negative = forward)
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
  // Mass & balance
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

/** Defaults: a four-seat, single-engine general-aviation aircraft in cruise. */
export const DEFAULT_INPUTS: AircraftInputs = {
  wingNaca: '4415',
  aspectRatio: 9.5,
  sweepDeg: 0,
  wingArea: 16.2,
  xacWing: 0.25,
  fuselageXacShift: -0.12,
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
  wingArea: [2, 500],
  xacWing: [0.15, 0.4],
  fuselageXacShift: [-0.3, 0.1],
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
