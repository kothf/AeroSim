import type { AnalysisResult, ModeInfo } from '../engine';
import { DEG, N_TO_LBF } from '../engine';
import { fixed } from './scale';

const root = (m: ModeInfo) => {
  const [a, b] = m.roots;
  if (m.kind === 'oscillatory') return `${fixed(a.re, 3)} ± ${fixed(Math.abs(a.im), 3)}i`;
  return `${fixed(a.re, 3)}, ${fixed(b.re, 3)} (real)`;
};

function Row({ k, v, hint }: { k: React.ReactNode; v: React.ReactNode; hint?: string }) {
  return (
    <div className="kv" title={hint}>
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

export function MarginGauge({ r }: { r: AnalysisResult }) {
  const { xcg } = r.inputs;
  const { xnp, xnpFree, status, staticMargin } = r.stat;
  const xmp = r.man.xmp;
  const pos = (v: number) => `${Math.min(Math.max(v, 0), 1) * 100}%`;
  const label = status === 'stable' ? 'Statically stable' : status === 'marginal' ? 'Marginal stability' : 'Statically UNSTABLE';
  const icon = status === 'stable' ? '✓' : status === 'marginal' ? '!' : '✕';
  return (
    <div className={`gauge st-${status}`} role="status" aria-live="polite">
      <div className="gauge-head">
        <span className="badge"><span className="badge-icon" aria-hidden>{icon}</span>{label}</span>
        <span className="gauge-sm">Static margin <b>{(staticMargin * 100).toFixed(1)}%</b> MAC · stick-free {(r.stat.staticMarginFree * 100).toFixed(1)}% · maneuver {(r.man.maneuverMargin * 100).toFixed(1)}%</span>
      </div>
      <div className="gauge-track" aria-hidden>
        <div className="gauge-fill" style={{ left: pos(Math.min(xcg, xnp)), width: `${Math.abs(xnp - xcg) * 100}%` }} />
        {[0, 0.25, 0.5, 0.75, 1].map((t) => <span key={t} className="gauge-tick" style={{ left: pos(t) }}>{t * 100}</span>)}
        <span className="gauge-mk mk-npf" style={{ left: pos(xnpFree) }} title="Stick-free NP">NP'</span>
        <span className="gauge-mk mk-np" style={{ left: pos(xnp) }} title="Stick-fixed NP">NP</span>
        <span className="gauge-mk mk-mp" style={{ left: pos(xmp) }} title="Maneuver point">MP</span>
        <span className="gauge-cg" style={{ left: pos(xcg) }} title="CG">CG</span>
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
        <Row k={<>α<sub>0</sub> wing (2D)</>} v={`${fixed(a.wing.alpha0 / DEG, 2)}°`} hint="Thin airfoil theory, FR-1.2" />
        <Row k={<>C<sub>m,c/4</sub> wing (2D)</>} v={fixed(a.wing.cmC4, 4)} />
        <Row k={<>α<sub>0</sub> tail (2D)</>} v={`${fixed(a.tail.alpha0 / DEG, 2)}°`} />
        <Row k={<>C<sub>m0</sub> aircraft</>} v={fixed(a.Cm0, 4)} hint="Incl. thrust-line moment" />
        <Row k={<>C<sub>Lα</sub> wing / tail</>} v={`${fixed(a.CLaWing, 3)} / ${fixed(a.CLaTail, 3)} /rad`} />
        <Row k={<>dε/dα · τ<sub>e</sub></>} v={`${fixed(a.deda, 3)} · ${fixed(a.tau, 3)}`} />
        <Row k="Trim α · δe" v={`${fixed(stat.trim.alpha / DEG, 2)}° · ${fixed(stat.trim.deltaE / DEG, 2)}°`} />
        <Row k={<>C<sub>L</sub> trim · Mach</>} v={`${fixed(r.flight.CW, 3)} · ${fixed(r.flight.mach, 3)}`} />
      </div>
      <div className="ws-col">
        <h3>Stability derivatives</h3>
        <Row k={<>C<sub>Lα</sub> aircraft</>} v={`${fixed(a.CLa, 3)} /rad`} />
        <Row k={<>C<sub>mα</sub></>} v={`${fixed(a.Cma, 3)} /rad`} />
        <Row k={<>C<sub>mq</sub> · C<sub>mα̇</sub></>} v={`${fixed(a.Cmq, 2)} · ${fixed(a.Cmadot, 2)}`} />
        <Row k={<>C<sub>mδe</sub> · C<sub>Lδe</sub></>} v={`${fixed(a.Cmde, 3)} · ${fixed(a.CLde, 3)}`} />
        <Row k={<>X<sub>u</sub> · X<sub>w</sub></>} v={`${fixed(ss.dim.Xu, 4)} · ${fixed(ss.dim.Xw, 4)} s⁻¹`} />
        <Row k={<>Z<sub>u</sub> · Z<sub>w</sub></>} v={`${fixed(ss.dim.Zu, 3)} · ${fixed(ss.dim.Zw, 3)} s⁻¹`} />
        <Row k={<>M<sub>w</sub> · M<sub>ẇ</sub></>} v={`${fixed(ss.dim.Mw, 4)} · ${fixed(ss.dim.Mwdot, 5)}`} />
        <Row k={<>M<sub>q</sub> · M<sub>u</sub></>} v={`${fixed(ss.dim.Mq, 3)} s⁻¹ · ${fixed(ss.dim.Mu, 5)}`} />
        <Row k={<>X<sub>np</sub> · X'<sub>np</sub> · X<sub>mp</sub></>} v={`${(stat.xnp * 100).toFixed(1)} · ${(stat.xnpFree * 100).toFixed(1)} · ${(man.xmp * 100).toFixed(1)}%`} />
      </div>
      <div className="ws-col">
        <h3>Dynamic modes</h3>
        <Row k="Short-period roots" v={root(sp)} />
        <Row k={<>ω<sub>n</sub> · ζ (SP)</>} v={`${fixed(sp.wn, 3)} rad/s · ${fixed(sp.zeta, 3)}`} hint={`Approximation: ωn ${fixed(ss.approx.shortPeriod.wn, 3)}, ζ ${fixed(ss.approx.shortPeriod.zeta, 3)}`} />
        <Row k="Phugoid roots" v={root(ph)} />
        <Row k={<>ω<sub>n</sub> · ζ (Ph)</>} v={`${fixed(ph.wn, 4)} rad/s · ${fixed(ph.zeta, 3)}`} hint={`Lanchester: ωn ${fixed(ss.approx.phugoid.wn, 4)}, ζ ${fixed(ss.approx.phugoid.zeta, 3)}`} />
        <Row k="Phugoid period T" v={ph.period ? `${fixed(ph.period, 1)} s` : 'aperiodic'} />
        <Row k={ph.stable ? <>t<sub>½</sub> phugoid</> : <>t<sub>2×</sub> phugoid</>} v={`${fixed(ph.stable ? ph.tHalf : ph.tDouble, 1)} s`} />
        <Row k={sp.stable ? <>t<sub>½</sub> short period</> : <>t<sub>2×</sub> short period</>} v={`${fixed(sp.stable ? sp.tHalf : sp.tDouble, 2)} s`} />
        <Row k="Engine latency" v={`${latency.toFixed(1)} ms ${latency < 30 ? '(< 30 ms)' : '(over budget)'}`} />
      </div>
      <div className="ws-col">
        <h3>Maneuver &amp; handling</h3>
        <Row k="dδe/dn" v={`${fixed(man.deltaEPerG / DEG, 3)} °/g`} />
        <Row k={<>F<sub>s</sub>/n</>} v={`${fixed(man.stickForcePerG, 1)} N/g (${fixed(man.stickForcePerG * N_TO_LBF, 1)} lbf/g)`} />
        <Row k={<>F<sub>s</sub> at n = {fixed(man.limitLoadFactor, 1)}</>} v={`${fixed(hq.forceAtLimit, 0)} N (limit ${hq.forceLimit})`} />
        <Row k="Untrimmed 1 g force" v={`${fixed(man.stickForceTrim, 1)} N ${man.stickForceTrim >= 0 ? 'pull' : 'push'}`} />
        <div className={`badge st-${hqStatus}`}><span className="badge-icon" aria-hidden>{hq.status === 'ok' ? '✓' : '!'}</span>{hqLabel} ({hq.min}–{hq.max} N/g)</div>
        <h3 className="sub">Powerplant</h3>
        <Row k="Thrust req / avail" v={`${fixed(prop.thrustRequired / 1000, 2)} / ${fixed(prop.thrustAvailable / 1000, 2)} kN`} />
        <Row k="Throttle" v={<span className={prop.throttle > 1 ? 'warn-text' : ''}>{(prop.throttle * 100).toFixed(0)}%{prop.throttle > 1 ? ' (not sustainable)' : ''}</span>} />
        <Row k={prop.shaftPowerRequired !== null ? 'Shaft power req' : 'Thrust power req'} v={`${fixed((prop.shaftPowerRequired ?? prop.powerRequired) / 1000, 1)} kW`} />
        <Row k="Climb (excess power)" v={`${fixed(prop.rateOfClimb, 2)} m/s (${fixed(prop.rateOfClimb * 196.85, 0)} fpm)`} />
        <Row k={<>V<sub>max</sub> level</>} v={prop.vMax ? `${fixed(prop.vMax / 0.514444, 0)} kts` : '—'} />
        <Row k={<>C<sub>m,T</sub> thrust line</>} v={fixed(a.CmT, 4)} />
      </div>
    </section>
  );
}
