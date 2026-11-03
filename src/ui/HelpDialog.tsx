import { useEffect, useRef, useState } from 'react';

interface Section {
  id: string;
  title: string;
  body: React.ReactNode;
}

const F = ({ children }: { children: React.ReactNode }) => <div className="formula">{children}</div>;

const GLOSSARY: [string, string][] = [
  ['MAC (c̄)', 'Mean aerodynamic chord: the reference chord. All CG, NP and MP positions are given in % MAC, measured aft of the MAC leading edge.'],
  ['CG (x_cg)', 'Centre of gravity. Limited to 0–100% MAC. The most important handling parameter: moving it aft reduces stability.'],
  ['AC (x_ac)', 'Aerodynamic centre: point about which the pitching moment does not change with α (≈ 25% chord). The fuselage shifts the aircraft AC forward (Body Δx_ac).'],
  ['NP (x_np)', 'Stick-fixed neutral point: the CG position where C_mα = 0 with the elevator fixed. CG ahead of NP = statically stable.'],
  ["NP′ (x′_np)", 'Stick-free neutral point: as NP, but with the elevator free to float under its hinge moments. Normally ahead of NP. Sets the sign of the stick-force-vs-speed gradient.'],
  ['MP (x_mp)', 'Stick-fixed maneuver point: the CG position where the elevator angle per g is zero. Aft of NP because of pitch damping.'],
  ['Static margin', 'x_np − x_cg. Stick-free margin: x′_np − x_cg. Maneuver margin: x_mp − x_cg.'],
  ['V_h', 'Horizontal tail volume coefficient S_t l_t / (S c̄).'],
  ['l_t', 'Tail arm: wing AC to tail AC distance.'],
  ['η', 'Tail efficiency q_t / q (dynamic pressure ratio at the tail).'],
  ['ε, dε/dα', 'Downwash angle at the tail and its gradient with α; dε/dα = 2 C_Lα,w / (π AR).'],
  ['τ', 'Elevator effectiveness dα₀/dδe from thin-airfoil flap theory (depends on c_e/c_t).'],
  ['C_L, C_D, C_m', 'Lift, drag and pitching-moment coefficients (C_m about the CG, positive nose-up).'],
  ['C_Lα, C_mα', 'Lift-curve slope and pitch stiffness, per radian.'],
  ['C_mq, C_mα̇', 'Pitch damping derivatives (per radian of non-dimensional pitch rate / α-rate).'],
  ['C_h0, C_hα, C_hδ', 'Elevator hinge-moment coefficient and its slopes with tail angle and elevator deflection.'],
  ['δe', 'Elevator deflection, positive trailing edge down (nose-down). Negative δe pulls the nose up.'],
  ['n', 'Load factor L/W in g.'],
  ['X_u … M_q', 'Dimensional stability derivatives: X, Z = axial/normal force per unit mass, M = pitching moment per unit inertia, with respect to u (speed), w (vertical velocity), ẇ, q (pitch rate).'],
  ['λ = n ± iω', 'Eigenvalue (pole). n < 0 decays, n > 0 grows. ω_n = |λ|, ζ = −n/ω_n, period T = 2π/ω.'],
  ['Short period', 'Fast pitch / angle-of-attack oscillation, usually well damped (ζ ≈ 0.3–0.8), period of a second or two.'],
  ['Phugoid', 'Slow exchange of speed and height at nearly constant α, lightly damped, period of tens of seconds.'],
  ['z_T', 'Thrust-line offset below the CG. Positive gives a nose-up thrust moment.'],
  ['σ', 'Density ratio ρ / ρ₀ (ISA).'],
];

