/** Labels, hints and slider ranges for every design parameter shown in the sidebar. */
import type { AircraftInputs } from '../engine';

export interface ParamInfo {
  label: string;
  unit?: string;
  hint: string;
  /** slider range and step (a practical sub-range of the validation bounds) */
  slider: [number, number, number];
}

type NumericKey = { [K in keyof AircraftInputs]: AircraftInputs[K] extends number ? K : never }[keyof AircraftInputs];

export const PARAM_INFO: Record<NumericKey, ParamInfo> = {
  xcg: { label: 'CG position', unit: '% MAC', hint: 'Centre of gravity, measured aft of the leading edge of the mean aerodynamic chord (MAC). Limited to 0–100% MAC. Moving it aft reduces the static margin; past the neutral point (NP) the aircraft is statically unstable.', slider: [0, 100, 0.5] },
  mass: { label: 'Mass', unit: 'kg', hint: 'Total aircraft mass m (includes the engine). Sets the weight W = m g and the trim lift coefficient C_L = W/(q S).', slider: [300, 6000, 10] },
  iyy: { label: 'Pitch inertia I_yy', unit: 'kg·m²', hint: 'Moment of inertia about the pitch axis through the CG. Larger I_yy lowers the short-period frequency.', slider: [300, 20000, 50] },
  aspectRatio: { label: 'Aspect ratio AR', hint: 'AR = b²/S. Higher AR raises the 3D lift slope C_Lα and lowers induced drag; the span changes at constant wing area.', slider: [4, 20, 0.1] },
  sweepDeg: { label: 'Sweep Λ', unit: '°', hint: 'Quarter-chord sweep. Reduces the effective lift slope (C_Lα ∝ cos Λ in the lifting-line correction).', slider: [0, 45, 0.5] },
  wingArea: { label: 'Wing area S', unit: 'm²', hint: 'Reference (planform) area. With AR it fixes the span b = √(AR·S) and the MAC c̄ = S/b.', slider: [6, 60, 0.1] },
  wingStation: { label: 'Wing root LE station', unit: 'm', hint: 'Fuselage station (aft of the nose) of the wing root leading edge. Moving the wing keeps the CG fixed in the airframe, so CG %MAC and the tail arm change.', slider: [0.5, 5, 0.01] },
  xacWing: { label: 'Wing aerodynamic centre x_ac', unit: 'MAC', hint: 'Wing aerodynamic centre as a fraction of MAC (≈ 0.25 from thin airfoil theory).', slider: [0.2, 0.3, 0.005] },
  fuselageXacShift: { label: 'Body Δx_ac', unit: 'MAC', hint: 'Shift of the aerodynamic centre caused by the fuselage and nacelles (Munk/Multhopp effect). Negative = forward, which is destabilising.', slider: [-0.25, 0.05, 0.005] },
  cd0: { label: 'Zero-lift drag C_D0', hint: 'Parasite drag coefficient of the drag polar C_D = C_D0 + C_L²/(π e AR).', slider: [0.015, 0.06, 0.001] },
  oswald: { label: 'Oswald efficiency e', hint: 'Span efficiency factor in the induced-drag term C_L²/(π e AR). 1 = elliptic loading.', slider: [0.6, 1, 0.01] },
  tailVolume: { label: 'Tail volume V_h', hint: 'Horizontal tail volume coefficient V_h = S_t l_t / (S c̄). The main lever on the neutral point and pitch damping.', slider: [0.2, 1.2, 0.01] },
  tailArm: { label: 'Tail arm l_t', unit: 'm', hint: 'Distance from the wing aerodynamic centre to the tail aerodynamic centre.', slider: [2, 10, 0.05] },
  tailAspectRatio: { label: 'Tail aspect ratio AR_t', hint: 'Aspect ratio of the horizontal tail; sets the tail lift slope C_Lα,t.', slider: [2, 8, 0.1] },
  tailEfficiency: { label: 'Tail efficiency η', hint: 'Dynamic pressure ratio at the tail η = q_t/q (wake and slipstream effects).', slider: [0.6, 1, 0.01] },
  tailIncidenceDeg: { label: 'Tail incidence i_t', unit: '°', hint: 'Setting angle of the tailplane relative to the wing reference. Changes C_m0 and the trim elevator angle.', slider: [-6, 6, 0.1] },
  elevatorChordRatio: { label: 'Elevator chord c_e/c_t', hint: 'Elevator chord as a fraction of tail chord. Sets the elevator effectiveness τ = dα₀/dδe from thin-airfoil flap theory.', slider: [0.1, 0.6, 0.01] },
  ch0: { label: 'Hinge moment C_h0', hint: 'Elevator hinge moment coefficient at zero tail angle and zero deflection (camber/tab effect).', slider: [-0.05, 0.05, 0.001] },
  chAlpha: { label: 'Hinge moment slope C_hα', unit: '/rad', hint: 'Change of elevator hinge moment with tail angle of attack. Negative values let the elevator float trailing-edge up and move the stick-free NP forward.', slider: [-0.6, 0.2, 0.01] },
  chDelta: { label: 'Hinge moment slope C_hδ', unit: '/rad', hint: 'Change of elevator hinge moment with elevator deflection (restoring when negative). Drives stick force per g.', slider: [-1, -0.05, 0.01] },
  stickGearing: { label: 'Stick gearing G', unit: 'rad/m', hint: 'Elevator rotation per unit stick travel. Stick force F_s = G·η·q·S_e·c_e·C_h.', slider: [0.5, 5, 0.05] },
  maxPowerKw: { label: 'Max power (total)', unit: 'kW', hint: 'Sea-level shaft power of all engines. Lapses with altitude as P/P₀ = 1.132σ − 0.132.', slider: [50, 1500, 5] },
  propEfficiency: { label: 'Propeller efficiency η_p', hint: 'Thrust power / shaft power. T = η_p P / V.', slider: [0.5, 0.9, 0.01] },
  maxThrustKn: { label: 'Max thrust (total)', unit: 'kN', hint: 'Sea-level thrust of all jet engines (assumed constant with speed). Lapses with altitude as σ^0.7.', slider: [1, 60, 0.5] },
  engineStation: { label: 'Engine station', unit: 'm', hint: 'Fuselage station of the engine (aft of the nose). The engine mass is part of the total mass, so moving it moves the CG.', slider: [0, 8, 0.05] },
  thrustLineZ: { label: 'Thrust line below CG z_T', unit: 'm', hint: 'Vertical offset of the thrust line below the CG. Positive gives a nose-up thrust moment C_m,T = T z_T/(q S c̄) and couples speed into pitch (M_u).', slider: [-1, 1, 0.01] },
  engineMass: { label: 'Engine mass', unit: 'kg', hint: 'Mass of the powerplant (already included in total mass). Used to move the CG when the engine is moved.', slider: [20, 1500, 5] },
  speedKts: { label: 'Speed V', unit: 'kts', hint: 'True airspeed of the trimmed reference flight condition.', slider: [60, 300, 1] },
  altitudeFt: { label: 'Altitude h', unit: 'ft', hint: 'Pressure altitude (ISA). Sets density, Mach number and engine lapse.', slider: [0, 25000, 100] },
  flightPathDeg: { label: 'Flight path γ₀', unit: '°', hint: 'Reference climb angle (θ₀ in stability axes). Enters the gravity terms of the A matrix and the thrust required.', slider: [-10, 15, 0.5] },
  limitLoadFactor: { label: 'Limit load factor n', unit: 'g', hint: 'Design limit load factor used for the maneuver charts and the force-at-limit check (3.8 g normal category).', slider: [2, 9, 0.1] },
  fuselageLength: { label: 'Fuselage length', unit: 'm', hint: 'Fuselage length from the nose to the tail cone. The overall aircraft length is the larger of this and the tail trailing edge station. Limits where the wing and engine can be installed.', slider: [4, 20, 0.1] },
  fuselageDiameter: { label: 'Fuselage diameter', unit: 'm', hint: 'Maximum fuselage width/height. Drawn in the schematic; a wide body moves the wing-body aerodynamic centre forward (set the body Δx_ac to match).', slider: [0.6, 4, 0.05] },
  taperRatio: { label: 'Taper ratio λ', hint: 'λ = tip chord / root chord. Root chord c_r = 2S/(b(1+λ)); MAC c̄ = (2/3)c_r(1+λ+λ²)/(1+λ), located at y = (b/6)(1+2λ)/(1+λ). λ = 1 is a rectangular wing; 0.4–0.5 gives near-elliptic loading.', slider: [0.2, 1, 0.01] },
  engineCount: { label: 'Engines', hint: '1 = centreline engine, 2 = wing-mounted pair.', slider: [1, 2, 1] },
};
