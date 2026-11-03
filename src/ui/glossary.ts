/** Short definitions used by hover hints across the app (and by the Help dialog). */
export const TERMS = {
  CG: 'Centre of gravity, in % of the mean aerodynamic chord (MAC) aft of the MAC leading edge. Limited to 0–100% MAC.',
  NP: 'Stick-fixed neutral point: the CG position where pitch stiffness C_mα = 0 with the elevator held fixed. x_np = x_ac + V_h·η·(C_Lα,t/C_Lα)·(1 − dε/dα). CG ahead of NP = stable.',
  NPF: "Stick-free neutral point NP′: the same, but with the elevator floating freely (pilot hands off). The tail term is scaled by (1 − τ·C_hα/C_hδ), so NP′ normally lies ahead of NP. CG ahead of NP′ gives a stable stick-force-vs-speed gradient.",
  MP: 'Stick-fixed maneuver point: the CG position where elevator angle per g, dδe/dn, becomes zero in a steady pull-up. Lies aft of NP because pitch damping (C_mq) adds stiffness in maneuvers.',
  MAC: 'Mean aerodynamic chord c̄: the reference chord for pitching moments and for CG/NP positions (here c̄ = S/b for a constant-chord wing).',
  SM: 'Static margin = x_np − x_cg (fraction of MAC). Green > 5%, amber 0–5%, red < 0 (CG aft of NP, statically unstable).',
  ENGINE: 'Powerplant. Its mass is part of the total mass, so moving it moves the CG; the thrust-line offset z_T adds a pitching moment.',
  LT: 'Tail arm l_t: distance from the wing aerodynamic centre to the tail aerodynamic centre.',
  VH: 'Tail volume coefficient V_h = S_t·l_t/(S·c̄).',
} as const;
