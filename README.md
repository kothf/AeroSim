# AeroSim Analytics

**Flight Mechanics II interactive suite.** A client-side digital twin of an aircraft configuration: pick NACA sections, geometry, mass distribution, powerplant and flight condition, and the app maps them onto the longitudinal equations of motion in real time.

```
NACA profile ─▶ thin airfoil theory ─▶ aero derivatives ─▶ static trim / CG ─▶ longitudinal EoM
                                                                            └▶ state-space A, B ─▶ eigenvalues ─▶ mode simulator
```

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine unit tests (vitest)
npm run build    # static bundle in dist/
```

## What it computes

| Module | Requirement | Implementation (`src/engine`) |
|---|---|---|
| 1. NACA & aero | FR-1.1 strict 4/5-digit parser (incl. reflexed 5-digit) | `naca.ts` |
| | FR-1.2 thin airfoil theory: α₀ = −(1/π)∫ dy_c/dx (cos θ − 1) dθ, A₁, A₂, c_m,c/4 | `thinAirfoil.ts` (Simpson's rule, split at the camber breakpoint) |
| | FR-1.3 finite wing: C_Lα = c_lα cosΛ / (1 + c_lα cosΛ/(πAR)) (Prandtl–Glauert), or DATCOM/Helmbold | `wing.ts` |
| 2. Static stability | FR-2.1 C_m = C_m0 + C_L(X_cg − X_ac) − V_h η C_Lt (+ thrust-line moment) | `model.ts` |
| | FR-2.2 X_np = X_ac + V_h η (C_Lαt/C_Lα)(1 − dε/dα); stick-free NP via (1 − τ C_hα/C_hδ) | `model.ts` |
| | FR-2.3 static margin gauge, amber below 5% MAC, red when CG is aft of NP | `ui/Workspace.tsx` |
| 3. Dynamics | FR-3.1 4×4 longitudinal A matrix (FRS layout), elevator B vector | `model.ts` `stateSpace` |
| | FR-3.2 eigenvalues (Faddeev–LeVerrier + Durand–Kerner), s-plane with CG root locus | `linalg.ts`, `ui/SPlane.tsx` |
| | FR-3.3 short-period / phugoid isolation, ωn, ζ, period, t½ / t₂ₓ, plus classical approximations | `modes.ts` |
| | FR-3.4 Pulse elevator: exact (matrix-exponential) time histories of Δα, Δq, Δu, Δh | `simulate.ts` |
| 4. Maneuvering | FR-4.1 dδe/dn and stick-fixed maneuver point X_mp | `model.ts` `maneuver` |
| | FR-4.2 hinge moments C_h0, C_hα, C_hδ → stick force per g, handling band, force at limit n | `model.ts` `maneuver` |
| Powerplant | thrust/power required vs available, throttle, V_max, excess-power climb, thrust-line moment in trim, dT/du in X_u and M_u | `propulsion.ts` |
| Installation | schematic drags: wing station (CG fixed in airframe), engine station (engine mass moves CG, I_yy by parallel axis), tail arm/size, elevator chord, span/sweep | `installation.ts`, `ui/Schematic.tsx` |
| Export | MATLAB Level 5 `.mat` (A, B, eigenvalues, derivatives, time histories); PDF via print stylesheet | `matfile.ts` |

### Conventions and assumptions

- SI units internally; speed in kts and altitude in ft at the UI. ISA troposphere.
- CG, NP and MP are fractions of MAC aft of the MAC leading edge. The wing is constant-chord, so the MAC sits at mid semi-span.
- Stability axes, small disturbances, Z_ẇ and Z_q neglected (Nelson, *Flight Stability and Automatic Control*). C_mq includes a 10% fuselage allowance.
- Thin airfoil section slope is 2π. Note the FRS prints C_m0,c/4 = (π/2)(A₂ − A₁); the correct Glauert result, used here, is **(π/4)(A₂ − A₁)** (it reproduces NACA 2412 c_m,c/4 = −0.053).
- Propeller: constant shaft power with Gagg–Ferrar lapse, capped at the momentum-theory static thrust (Raymer statistical diameter, figure of merit 0.7); jet: constant thrust, σ^0.7 lapse. Propeller normal-force (fin) effect on C_mα is not modelled.
- Stick force per g assumes the 1 g force is trimmed out with a tab. Handling band: 13–125 N/g; limit force 267 N (60 lbf, 14 CFR 23.143(c), centre stick).

## Verification

`npm test` runs 108 tests, including:

- thin airfoil results against closed-form integrals for 4-digit sections, and NACA 2412 textbook values;
- characteristic polynomial and roots of Nelson's Navion longitudinal matrix (short period −2.49 ± 2.60i, phugoid −0.017 ± 0.213i);
- NP is where C_mα = 0; dδe/dn = 0 at the maneuver point; trim satisfies C_m = 0 and C_L = W/(qS);
- phugoid period measured from the time history equals 2π/ω_d;
- constant-power vs constant-thrust X_u, engine-move CG/I_yy bookkeeping;
- MAT-file layout (also checked with `scipy.io.loadmat`);
- validation against published data (ISA 1976 tables, Abbott & von Doenhoff, Anderson, DATCOM, Nelson's Navion derivatives and roots, Etkin maneuver point); see [docs/physics-validation.md](docs/physics-validation.md);
- analysis + eigenvalues + 120 s time-history integration under 30 ms.