const SECTIONS: Section[] = [
  {
    id: 'start',
    title: 'Quick start',
    body: (
      <>
        <p>AeroSim Analytics is a digital twin of a light aircraft's longitudinal flight mechanics. Every change you make recomputes the whole model (aerodynamics → trim → state-space model → modes → maneuvering) in a few milliseconds.</p>
        <ol>
          <li><b>Set the configuration</b> in the left sidebar: wing and tail NACA codes, geometry, mass, powerplant and flight condition. Every field has a slider and an <span className="hint static">i</span> hint.</li>
          <li><b>Or drag the schematic</b>: move the wing, tail, elevator hinge, CG or engine directly on the drawing.</li>
          <li><b>Watch the margin gauge</b> at the top. It turns amber below 5% static margin and red when the CG goes aft of the neutral point.</li>
          <li><b>Pick a graph</b>: C_m–α (static stability), s-Plane poles (dynamic modes), or Time history. Press <b>Pulse elevator</b> to replay the response to an elevator pulse.</li>
          <li><b>Read the numbers</b> in the bottom workspace. Hover any <span className="hint static">i</span> for its definition.</li>
          <li><b>Export</b> the model to MATLAB (.MAT) or print the screen to PDF.</li>
        </ol>
        <p>Hover any legend entry, marker label (CG, NP, NP′, MP) or chart title for a short explanation. Press <kbd>?</kbd> to open this help at any time.</p>
      </>
    ),
  },
  {
    id: 'points',
    title: 'CG, NP, NP′ and MP',
    body: (
      <>
        <p>All four are positions along the mean aerodynamic chord, in % MAC from its leading edge. They are drawn on the gauge, as ticks on the fuselage in the schematic, and on the MAC ruler beside it.</p>
        <h4>Stick-fixed neutral point, NP</h4>
        <p>The CG position at which the aircraft is neutrally stable with the elevator held fixed: dC_m/dα = 0.</p>
        <F>x_np = x_ac + V_h · η · (C_Lα,t / C_Lα,w) · (1 − dε/dα)</F>
        <p>The static margin x_np − x_cg tells you how strongly the aircraft returns to its trimmed angle of attack after a disturbance. C_mα = −C_Lα,w · (x_np − x_cg).</p>
        <h4>Stick-free neutral point, NP′</h4>
        <p>If the pilot lets go of the stick, the elevator floats to the position where its hinge moment is zero. With C_hα &lt; 0 it floats trailing-edge up as the tail angle increases, which reduces the tail's restoring lift. The tail term is multiplied by the free-elevator factor:</p>
        <F>x′_np = x_ac + V_h · η · (C_Lα,t / C_Lα,w) · (1 − dε/dα) · (1 − τ · C_hα / C_hδ)</F>
        <p>NP′ is therefore usually ahead of NP. If the CG is behind NP′, the pilot feels a reversed stick-force gradient with speed (the aircraft wants to speed up when trimmed slower) even though it may still be stick-fixed stable.</p>
        <h4>Maneuver point, MP</h4>
        <p>In a steady pull-up the aircraft pitches at q = (n − 1) g / u₀, which adds tail angle of attack and pitch damping. The CG position where no extra elevator is needed per g is the maneuver point:</p>
        <F>x_mp = x_np − (C_Lα / C_Lα,w) · C_mq · (g c̄ / 2u₀²) / C_W</F>
        <p>Because C_mq &lt; 0, MP lies aft of NP. The maneuver margin x_mp − x_cg sets the elevator angle and stick force per g.</p>
        <h4>Healthy order</h4>
        <p>Front to back: <b>CG → NP′ → NP → MP</b>. A CG between NP′ and NP is stick-fixed stable but stick-free unstable.</p>
      </>
    ),
  },
  {
    id: 'gauge',
    title: 'Margin gauge & alerts',
    body: (
      <>
        <p>The gauge runs from 0 to 100% MAC. The coloured bar spans from the CG to NP. Colours and badges:</p>
        <ul>
          <li><b className="c-good">✓ Statically stable</b>: static margin above 5% MAC.</li>
          <li><b className="c-warn">! Marginal</b>: 0–5% MAC. The layout turns amber and a banner suggests a CG position for a 5% margin.</li>
          <li><b className="c-crit">✕ Unstable</b>: CG aft of NP. C_mα becomes positive, the C_m–α line slopes upward, a real pole enters the right half of the s-plane and the layout turns red.</li>
        </ul>
        <p>The handling badge (workspace, right column) shows whether stick force per g is inside the 13–125 N/g band, too light, too heavy, or reversed.</p>
      </>
    ),
  },
  {
    id: 'schematic',
    title: 'Using the schematic',
    body: (
      <>
        <p>The top view has the nose up and the side view has the nose to the left. Everything you can drag changes the corresponding sidebar value:</p>
        <ul>
          <li><b>Wing body</b>: slides the wing along the fuselage. The CG and tail stay fixed in the airframe, so the CG in % MAC and the tail arm change (moving the wing aft makes the aircraft more stable). The wing stops when the CG reaches its leading or trailing edge.</li>
          <li><b>Round handle at the wing tip</b>: left/right changes span (aspect ratio at constant area), up/down changes sweep.</li>
          <li><b>Tail body</b>: changes the tail arm l_t at constant tail area, so V_h changes too.</li>
          <li><b>Round handle at the tail tip</b>: changes the tail size (V_h) at constant tail aspect ratio.</li>
          <li><b>Elevator hinge line</b> (dark green band): changes the elevator chord ratio and with it τ.</li>
          <li><b>CG symbol</b>: moves the CG within 0–100% MAC.</li>
          <li><b>Engine</b> (orange): changes the engine station. Its mass moves the CG (Δx_cg = m_e Δx / m) and I_yy is updated with the parallel-axis theorem. In the side view, dragging up/down changes the thrust-line offset z_T.</li>
        </ul>
        <p>Hold <kbd>Shift</kbd> while dragging for five times finer control.</p>
      </>
    ),
  },
  {
    id: 'aero',
    title: 'Module 1: airfoil & wing',
    body: (
      <>
        <p><b>NACA codes.</b> 4-digit <i>MPTT</i>: M = max camber (% chord), P = its position (tenths of chord), TT = thickness (%). Example 4415: 4% camber at 40% chord, 15% thick. 5-digit <i>LPQTT</i>: design lift coefficient 0.15·L, max camber at 0.05·P chord, Q = 0 normal or 1 reflexed. Invalid codes are rejected and the last valid code stays in use.</p>
        <p><b>Thin airfoil theory</b> expands the camber-line slope in a Fourier series with x = (1 − cos θ)/2 and integrates it numerically:</p>
        <F>α₀ = −(1/π) ∫₀^π (dy_c/dx)(cos θ − 1) dθ</F>
        <F>A_n = (2/π) ∫₀^π (dy_c/dx) cos nθ dθ,   c_m,c/4 = (π/4)(A₂ − A₁),   c_lα = 2π</F>
        <p className="note">The FRS prints (π/2)(A₂ − A₁); the correct Glauert coefficient is π/4, which reproduces the classical NACA 2412 value c_m,c/4 = −0.053.</p>
        <p><b>Finite wing (FR-1.3).</b> Lifting-line correction with sweep and Prandtl–Glauert compressibility:</p>
        <F>C_Lα = a cos Λ / (1 + a cos Λ / (π AR)),   a = c_lα / √(1 − M²)</F>
        <p>The DATCOM option uses the Helmbold–Diederich formula, which is better for low aspect ratio or swept wings.</p>
      </>
    ),
  },
  {
    id: 'static',
    title: 'Module 2: static stability & trim',
    body: (
      <>
        <F>C_m = C_m,ac + C_L,w (x_cg − x_ac) − V_h η C_L,t + C_m,T</F>
        <p>Tail angle of attack α_t = α (1 − dε/dα) + ε₀-term + i_t + τ δe. Trim solves C_m = 0 and C_L = W/(q S) for α and δe at the chosen speed and altitude.</p>
        <p><b>C_m–α chart.</b> Blue: current CG with δe = 0. Orange: current CG with the trim elevator. Dashed: CG at NP (zero slope). Drag the CG and watch the slope rotate through the neutral line.</p>
      </>
    ),
  },
  {
    id: 'dynamic',
    title: 'Module 3: dynamic modes',
    body: (
      <>
        <p>Small-disturbance longitudinal equations in stability axes, state x = [Δu, Δw, Δq, Δθ]:</p>
        <F>ẋ = A x + B δe,   A = [[X_u, X_w, 0, −g cos θ₀], [Z_u, Z_w, u₀, −g sin θ₀], [M_u + M_ẇ Z_u, M_w + M_ẇ Z_w, M_q + M_ẇ u₀, 0], [0, 0, 1, 0]]</F>
        <p>The four eigenvalues of A are split into the <b>short period</b> (higher frequency pair) and the <b>phugoid</b> (lower frequency pair). If the CG goes far aft, the short period splits into two real roots and one of them becomes positive (divergence).</p>
        <ul>
          <li><b>s-Plane</b>: × = current poles, dots = the poles as the CG is swept across the MAC (red when the CG is aft of NP). Click a dot to set the CG. Use “Phugoid zoom” to see the small phugoid pair.</li>
          <li><b>Time history</b>: response to an elevator pulse, propagated for 120 s with the exact matrix-exponential (zero-order-hold) solution of the linear model. Left: Δα and Δq (short period, first 15 s). Right: Δu and Δh (phugoid). Set the pulse size and duration with the sliders under the plots.</li>
        </ul>
        <p>Characteristics: ω_n = |λ|, ζ = −Re λ / ω_n, T = 2π / Im λ, t½ = ln 2 / |Re λ|. The hints in the workspace also show the classical approximations: short period ω_n² ≈ Z_w M_q − M_w u₀ and the Lanchester phugoid ω_n ≈ √2 · g/u₀ (from −Z_u g/u₀).</p>
      </>
    ),
  },
  {
    id: 'maneuver',
    title: 'Module 4: maneuvering & stick forces',
    body: (
      <>
        <p>Steady symmetric pull-up at load factor n. The extra lift and the pitch rate q = (n − 1)g/u₀ give, per g:</p>
        <F>dδe/dn = −(C_mα C_W + C_Lα C_mq ĝ) / (C_Lα C_mδe − C_Lδe C_mα),   ĝ = g c̄ / (2u₀²)</F>
        <p>Hinge moment C_h = C_h0 + C_hα α_t + C_hδ δe. Stick force F_s = G · η · q · S_e · c_e · C_h (positive = pull), where G is the stick gearing. The stick force per g follows from dC_h/dn.</p>
        <p>Handling indicators: 13–125 N/g (≈ 3–28 lbf/g) acceptable band, and the force needed to reach the limit load factor compared with 267 N (60 lbf, 14 CFR 23.143(c), centre stick, temporary). The 1 g force is assumed trimmed out with a tab.</p>
      </>
    ),
  },
  {
    id: 'power',
    title: 'Powerplant',
    body: (
      <>
        <ul>
          <li><b>Propeller</b>: constant shaft power, T = η_p P / V, altitude lapse P/P₀ = 1.132σ − 0.132. Because thrust falls with speed, dT/du = −T/u₀ and X_u = −3 q S C_D / (m u₀).</li>
          <li><b>Jet</b>: constant thrust, T/T₀ = σ^0.7, X_u = −2 q S C_D / (m u₀).</li>
          <li>Thrust required = D + W sin γ₀. Throttle = T_req / T_avail (above 100% the condition can't be held). V_max: where full thrust equals drag in level flight. Climb: (T_avail − D)V/W.</li>
          <li>Thrust line z_T below the CG adds C_m,T = T z_T / (q S c̄) to trim and M_u = z_T dT/du / I_yy to the dynamics. It does not move the neutral point (propeller normal force is not modelled).</li>
        </ul>
      </>
    ),
  },
  {
    id: 'glossary',
    title: 'Glossary',
    body: (
      <dl className="glossary">
        {GLOSSARY.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
    ),
  },
  {
    id: 'assumptions',
    title: 'Assumptions & export',
    body: (
      <>
        <ul>
          <li>SI units internally; speed in knots and altitude in feet in the UI. ISA troposphere.</li>
          <li>Constant-chord (rectangular, optionally swept) wing; MAC = S/b at mid semi-span.</li>
          <li>Stability axes, small disturbances; Z_ẇ and Z_q neglected (Nelson). C_mq includes a 10% fuselage allowance.</li>
          <li>Section lift slope 2π (thin airfoil theory, no thickness correction).</li>
          <li>Engine latency (workspace) is the time for the full recompute; the requirement is under 30 ms.</li>
        </ul>
        <p><b>Export .MAT</b> writes a MATLAB Level 5 file with A, B, eigenvalues, ω_n/ζ, all derivatives, NP/MP and the time histories. <b>Export PDF</b> prints the current screen (use “Save as PDF” in the print dialog).</p>
      </>
    ),
  },
];

export function HelpDialog({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: string }) {
  const [active, setActive] = useState(initial ?? 'start');
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (initial) setActive(initial);
  }, [initial, open]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const sec = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0];
  return (
    <dialog ref={ref} className="help" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} aria-label="Help">
      <div className="help-shell">
        <nav className="help-nav" aria-label="Help sections">
          <div className="help-brand">Help</div>
          {SECTIONS.map((s) => (
            <button key={s.id} className={s.id === active ? 'on' : ''} onClick={() => setActive(s.id)}>{s.title}</button>
          ))}
        </nav>
        <article className="help-body">
          <header>
            <h2>{sec.title}</h2>
            <button className="btn ghost" onClick={onClose} aria-label="Close help">Close ✕</button>
          </header>
          {sec.body}
        </article>
      </div>
    </dialog>
  );
}
