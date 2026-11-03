import type { AnalysisResult, ModeInfo } from '../engine';
import { DEG, N_TO_LBF } from '../engine';
import { fixed } from './scale';
import { Hint } from './Fields';
import { TERMS } from './glossary';

const root = (m: ModeInfo) => {
  const [a, b] = m.roots;
  if (m.kind === 'oscillatory') return `${fixed(a.re, 3)} ± ${fixed(Math.abs(a.im), 3)}i`;
  return `${fixed(a.re, 3)}, ${fixed(b.re, 3)} (real)`;
};

function Row({ k, v, hint }: { k: React.ReactNode; v: React.ReactNode; hint?: string }) {
  return (
    <div className="kv">
      <span className="k">{k}{hint && <Hint text={hint} />}</span>
      <span className="v">{v}</span>
    </div>
  );
}

export function MarginGauge({ r, onExplain }: { r: AnalysisResult; onExplain?: () => void }) {
  const { xcg } = r.inputs;
  const { xnp, xnpFree, status, staticMargin } = r.stat;
  const xmp = r.man.xmp;
  const pos = (v: number) => `${Math.min(Math.max(v, 0), 1) * 100}%`;
  const label = status === 'stable' ? 'Statically stable' : status === 'marginal' ? 'Marginal stability' : 'Statically UNSTABLE';
  const icon = status === 'stable' ? '✓' : status === 'marginal' ? '!' : '✕';
  return (
    <div className={`gauge st-${status}`} role="status" aria-live="polite">
      <div className="gauge-head">
        <span className="gauge-left">
          <span className="badge"><span className="badge-icon" aria-hidden>{icon}</span>{label}</span>
          {onExplain && <button className="linkish" onClick={onExplain}>What are CG, NP, NP′ and MP?</button>}
        </span>
        <span className="gauge-sm"><Hint text="Static margin = x_np − x_cg (stick-fixed). Positive = stable. Stick-free margin uses the floating-elevator neutral point; maneuver margin = x_mp − x_cg. Green > 5% MAC, amber 0–5%, red when the CG is aft of the NP." /> Static margin <b>{(staticMargin * 100).toFixed(1)}%</b> MAC · stick-free {(r.stat.staticMarginFree * 100).toFixed(1)}% · maneuver {(r.man.maneuverMargin * 100).toFixed(1)}%</span>
      </div>
      <div className="gauge-track" >
        <div className="gauge-fill" style={{ left: pos(Math.min(xcg, xnp)), width: `${Math.abs(xnp - xcg) * 100}%` }} />
        {[0, 0.25, 0.5, 0.75, 1].map((t) => <span key={t} className="gauge-tick" style={{ left: pos(t) }}>{t * 100}</span>)}
        <span className="gauge-mk mk-npf" style={{ left: pos(xnpFree) }} data-tip={`${TERMS.NPF} Now ${(xnpFree * 100).toFixed(1)}% MAC.`}>NP'</span>
        <span className="gauge-mk mk-np" style={{ left: pos(xnp) }} data-tip={`${TERMS.NP} Now ${(xnp * 100).toFixed(1)}% MAC.`}>NP</span>
        <span className="gauge-mk mk-mp" style={{ left: pos(xmp) }} data-tip={`${TERMS.MP} Now ${(xmp * 100).toFixed(1)}% MAC.`}>MP</span>
        <span className="gauge-cg" style={{ left: pos(xcg) }} data-tip={`${TERMS.CG} Now ${(xcg * 100).toFixed(1)}% MAC.`}>CG</span>
      </div>
    </div>
  );
}

