/** Short definitions used by hover hints across the app (and by the Help dialog). */
export const TERMS = {
  CG: 'Centre of gravity, in % of the mean aerodynamic chord (MAC) aft of the MAC leading edge. Limited to 0–100% MAC.',
  NP: 'Stick-fixed neutral point: the CG position where pitch stiffness C_mα = 0 with the elevator held fixed. x_np = x_ac + V_h·η·(C_Lα,t/C_Lα)·(1 − dε/dα). CG ahead of NP = stable.',
  NPF: "Stick-free neutral point NP′: the same, but with the elevator floating freely (pilot hands off). The tail term is scaled by (1 − τ·C_hα/C_hδ), so NP′ normally lies ahead of NP. CG ahead of NP′ gives a stable stick-force-vs-speed gradient.",
  MP: 'Stick-fixed maneuver point: the CG position where elevator angle per g, dδe/dn, becomes zero in a steady pull-up. Lies aft of NP because pitch damping (C_mq) adds stiffness in maneuvers.',
  MAC: 'Mean aerodynamic chord c̄: the reference chord for pitching moments and for CG/NP positions. For a trapezoidal wing c̄ = (2/3)c_r(1+λ+λ²)/(1+λ), at y = (b/6)(1+2λ)/(1+λ) from the centreline (c̄ = S/b when λ = 1).',
  AC: 'Aerodynamic centre: the point about which the pitching moment does not change with angle of attack. Wing alone ≈ 25% MAC (thin airfoil theory); "AC wb" adds the fuselage shift (Munk/Multhopp, usually forward). The AC of the whole aircraft (wing + body + tail) is the stick-fixed neutral point NP.',
  AC_AIRCRAFT: 'The whole-aircraft aerodynamic centre coincides with the stick-fixed NP.',
  CP_WING: 'Wing centre of pressure at the trim condition: where the wing lift alone acts with no moment, x_cp = x_ac − c_m,ac/C_L,w. Unlike the AC it moves with angle of attack: forward as C_L rises, far aft at low C_L for a cambered wing (c_m,ac < 0).',
  CP: 'Centre of pressure of the whole aircraft at trim: where the total aerodynamic force (wing + tail + body) acts. In trimmed flight its moment about the CG balances the thrust moment, x_cp = x_cg + C_m,T/C_L, so it sits on the CG when the thrust line passes through the CG.',
  LENGTH: 'Overall length: nose to the aftmost point of the fuselage or tailplane.',
  SM: 'Static margin = x_np − x_cg (fraction of MAC). Green > 5%, amber 0–5%, red < 0 (CG aft of NP, statically unstable).',
  ENGINE: 'Powerplant. Its mass is part of the total mass, so moving it moves the CG; the thrust-line offset z_T adds a pitching moment.',
  LT: 'Tail arm l_t: distance from the wing aerodynamic centre to the tail aerodynamic centre.',
  VH: 'Tail volume coefficient V_h = S_t·l_t/(S·c̄).',
} as const;
