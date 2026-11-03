import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AircraftInputs, AnalysisResult, DEFAULT_INPUTS, DEG, analyze, applyMassBreakdown, cgRootLocus, massProperties, simulatePulse, writeMat,
} from './engine';
import { LineChart, Series } from './ui/LineChart';
import { SPlane } from './ui/SPlane';
import { Schematic } from './ui/Schematic';
import { Sidebar } from './ui/Sidebar';
import { MarginGauge, Workspace } from './ui/Workspace';
import { Hint, Slider } from './ui/Fields';
import { TipLayer } from './ui/TipLayer';
import { HelpDialog } from './ui/HelpDialog';

type GraphKind = 'cm' | 'splane' | 'time';
const PLAYBACK_MS = 8000;
const SIM_T = 120;

/** Runs the engine (analysis + eigenvalues + 120 s RK4 pulse response) and times it. */
function useAnalysis(inp: AircraftInputs, pulseDeg: number, pulseDur: number) {
  const last = useRef<AnalysisResult | null>(null);
  return useMemo(() => {
    const t0 = performance.now();
    const out = analyze(inp);
    if (out.ok) last.current = out.result;
    const r = last.current!;
    const sim = simulatePulse(r.ss, { amplitude: pulseDeg * DEG, duration: pulseDur, start: 0.5 }, SIM_T, 0.02);
    return { out, r, sim, latency: performance.now() - t0 };
  }, [inp, pulseDeg, pulseDur]);
}

