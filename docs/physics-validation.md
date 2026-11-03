# AeroSim physics validation

This is an audit of the flight-mechanics engine in `src/engine` against standard textbooks, standards and NACA data.
Every check listed here is automated in `src/engine/__tests__/validation.test.ts`, except where the table says otherwise. The older unit tests stay in the other test files.

## References

| Key | Source |
|---|---|
| A&vD | Abbott & von Doenhoff, *Theory of Wing Sections*, Dover 1959 (camber-line constants, Appendix IV data) |
| And | Anderson, *Fundamentals of Aerodynamics*, ch. 4 (thin airfoil), ch. 5 (lifting line) |
| Nel | Nelson, *Flight Stability and Automatic Control*, 2nd ed., ch. 2–4 and App. B (Navion) |
| E&R | Etkin & Reid, *Dynamics of Flight: Stability and Control*, 3rd ed. |
| Ray | Raymer, *Aircraft Design: A Conceptual Approach* (DATCOM lift slope eq. 12.6, propeller sizing) |
| DAT | USAF Stability and Control DATCOM, sec. 1.2.2.1 |
| McC | McCormick, *Aerodynamics, Aeronautics and Flight Mechanics* (actuator-disk theory, figure of merit) |
| ISA | U.S. Standard Atmosphere 1976 / ICAO ISA |
| FAR | 14 CFR 23.143(c) control-force table (pre-amendment 23-64) |
| ML | Moler & Van Loan, *Nineteen Dubious Ways to Compute the Exponential of a Matrix*, SIAM Review 2003 |

## Results by module

| Area | Model in code | Check | Result |
|---|---|---|---|
| Atmosphere | ISA troposphere | T, p, ρ at 0 / 1524 / 3000 / 11 000 m vs ISA tables | ✅ within 0.03 % |
| Thin airfoil | Glauert Fourier coefficients, α_L0, c_m,c/4 = π/4 (A₂ − A₁) | NACA 2412: −2.08°, −0.053 (And); NACA 4412: −4.15°, −0.106 (And); closed-form integrals for 4-digit lines | ✅ exact to 1e-8 |
| | | vs A&vD wind-tunnel data (2412, 4412, 23012): α_L0 within 0.4°, c_m within 0.015; theory over-predicts \|c_m\| as expected from viscous decambering | ✅ |
| NACA 5-digit | A&vD r, k₁, k₂/k₁ tables, linear scaling with design C_l | π·A₁ = c_l,i = 0.30 for 230 and 231 lines, 0.60 for 430; 231 reflex line gives c_m ≈ 0 | ✅ |
| Flap / elevator | τ = 1 − (θ_h − sin θ_h)/π | independent integration of a hinged flat plate; Glauert ΔC_l/δ = 2(π − θ_h) + 2 sin θ_h | ✅ |
| 3D lift slope | Lifting line a₀/(1 + a₀/πA); Helmbold–DATCOM | A = 6: 4.712 (And); 4.529 at M 0, 5.236 at M 0.6 (Ray eq. 12.6 / DAT); slender-wing limit πA/2 | ✅ |
| Downwash | dε/dα = 2C_Lα,w/(πA) | Nel ch. 2 formula | ✅ (unit test) |
| Static stability | C_mα, stick-fixed NP (Nel ch. 2) | NP is where C_mα = 0; NP formula | ✅ (unit tests) |
| Stick-free NP | factor (1 − τ C_hα/C_hδ) | Nel ch. 2 expression | ✅ |
| Pitch damping | C_mq = −2.2 η a_t V_H l_t/c (10 % fuselage), C_mα̇ = C_mq,tail · dε/dα | Nel ch. 3 | ✅ |
| Maneuver point | from the pull-up equations | identity h_m − h_n = −C_mq/(2μ) (E&R), scaled by C_Lα/C_Lα,w for the code's normalisation | ✅ |
| Dimensional derivatives | Nel Table 3.x formulas | Navion: X_u, X_w, Z_u, Z_w, M_w, M_ẇ, M_q, Z_δe, M_δe computed from Nel App. B coefficients vs Nel's dimensional values | ✅ all within 3 % (rounding in Nel) |
| Longitudinal modes | full 4×4 eigenvalues | Navion: SP −2.51 ± 2.59i, phugoid −0.017 ± 0.213i (Nel ch. 4) | ✅ within 3 % |
| Mode approximations | SP 2-DOF, Lanchester phugoid | SP within 5 %, phugoid within 25 % of full (Navion); Lanchester ω_n = √2 g/u₀ and ζ = C_D/(√2 C_L) at M → 0 | ✅ |
| **State matrix, climb** | A matrix with θ₀ ≠ 0 | E⁻¹Ā from the implicit form with M_ẇ on the left (E&R) | ❌ **fixed** (see 1) |
| Propeller | T = η_p P/V, Gagg–Ferrar lapse 1.132σ − 0.132 | static-thrust cap vs momentum theory (McC) | ❌ **fixed** (see 2) |
| Jet | T = T₀ σ^0.7, dT/du = 0 | X_u = −2 qS C_D/(m u₀) (constant thrust) and −3 qS C_D/(m u₀) (constant power), E&R | ✅ (unit test) |
| **Time integration** | fixed-step RK4, dt = 0.02 s | stability for stiff inputs | ❌ **fixed** (see 3) |
| Handling limits | 267 N limit force | FAR table | ⚠️ value right, label wrong, **fixed** (see 4) |