export function Workspace({ r, latency }: { r: AnalysisResult; latency: number }) {
  const { aero: a, stat, ss, man, prop } = r;
  const sp = ss.modes.shortPeriod;
  const ph = ss.modes.phugoid;
  const hq = man.handling;
  const hqLabel = { ok: 'Within handling band', 'too-light': 'Too light (PIO risk)', 'too-heavy': 'Too heavy', reversed: 'Reversed gradient' }[hq.status];
  const hqStatus = hq.status === 'ok' ? 'stable' : hq.status === 'reversed' ? 'unstable' : 'marginal';
  return (
    <section className="workspace" aria-label="Live analytical coefficients">
      <div className="ws-col">
        <h3>Aero stats</h3>
        <Row k={<>α<sub>0</sub> wing (2D)</>} hint="Zero-lift angle of attack of the wing section from thin airfoil theory: α₀ = −(1/π)∫ dy_c/dx (cos θ − 1) dθ. Cambered sections have α₀ < 0." v={`${fixed(a.wing.alpha0 / DEG, 2)}°`} />
        <Row k={<>C<sub>m,c/4</sub> wing (2D)</>} hint="Section pitching moment about the quarter chord (the aerodynamic centre in thin airfoil theory): c_m,c/4 = (π/4)(A₂ − A₁). Negative = nose-down." v={fixed(a.wing.cmC4, 4)} />
        <Row k={<>α<sub>0</sub> tail (2D)</>} hint="Zero-lift angle of the tail section (0 for a symmetric 00xx section)." v={`${fixed(a.tail.alpha0 / DEG, 2)}°`} />
        <Row k={<>C<sub>m0</sub> aircraft</>} hint="Total pitching moment coefficient at α = 0 and δe = 0: wing c_m,ac + wing lift × arm − tail contribution + thrust-line moment. Must be positive for a stable aircraft to trim at positive lift without elevator." v={fixed(a.Cm0, 4)} />
        <Row k={<>C<sub>Lα</sub> wing / tail</>} hint="3D lift-curve slopes of the wing and of the tail after the finite-span (aspect ratio, sweep, Mach) correction of the 2π section slope." v={`${fixed(a.CLaWing, 3)} / ${fixed(a.CLaTail, 3)} /rad`} />
        <Row k={<>dε/dα · τ<sub>e</sub></>} hint="dε/dα: downwash gradient at the tail, 2C_Lα,w/(π AR); it reduces the tail's effective angle of attack. τ: elevator effectiveness dα₀/dδe from thin-airfoil flap theory." v={`${fixed(a.deda, 3)} · ${fixed(a.tau, 3)}`} />
        <Row k="Trim α · δe" hint="Angle of attack and elevator angle that give Cm = 0 and C_L = W/(qS) in the reference flight condition. δe > 0 is trailing-edge down." v={`${fixed(stat.trim.alpha / DEG, 2)}° · ${fixed(stat.trim.deltaE / DEG, 2)}°`} />
        <Row k={<>C<sub>L</sub> trim · Mach</>} hint="Trim lift coefficient C_L = W cos γ / (q S) and flight Mach number." v={`${fixed(r.flight.CW, 3)} · ${fixed(r.flight.mach, 3)}`} />
      </div>
      <div className="ws-col">
        <h3>Stability derivatives</h3>
        <Row k={<>C<sub>Lα</sub> aircraft</>} hint="Whole-aircraft lift slope: C_Lα,w + η (S_t/S) C_Lα,t (1 − dε/dα)." v={`${fixed(a.CLa, 3)} /rad`} />
        <Row k={<>C<sub>mα</sub></>} hint="Pitch stiffness dCm/dα = C_Lα,w (x_cg − x_np). Negative = statically stable (nose-down moment when α increases)." v={`${fixed(a.Cma, 3)} /rad`} />
        <Row k={<>C<sub>mq</sub> · C<sub>mα̇</sub></>} hint="Pitch damping derivatives: C_mq from the tail's angle change due to pitch rate (+10% for the fuselage), C_mα̇ from the downwash lag at the tail. Both negative (damping)." v={`${fixed(a.Cmq, 2)} · ${fixed(a.Cmadot, 2)}`} />
        <Row k={<>C<sub>mδe</sub> · C<sub>Lδe</sub></>} hint="Elevator control power: moment and lift per radian of elevator." v={`${fixed(a.Cmde, 3)} · ${fixed(a.CLde, 3)}`} />
        <Row k={<>X<sub>u</sub> · X<sub>w</sub></>} hint="Dimensional axial-force derivatives (per second): change of axial acceleration with speed (drag and thrust variation) and with vertical velocity." v={`${fixed(ss.dim.Xu, 4)} · ${fixed(ss.dim.Xw, 4)} s⁻¹`} />
        <Row k={<>Z<sub>u</sub> · Z<sub>w</sub></>} hint="Dimensional normal-force derivatives (per second): lift change with speed and with vertical velocity (Z_w ≈ −(C_Lα + C_D) q S/(m u₀))." v={`${fixed(ss.dim.Zu, 3)} · ${fixed(ss.dim.Zw, 3)} s⁻¹`} />
        <Row k={<>M<sub>w</sub> · M<sub>ẇ</sub></>} hint="Pitch acceleration per unit vertical velocity (static stability) and per unit vertical acceleration (downwash lag)." v={`${fixed(ss.dim.Mw, 4)} · ${fixed(ss.dim.Mwdot, 5)}`} />
        <Row k={<>M<sub>q</sub> · M<sub>u</sub></>} hint="M_q: pitch damping (1/s). M_u: pitch acceleration with speed, here from the thrust line offset (z_T dT/du)." v={`${fixed(ss.dim.Mq, 3)} s⁻¹ · ${fixed(ss.dim.Mu, 5)}`} />
        <Row k={<>X<sub>np</sub> · X'<sub>np</sub> · X<sub>mp</sub></>} hint="Stick-fixed neutral point (where C_mα = 0), stick-free neutral point (elevator floating) and stick-fixed maneuver point (where dδe/dn = 0), in % MAC." v={`${(stat.xnp * 100).toFixed(1)} · ${(stat.xnpFree * 100).toFixed(1)} · ${(man.xmp * 100).toFixed(1)}%`} />
      </div>
      <div className="ws-col">
        <h3>Dynamic modes</h3>
        <Row k="Short-period roots" hint="Eigenvalue pair λ = n ± iω of the fast pitch/angle-of-attack oscillation (or two real roots when it has split)." v={root(sp)} />
        <Row k={<>ω<sub>n</sub> · ζ (SP)</>} hint={`Short-period natural frequency ω_n = |λ| and damping ratio ζ = −n/ω_n. Short-period approximation: ω_n ${fixed(ss.approx.shortPeriod.wn, 3)}, ζ ${fixed(ss.approx.shortPeriod.zeta, 3)}.`} v={`${fixed(sp.wn, 3)} rad/s · ${fixed(sp.zeta, 3)}`} />
        <Row k="Phugoid roots" hint="Eigenvalue pair of the slow speed/altitude exchange oscillation." v={root(ph)} />
        <Row k={<>ω<sub>n</sub> · ζ (Ph)</>} hint={`Phugoid natural frequency and damping ratio (typically very lightly damped). Lanchester approximation: ω_n ${fixed(ss.approx.phugoid.wn, 4)}, ζ ${fixed(ss.approx.phugoid.zeta, 3)}.`} v={`${fixed(ph.wn, 4)} rad/s · ${fixed(ph.zeta, 3)}`} />
        <Row k="Phugoid period T" hint="Period of the phugoid oscillation, T = 2π/ω_d." v={ph.period ? `${fixed(ph.period, 1)} s` : 'aperiodic'} />
        <Row hint="Time to half amplitude (stable) or to double amplitude (unstable) of the phugoid." k={ph.stable ? <>t<sub>½</sub> phugoid</> : <>t<sub>2×</sub> phugoid</>} v={`${fixed(ph.stable ? ph.tHalf : ph.tDouble, 1)} s`} />
        <Row hint="Time to half amplitude (stable) or to double amplitude (unstable) of the short period." k={sp.stable ? <>t<sub>½</sub> short period</> : <>t<sub>2×</sub> short period</>} v={`${fixed(sp.stable ? sp.tHalf : sp.tDouble, 2)} s`} />
        <Row k="Engine latency" hint="Time to recompute the whole model (aerodynamics, trim, A matrix, eigenvalues and a 120 s exact-discretisation response). Requirement: under 30 ms." v={`${latency.toFixed(1)} ms ${latency < 30 ? '(< 30 ms)' : '(over budget)'}`} />
      </div>
      <div className="ws-col">
        <h3>Maneuver &amp; handling</h3>
        <Row k="dδe/dn" hint="Elevator angle per g in a steady pull-up (stick-fixed). Negative = trailing edge up to pull. Its size is proportional to the maneuver margin." v={`${fixed(man.deltaEPerG / DEG, 3)} °/g`} />
        <Row k={<>F<sub>s</sub>/n</>} hint="Stick force per g, F_s/n = G η q S_e c_e dC_h/dn. Positive = pull. Too light invites over-stressing, too heavy tires the pilot." v={`${fixed(man.stickForcePerG, 1)} N/g (${fixed(man.stickForcePerG * N_TO_LBF, 1)} lbf/g)`} />
        <Row hint="Pull force to reach the limit load factor from trimmed 1 g flight, against the 267 N (60 lbf) centre-stick temporary pitch limit of 14 CFR 23.143(c)." k={<>F<sub>s</sub> at n = {fixed(man.limitLoadFactor, 1)}</>} v={`${fixed(hq.forceAtLimit, 0)} N (limit ${hq.forceLimit})`} />
        <Row k="Untrimmed 1 g force" hint="Stick force needed in 1 g flight before trimming it out with a tab, from C_h = C_h0 + C_hα α_t + C_hδ δe." v={`${fixed(man.stickForceTrim, 1)} N ${man.stickForceTrim >= 0 ? 'pull' : 'push'}`} />
        <div className={`badge st-${hqStatus}`}><span className="badge-icon" aria-hidden>{hq.status === 'ok' ? '✓' : '!'}</span>{hqLabel} ({hq.min}–{hq.max} N/g)</div>
        <h3 className="sub">Powerplant</h3>
        <Row k="Thrust req / avail" hint="Thrust required (drag + W sin γ) vs full-throttle thrust available at this speed and altitude." v={`${fixed(prop.thrustRequired / 1000, 2)} / ${fixed(prop.thrustAvailable / 1000, 2)} kN`} />
        <Row k="Throttle" hint="Thrust required / thrust available. Over 100% means the flight condition cannot be sustained." v={<span className={prop.throttle > 1 ? 'warn-text' : ''}>{(prop.throttle * 100).toFixed(0)}%{prop.throttle > 1 ? ' (not sustainable)' : ''}</span>} />
        <Row hint="Power needed to hold the flight condition: shaft power (propeller, T V/η_p) or thrust power (jet, T V)." k={prop.shaftPowerRequired !== null ? 'Shaft power req' : 'Thrust power req'} v={`${fixed((prop.shaftPowerRequired ?? prop.powerRequired) / 1000, 1)} kW`} />
        <Row k="Climb (excess power)" hint="Rate of climb at full throttle at this speed: (T_avail − D) V / W." v={`${fixed(prop.rateOfClimb, 2)} m/s (${fixed(prop.rateOfClimb * 196.85, 0)} fpm)`} />
        <Row k={<>V<sub>max</sub> level</>} hint="Maximum level-flight true airspeed at this altitude (full-throttle thrust = drag)." v={prop.vMax ? `${fixed(prop.vMax / 0.514444, 0)} kts` : '—'} />
        <Row k={<>C<sub>m,T</sub> thrust line</>} hint="Pitching moment coefficient from thrust acting z_T below the CG: T z_T / (q S c̄)." v={fixed(a.CmT, 4)} />
      </div>
    </section>
  );
}