export default function App() {
  const [inp, setInp] = useState<AircraftInputs>(DEFAULT_INPUTS);
  const [graph, setGraph] = useState<GraphKind>('cm');
  const [zoom, setZoom] = useState<'all' | 'phugoid'>('all');
  const [pulseDeg, setPulseDeg] = useState(-2);
  const [pulseDur, setPulseDur] = useState(0.5);
  const [reveal, setReveal] = useState(1);
  const [theme, setTheme] = useState<'auto' | 'light' | 'dark'>('auto');
  const [help, setHelp] = useState<{ open: boolean; section?: string }>({ open: false });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '?' && !(t instanceof HTMLInputElement || t instanceof HTMLSelectElement)) setHelp({ open: true });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const set = useCallback((patch: Partial<AircraftInputs>) => setInp((p) => ({ ...p, ...patch })), []);

  // mass & balance: in components mode the CG, mass and I_yy come from the component breakdown
  const mp = useMemo(() => (inp.massMode === 'components' ? massProperties(inp) : null), [inp]);
  const eff = useMemo(() => applyMassBreakdown(inp), [inp]);
  const { out, r, sim, latency } = useAnalysis(eff, pulseDeg, pulseDur);
  // the CG locus does not depend on the current CG; recompute only when anything else changes
  const locusKey = JSON.stringify({ ...eff, xcg: 0, massItems: 0 });
  const locus = useMemo(() => cgRootLocus(eff, 0.02, Math.min(0.98, Math.max(r.stat.xnp + 0.2, 0.6)), 48),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locusKey, r.stat.xnp]);

  useEffect(() => {
    const el = document.documentElement;
    if (theme === 'auto') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', theme);
  }, [theme]);

  const raf = useRef<number>();
  const pulse = () => {
    setGraph('time');
    cancelAnimationFrame(raf.current!);
    const start = performance.now();
    const tick = () => {
      const p = Math.min((performance.now() - start) / PLAYBACK_MS, 1);
      setReveal(p);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current!), []);

  // --- Cm-alpha data
  const cmData = useMemo(() => {
    const alphas: number[] = [];
    for (let a = -6; a <= 14.001; a += 0.5) alphas.push(a);
    const line = (res: AnalysisResult, de: number) => alphas.map((a) => [a, res.aero.Cm0 + res.aero.Cma * a * DEG + res.aero.Cmde * de] as [number, number]);
    const atNp = analyze({ ...inp, xcg: r.stat.xnp });
    const series: Series[] = [
      { id: 'cur', label: `CG ${(r.inputs.xcg * 100).toFixed(1)}%, δe = 0`, color: 'var(--s1)', points: line(r, 0), hint: 'C_m vs α at the current CG with the elevator neutral. Its slope is C_mα.' },
      { id: 'trim', label: `CG ${(r.inputs.xcg * 100).toFixed(1)}%, δe trim ${(r.stat.trim.deltaE / DEG).toFixed(1)}°`, color: 'var(--s2)', points: line(r, r.stat.trim.deltaE), hint: 'Same CG with the trim elevator angle: the line is shifted so that it crosses C_m = 0 at the trim angle of attack.' },
    ];
    if (atNp.ok) series.push({ id: 'np', label: `CG at NP ${(r.stat.xnp * 100).toFixed(1)}% (neutral)`, color: 'var(--muted)', dash: '5 4', points: line(atNp.result, 0), hint: 'Reference: CG placed at the stick-fixed neutral point. The slope is zero (neutral stability); CG aft of it tilts the line upward (unstable).' });
    return series;
  }, [inp, r]);

  // --- Flight test: delta_e vs n, Fs vs n
  const ftData = useMemo(() => {
    const ns: number[] = [];
    for (let n = 0; n <= r.inputs.limitLoadFactor + 1e-9; n += 0.1) ns.push(Number(n.toFixed(2)));
    const deLine = (res: AnalysisResult) => ns.map((n) => [n, (res.stat.trim.deltaE + (n - 1) * res.man.deltaEPerG) / DEG] as [number, number]);
    const fwd = analyze({ ...inp, xcg: Math.max(0, r.inputs.xcg - 0.1) });
    const mp = analyze({ ...inp, xcg: Math.min(1, r.man.xmp) });
    const de: Series[] = [{ id: 'cur', label: `CG ${(r.inputs.xcg * 100).toFixed(1)}%`, color: 'var(--s1)', points: deLine(r), hint: 'Elevator angle needed to hold load factor n in a steady pull-up at the current CG.' }];
    if (fwd.ok) de.push({ id: 'fwd', label: `CG ${(fwd.result.inputs.xcg * 100).toFixed(1)}% (fwd)`, color: 'var(--s3)', points: deLine(fwd.result), hint: 'Same with the CG 10% MAC further forward: a steeper slope (more elevator per g).' });
    if (mp.ok) de.push({ id: 'mp', label: `CG at MP ${(r.man.xmp * 100).toFixed(1)}%`, color: 'var(--muted)', dash: '5 4', points: deLine(mp.result), hint: 'CG at the maneuver point: zero elevator per g, the boundary of maneuver stability.' });
    const h = r.man.handling;
    const fs: Series[] = [{ id: 'fs', label: 'Stick force (trimmed at 1 g)', color: 'var(--s1)', points: ns.map((n) => [n, r.man.stickForcePerG * (n - 1)]), hint: 'Pull force vs load factor, with the 1 g force trimmed out. Slope = stick force per g.' }];
    const nl = r.inputs.limitLoadFactor;
    const band = [[1, 0], [nl, h.min * (nl - 1)], [nl, h.max * (nl - 1)], [1, 0]] as [number, number][];
    const bandLo = [[0, 0], [1, 0], [0, -h.max], [0, -h.min]] as [number, number][];
    return { de, fs, band, bandLo };
  }, [inp, r]);

  // --- time history
  const th = useMemo(() => {
    const pick = (arr: Float64Array, scale: number, tMax: number): [number, number][] => {
      const out: [number, number][] = [];
      for (let i = 0; i < sim.t.length && sim.t[i] <= tMax; i += 2) out.push([sim.t[i], arr[i] * scale]);
      return out;
    };
    return {
      alpha: pick(sim.dalpha, 1 / DEG, 15),
      de: pick(sim.deltaE, 1 / DEG, 15),
      q: pick(sim.dq, 1 / DEG, 15),
      u: pick(sim.du, 1, SIM_T),
      h: pick(sim.dh, 1, SIM_T),
    };
  }, [sim]);
  const tNow = reveal * SIM_T;

  const exportMat = () => {
    const D = r.ss.dim;
    const bytes = writeMat({
      A: r.ss.A,
      B: r.ss.B.map((v) => [v]),
      eig_re: r.ss.eigenvalues.map((e) => e.re),
      eig_im: r.ss.eigenvalues.map((e) => e.im),
      wn_sp: r.ss.modes.shortPeriod.wn, zeta_sp: r.ss.modes.shortPeriod.zeta,
      wn_ph: r.ss.modes.phugoid.wn, zeta_ph: r.ss.modes.phugoid.zeta,
      Xu: D.Xu, Xw: D.Xw, Zu: D.Zu, Zw: D.Zw, Mu: D.Mu, Mw: D.Mw, Mwdot: D.Mwdot, Mq: D.Mq, Zde: D.Zde, Mde: D.Mde,
      u0: r.flight.u0, rho: r.flight.atm.density, qbar: r.flight.qbar,
      mass: r.inputs.mass, Iyy: r.inputs.iyy, z_T: r.inputs.thrustLineZ, z_cg: mp ? mp.z : 0,
      x_cg: r.inputs.xcg, x_np: r.stat.xnp, x_np_free: r.stat.xnpFree, x_mp: r.man.xmp, static_margin: r.stat.staticMargin,
      CL_alpha: r.aero.CLa, CL_alpha_wing: r.aero.CLaWing, CL_alpha_tail: r.aero.CLaTail, Cm0: r.aero.Cm0, Cm_alpha: r.aero.Cma,
      Cm_q: r.aero.Cmq, Cm_alphadot: r.aero.Cmadot, Cm_de: r.aero.Cmde, CL_de: r.aero.CLde, deps_dalpha: r.aero.deda,
      alpha0_wing: r.aero.wing.alpha0, cm_c4_wing: r.aero.wing.cmC4, alpha0_tail: r.aero.tail.alpha0,
      alpha_trim: r.stat.trim.alpha, de_trim: r.stat.trim.deltaE,
      de_per_g: r.man.deltaEPerG, Fs_per_g: r.man.stickForcePerG,
      thrust_req: r.prop.thrustRequired, thrust_avail: r.prop.thrustAvailable, throttle: r.prop.throttle, Cm_T: r.aero.CmT,
      t: sim.t, du: sim.du, dw: sim.dw, dq: sim.dq, dtheta: sim.dtheta, dalpha: sim.dalpha, dh: sim.dh, de_input: sim.deltaE,
      length_overall: r.points.overallLength, fuselage_length: r.inputs.fuselageLength, fuselage_diameter: r.inputs.fuselageDiameter,
      span: r.geometry.span, mac: r.geometry.mac, root_chord: r.geometry.rootChord, tip_chord: r.geometry.tipChord, taper: r.inputs.taperRatio,
      x_ac_wing: r.points.acWing, x_ac_wing_body: r.points.acWingBody, x_ac_aircraft: r.points.acAircraft,
      x_cp_wing: r.points.cpWing ?? NaN, x_cp_aircraft: r.points.cpAircraft ?? NaN,
      wing_naca: r.inputs.wingNaca, tail_naca: r.inputs.tailNaca,
    });
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `aerosim_${r.inputs.wingNaca}_${r.inputs.tailNaca}_cg${Math.round(r.inputs.xcg * 100)}.mat`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const status = r.stat.status;
  const error = out.ok ? null : out;

  return (
    <div className={`app st-${status}`}>
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            <svg viewBox="0 0 24 24" width="22" height="22"><path d="M2 13l8-1 4-8h2l-2 8 6-.5 2-2.5h1.5l-1 4 1 4H22l-2-2.5-6-.5 2 8h-2l-4-8-8-1z" fill="currentColor" /></svg>
          </span>
          <h1>AeroSim Analytics <span className="version" data-tip="App version (from package.json)">v{__APP_VERSION__}</span> <span>// Flight Mechanics II Engine</span></h1>
        </div>
        <div className="actions">
          <button className="btn ghost" onClick={() => setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'auto' : 'dark')} title="Theme">
            {theme === 'auto' ? 'Theme: auto' : theme === 'dark' ? 'Theme: dark' : 'Theme: light'}
          </button>
          <button className="btn" onClick={() => setHelp({ open: true })} data-tip="User guide, formulas and glossary (shortcut: ?)">Help</button>
          <button className="btn" onClick={exportMat}>Export .MAT</button>
          <button className="btn" onClick={() => window.print()}>Export PDF</button>
        </div>
      </header>

      {status !== 'stable' && (
        <div className={`alert st-${status}`} role="alert">
          <b>{status === 'unstable' ? '✕ CG aft of the neutral point.' : '! Static margin below 5% MAC.'}</b>{' '}
          {status === 'unstable'
            ? `Cm-α slope is positive (${r.aero.Cma.toFixed(3)} /rad): the aircraft diverges in pitch without augmentation.`
            : `Cm-α slope is only ${r.aero.Cma.toFixed(3)} /rad. Move the CG forward of ${((r.stat.xnp - 0.05) * 100).toFixed(1)}% MAC for a 5% margin.`}
        </div>
      )}
      {mp && (mp.xcg < 0 || mp.xcg > 1) && (
        <div className="alert st-unstable" role="alert">✕ The computed CG is at {(mp.xcg * 100).toFixed(1)}% MAC, outside the 0–100% MAC range the model accepts (it is clamped to {mp.xcg < 0 ? '0' : '100'}%). Move components or the wing.</div>
      )}
      {error && <div className="alert st-marginal" role="alert">! {error.field === 'wingNaca' ? 'Wing' : 'Tail'} NACA code rejected: {error.error}</div>}

      <div className="layout">
        <Sidebar inp={inp} set={set} mp={mp} onReset={() => setInp(DEFAULT_INPUTS)} />
        <main className="canvas">
          <MarginGauge r={r} onExplain={() => setHelp({ open: true, section: 'points' })} />
          <div className="row2">
            <section className="panel">
              <Schematic r={r} mp={mp} onChange={set} />
            </section>
            <section className="panel">
              <div className="selector" role="tablist" aria-label="Graph selector">
                {([['cm', 'Cm–α'], ['splane', 's-Plane poles'], ['time', 'Time history']] as [GraphKind, string][]).map(([k, l]) => (
                  <button key={k} role="tab" aria-selected={graph === k} className={graph === k ? 'tab on' : 'tab'} onClick={() => setGraph(k)}
                    data-tip={{ cm: 'Total pitching moment coefficient vs angle of attack. A negative slope (C_mα < 0) means static stability; the trim point is where C_m = 0.', splane: 'Eigenvalues of the A matrix on the complex plane. Left half = stable. Dots show how the poles move as the CG is swept; click one to move the CG there.', time: 'Response to an elevator pulse: fast short-period α oscillation (left) and slow phugoid exchange of speed and height (right).' }[k]}>{l}</button>
                ))}
                <span className="spacer" />
                <button className="btn primary" onClick={pulse}>Pulse elevator</button>
              </div>
              {graph === 'cm' && (
                <LineChart ariaLabel="Cm versus alpha" title="Pitching moment vs angle of attack" series={cmData} hint="FR-2.1: C_m = C_m0 + C_L(x_cg − x_ac) − V_h η C_Lt. Negative slope = statically stable; the trim point is where the trimmed line crosses C_m = 0." 
                  xLabel="α [deg]" yLabel="C_m" xUnit="°" height={330}
                  markers={[{ x: r.stat.trim.alpha / DEG, y: 0, label: `trim α ${(r.stat.trim.alpha / DEG).toFixed(2)}°`, color: 'var(--s2)' }]}
                  caption={<>Slope C<sub>mα</sub> = {r.aero.Cma.toFixed(3)} /rad ({r.aero.Cma < 0 ? 'negative, stable' : 'positive, unstable'}). Drag the CG on the schematic or the slider to watch it rotate through the neutral line.</>} />
              )}
              {graph === 'splane' && (
                <>
                  <SPlane roots={r.ss.eigenvalues} spRoots={r.ss.modes.shortPeriod.roots} locus={locus} xnp={r.stat.xnp} zoom={zoom}
                    onPickCg={(x) => set({ xcg: Number(x.toFixed(3)) })} />
                  <div className="sub-toggle">
                    <button className={zoom === 'all' ? 'tab on' : 'tab'} onClick={() => setZoom('all')}>All poles + CG locus</button>
                    <button className={zoom === 'phugoid' ? 'tab on' : 'tab'} onClick={() => setZoom('phugoid')}>Phugoid zoom</button>
                  </div>
                </>
              )}
              {graph === 'time' && (
                <div className="twin">
                  <LineChart ariaLabel="Short period alpha response" title="Δα(t): short period" height={300}
                    series={[
                      { id: 'a', label: 'Δα', color: 'var(--s1)', points: th.alpha, hint: 'Change in angle of attack (deg): the short-period response, which dies out within a few seconds.' },
                      { id: 'q', label: 'Δq [deg/s]', color: 'var(--s3)', points: th.q, width: 1.5, hint: 'Pitch rate perturbation (deg/s).' },
                      { id: 'de', label: 'δe input', color: 'var(--muted)', dash: '4 3', points: th.de, hint: 'Elevator pulse applied at t = 0.5 s (deg). Negative = trailing edge up (nose-up).' },
                    ]}
                    xLabel="t [s]" yLabel="deg" xUnit=" s" xDomain={[0, 15]} reveal={Math.min(tNow / 15, 1)} />
                  <div className="stack">
                    <LineChart ariaLabel="Phugoid speed response" title="Δu(t): phugoid" hint="Airspeed perturbation (m/s). The phugoid trades speed for height with a period of tens of seconds." height={146}
                      series={[{ id: 'u', label: 'Δu', color: 'var(--s2)', points: th.u }]}
                      xLabel="t [s]" yLabel="m/s" xUnit=" s" yUnit=" m/s" xDomain={[0, SIM_T]} reveal={reveal} />
                    <LineChart ariaLabel="Phugoid altitude response" title="Δh(t): altitude exchange" hint="Altitude perturbation (m), integrated from ḣ = u₀Δθ − Δw. Its peaks lag the speed troughs by a quarter period." height={146}
                      series={[{ id: 'h', label: 'Δh', color: 'var(--s7)', points: th.h }]}
                      xLabel="t [s]" yLabel="m" xUnit=" s" yUnit=" m" xDomain={[0, SIM_T]} reveal={reveal} />
                  </div>
                  <div className="pulse-ctl">
                    <Slider label="Pulse δe" value={pulseDeg} min={-5} max={5} step={0.5} format={(v) => `${v.toFixed(1)}° ${v < 0 ? '(TE up, nose-up)' : v > 0 ? '(TE down)' : ''}`} onChange={setPulseDeg} />
                    <Slider label="Duration" value={pulseDur} min={0.1} max={3} step={0.1} format={(v) => `${v.toFixed(1)} s`} onChange={setPulseDur} />
                  </div>
                </div>
              )}
            </section>
          </div>

          <section className="panel">
            <div className="panel-title">Flight test: elevator deflection and stick force vs load factor<Hint text="Steady pull-up at constant speed. Left: elevator angle needed per load factor; the slope dδe/dn shrinks to zero as the CG approaches the maneuver point (MP). Right: stick force with the trim tab nulling the 1 g force; the green band is the acceptable stick-force-per-g range." /></div>
            <div className="twin even">
              <LineChart ariaLabel="Elevator versus load factor" title="δe vs n (slope = stick-fixed maneuver margin)" series={ftData.de} hint="FR-4.1: dδe/dn = −(C_mα C_W + C_Lα C_mq ĝ)/(C_Lα C_mδe − C_Lδe C_mα). Zero slope at the maneuver point." 
                xLabel="Load factor n [g]" yLabel="δe [deg]" xUnit=" g" yUnit="°" height={250}
                vRefs={[{ x: 1, label: '1 g' }]} />
              <LineChart ariaLabel="Stick force versus load factor" title="F_s vs n (handling band shaded)" series={ftData.fs} hint="FR-4.2: F_s = G η q S_e c_e C_h with C_h = C_h0 + C_hα α_t + C_hδ δe. The green wedge spans the acceptable stick force per g (13–125 N/g); the red line is the 267 N pull limit." 
                bands={[{ label: 'band', points: ftData.band, color: 'var(--good)' }]}
                xLabel="Load factor n [g]" yLabel="F_s [N] (+ pull)" xUnit=" g" yUnit=" N" height={250}
                hRefs={[{ y: r.man.handling.forceLimit, label: `limit ${r.man.handling.forceLimit} N (60 lbf)`, strong: true }]}
                vRefs={[{ x: 1, label: '1 g' }]} />
            </div>
          </section>
        </main>
      </div>
      <Workspace r={r} latency={latency} />
      <TipLayer />
      <HelpDialog open={help.open} initial={help.section} onClose={() => setHelp({ open: false })} />
      <footer className="foot">
        Small-disturbance stability-axis model (Nelson / Etkin). Thin airfoil c<sub>m,c/4</sub> = (π/4)(A<sub>2</sub> − A<sub>1</sub>).
        Section c<sub>lα</sub> = 2π. Propeller normal-force and Z<sub>ẇ</sub>, Z<sub>q</sub> terms neglected.
      </footer>
    </div>
  );
}