## Errors found and fixed

1. **Missing gravity term in the pitch equation in climbing or descending flight.** The pitch equation carries M_ẇ·ẇ. The ẇ equation contains −g sin θ₀ · Δθ, so the M row of A needs −M_ẇ g sin θ₀ in its θ column (E&R, stability-axis equations). The code had 0 there. The error is zero in level flight. At γ = 10° it moves the default phugoid damping from 0.292 to 0.284. Fixed in `model.ts`, and covered by a test that builds A from the implicit form.

2. **Propeller static-thrust cap set too low.** The 1/V singularity of T = η_p P/V was capped at 12 N per kW, about half the 20–30 N/kW typical of light aircraft. For the default 310 kW aircraft this cut full-throttle thrust at every speed below about 130 kt. At 80 kt the code gave 3.1 kN, where η_p P/V gives 5.2 kN, and it under-predicted the climb rate by half (8.7 m/s instead of 16.2 m/s). The cap now comes from actuator-disk momentum theory, FM·P = T^{3/2}/√(2ρA) (McC). It uses a figure of merit of 0.7 and Raymer's statistical diameter D = 0.52·P^{1/4} (m, kW per engine, three-blade). That gives about 25 N/kW, and the cap only acts near stall speed. Cruise trim, V_max and the dynamics at cruise do not change.

3. **The time integrator diverged for stiff but stable configurations.** Fixed-step RK4 is only stable for |λ·dt| < 2.8. Inputs inside the UI bounds, such as I_yy = 10 kg m², give |λ| ≈ 1700 s⁻¹, so the time history went to NaN even though the aircraft is stable. The model is linear and the elevator input is piecewise constant, so the response now comes from the exact zero-order-hold solution y(t+h) = e^{Ah} y + ∫e^{As}ds·B u. It uses the augmented matrix exponential, computed by scaling and squaring (ML). This is exact to round-off and unconditionally stable. Steps that contain a pulse edge are split at the edge, so the result no longer depends on dt. It matches a fine-step RK4 reference to 1e-6, and it is also faster (about 6 ms for 120 s instead of 12 ms).

4. **Wrong label on the control-force limit.** The 60 lbf (267 N) temporary pitch force in 14 CFR 23.143(c) is the centre-stick value. The two-hand wheel value is 75 lbf. The model uses stick gearing, so the number stays and the label in the code, the UI and the README now says stick.

## Known simplifications (not errors)

These are standard textbook assumptions. They are listed so results are read with the right expectations.

- The neutral point is normalised by the wing lift slope and uses a constant V_H (Nel's approximate form). The exact Etkin form, which divides by the whole-aircraft C_Lα with the tail arm measured from the CG, differs by a few percent of MAC for large tails.
- The thin-airfoil a₀ = 2π ignores thickness and viscosity. Measured section slopes are about 5–10 % lower (A&vD App. IV).
- Z_ẇ, Z_q, C_Lq, C_Du and propeller normal force are neglected (Nel ch. 3). C_Lu uses Prandtl–Glauert only.
- The lifting-line sweep correction a₀ cos Λ is a first-order estimate. Use the DATCOM option for swept or low-AR wings.
- MAC = S/b assumes a constant-chord wing.
- The jet lapse σ^0.7 is an empirical fit for turbofans at constant Mach. Real lapse depends on bypass ratio and Mach number.
- The stick-force-per-g band of 13–125 N/g follows the MIL-F-8785C centre-stick limits roughly (3–28 lbf/g) and is not a certification limit.

## Running the checks

```
npm test        # all 108 tests; validation.test.ts holds the literature comparisons
```
