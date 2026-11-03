/** International Standard Atmosphere (troposphere, h < 11 km) and unit helpers. SI units throughout. */

export const G0 = 9.80665; // m/s^2
export const R_AIR = 287.05287; // J/(kg K)
export const GAMMA_AIR = 1.4;

export const KT_TO_MS = 0.514444;
export const FT_TO_M = 0.3048;
export const N_TO_LBF = 0.224809;
export const DEG = Math.PI / 180;

export interface AtmosphereState {
  altitude: number; // m
  temperature: number; // K
  pressure: number; // Pa
  density: number; // kg/m^3
  speedOfSound: number; // m/s
}

export function isa(altitudeM: number): AtmosphereState {
  const h = Math.min(Math.max(altitudeM, 0), 11000);
  const T = 288.15 - 0.0065 * h;
  const p = 101325 * Math.pow(T / 288.15, G0 / (0.0065 * R_AIR));
  const rho = p / (R_AIR * T);
  return { altitude: h, temperature: T, pressure: p, density: rho, speedOfSound: Math.sqrt(GAMMA_AIR * R_AIR * T) };
}
