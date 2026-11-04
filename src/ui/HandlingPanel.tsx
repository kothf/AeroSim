/** Handling qualities tab: MIL-F-8785C levels, 14 CFR 23 force checks, CG envelope, stall and best-L/D speeds. */
import type { AnalysisResult, Level } from '../engine';
import { CAP_BANDS, KT_TO_MS, N_TO_LBF, SP_DAMPING, SP_WN_MIN } from '../engine';
import { fixed } from './scale';
import { Hint } from './Fields';

const CAT_NAME = { A: 'A: precision tasks', B: 'B: cruise, climb, descent', C: 'C: take-off, approach, landing' } as const;
const kts = (ms: number) => `${fixed(ms / KT_TO_MS, 0)} kts`;
const pct = (x: number | null) => (x === null ? '—' : `${fixed(x * 100, 1)}%`);

function LevelBadge({ level }: { level: Level }) {
  const st = level === 1 ? 'stable' : level === 2 ? 'marginal' : 'unstable';
  return <span className={`badge hq-level st-${st}`}><span className="badge-icon" aria-hidden>{level === 1 ? '✓' : '!'}</span>{level === 4 ? 'Worse than Level 3' : `Level ${level}`}</span>;
}

function PassBadge({ pass }: { pass: boolean }) {
  return <span className={`badge hq-level st-${pass ? 'stable' : 'unstable'}`}><span className="badge-icon" aria-hidden>{pass ? '✓' : '✕'}</span>{pass ? 'Meets' : 'Fails'}</span>;
}

const band = (b: [number, number]) => (b[1] === Infinity ? `≥ ${b[0]}` : `${b[0]}–${b[1]}`);

export function HandlingPanel({ r }: { r: AnalysisResult }) {
  const h = r.hq;
  const cat = h.category;
  const fs = h.stickForcePerG;
  const lim = h.cgLimits;
  const xcg = r.inputs.xcg;
  const inEnvelope = (lim.forward === null || xcg >= lim.forward) && xcg <= lim.aft;
  const rows: { name: string; hint: string; req: string; value: string; verdict: React.ReactNode }[] = [
    {
      name: 'Short-period damping ζ',
      hint: 'MIL-F-8785C 3.2.2.1.2: damping ratio of the short-period mode. Too low gives pitch bobbling and PIO, too high a sluggish response.',
      req: `L1 ${band(SP_DAMPING[cat][0])}, L2 ${band(SP_DAMPING[cat][1])}`,
      value: fixed(h.spDamping.value, 3),
      verdict: <LevelBadge level={h.spDamping.level} />,
    },
    {
      name: 'CAP = ω²sp / (n/α)',
      hint: `Control anticipation parameter (MIL-F-8785C 3.2.2.1.1): the initial pitch acceleration per steady-state g. Low CAP feels sluggish, high CAP abrupt. n/α = C_Lα q S / W = ${fixed(h.nAlpha, 1)} g/rad.`,
      req: `L1 ${band(CAP_BANDS[cat][0])}, L2 ${band(CAP_BANDS[cat][1])} g⁻¹s⁻²`,
      value: fixed(h.cap.value, 3),
      verdict: <LevelBadge level={h.cap.level} />,
    },
    {
      name: 'Short-period ω_n',
      hint: 'MIL-F-8785C minimum short-period frequency for Class I aircraft (Category B has none).',
      req: SP_WN_MIN[cat][0] > 0 ? `L1 ≥ ${SP_WN_MIN[cat][0]}, L2 ≥ ${SP_WN_MIN[cat][1]} rad/s` : 'no minimum (Cat. B)',
      value: `${fixed(h.spFrequency.value, 2)} rad/s`,
      verdict: <LevelBadge level={h.spFrequency.level} />,
    },
    {
      name: 'Phugoid',
      hint: 'MIL-F-8785C 3.2.1.2: Level 1 needs ζ ≥ 0.04, Level 2 ζ ≥ 0, Level 3 a time to double amplitude of at least 55 s.',
      req: 'L1 ζ ≥ 0.04, L2 ζ ≥ 0, L3 T₂ ≥ 55 s',
      value: h.phugoid.tDouble !== null ? `T₂ ${fixed(h.phugoid.tDouble, 1)} s` : `ζ ${fixed(h.phugoid.value, 3)}`,
      verdict: <LevelBadge level={h.phugoid.level} />,
    },
    {
      name: 'Stick force per g',
      hint: `MIL-F-8785C 3.2.2.2.1, table V (centre stick): Level 1 minimum 21/(n_L − 1) lbf/g but not below 3; maximum 240/(n/α) lbf/g, at most 28 and at least 56/(n_L − 1). For n_L = ${fixed(r.inputs.limitLoadFactor, 1)} and n/α = ${fixed(h.nAlpha, 1)} g/rad.`,
      req: `L1 ${fixed(fs.min, 0)}–${fixed(fs.max, 0)} N/g (${fixed(fs.min * N_TO_LBF, 1)}–${fixed(fs.max * N_TO_LBF, 1)} lbf/g)`,
      value: `${fixed(fs.value, 1)} N/g`,
      verdict: <LevelBadge level={fs.level} />,
    },
    {
      name: 'Force to reach n_limit',
      hint: '14 CFR 23.155(a)(2), stick: the pull needed to reach the positive limit load factor from trimmed flight must be at least W/140 or 15 lbf, whichever is greater (it need not exceed 35 lbf). It protects against over-stressing the airframe with a light stick.',
      req: `≥ ${fixed(h.maneuverForce.required, 0)} N (${fixed(h.maneuverForce.required * N_TO_LBF, 1)} lbf)`,
      value: `${fixed(h.maneuverForce.value, 0)} N`,
      verdict: <PassBadge pass={h.maneuverForce.pass} />,
    },
    {
      name: 'Stick force vs speed',
      hint: '14 CFR 23.173(c): with the aircraft trimmed, a pull must be needed to fly slower and a push to fly faster, with an average gradient of at least 1 lbf per 6 kt. Computed at V₀ ± 5 kt with the tab fixed, throttle held and a re-trimmed elevator. A down-spring steepens it.',
      req: `≥ ${fixed(h.speedStability.required, 2)} N/kt (1 lbf / 6 kt)`,
      value: `${fixed(h.speedStability.value, 2)} N/kt`,
      verdict: <PassBadge pass={h.speedStability.pass} />,
    },
  ];
  const stallSt = h.stall.status === 'ok' ? 'stable' : h.stall.status === 'low-margin' ? 'marginal' : 'unstable';
  return (
    <div className="hq">
      <div className="hq-head">
        <span>Overall (MIL-F-8785C, Class I, Category {cat}): <LevelBadge level={h.level} /></span>
        <span className="muted">Flight phase {CAT_NAME[cat]}. Change it under Flight condition.</span>
      </div>
      <table className="hq-table">
        <thead><tr><th>Criterion</th><th>Requirement</th><th>Value</th><th>Result</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td>{row.name}<Hint text={row.hint} /></td>
              <td>{row.req}</td>
              <td className="num">{row.value}</td>
              <td>{row.verdict}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="hq-cols">
        <div>
          <h3>CG envelope <Hint text="Forward limit: CG where trimming at C_L,max needs full up elevator (−25°), power off, free air; flaps and ground effect make the real limit further aft. Aft limit: the more forward of 5% stick-free static margin and the CG where the stick force per g falls to the Level 1 minimum." /></h3>
          <div className="kv"><span className="k">Forward limit (elevator at C_L,max)</span><span className="v">{lim.forward === null ? 'not limiting' : pct(lim.forward)}</span></div>
          <div className="kv"><span className="k">Aft limit, 5% stick-free margin</span><span className="v">{pct(lim.aftStickFree)}</span></div>
          <div className="kv"><span className="k">Aft limit, F_s/n at Level 1 minimum</span><span className="v">{lim.aftForce === null ? '—' : pct(lim.aftForce)}</span></div>
          <div className="kv"><span className="k">Stick-free maneuver point (F_s/n = 0)</span><span className="v">{pct(h.xmpFree)}</span></div>
          <div className="kv"><span className="k">Current CG</span><span className={`v ${inEnvelope ? '' : 'warn-text'}`}>{pct(xcg)} {inEnvelope ? '(inside)' : '(outside the envelope)'}</span></div>
        </div>
        <div>
          <h3>Stall &amp; drag polar <Hint text="Stall speed V_s = √(2W cos γ/(ρ S C_L,max)) at the current weight and altitude (true airspeed). The best-L/D and minimum-power speeds follow from the parabolic polar: C_L* = √(C_D0 π e AR) and √3 C_L*." /></h3>
          <div className="kv"><span className="k">Stall speed V_s (C_L,max {fixed(h.stall.CLmax, 2)})</span><span className="v">{kts(h.stall.vStall)}</span></div>
          <div className="kv"><span className="k">V / V_s · C_L / C_L,max</span><span className={`v ${stallSt !== 'stable' ? 'warn-text' : ''}`}>{fixed(h.stall.speedRatio, 2)} · {fixed(h.stall.clRatio * 100, 0)}%{h.stall.status === 'stalled' ? ' (beyond stall)' : h.stall.status === 'low-margin' ? ' (below 1.3 V_s)' : ''}</span></div>
          <div className="kv"><span className="k">L/D now · (L/D)max</span><span className="v">{fixed(h.performance.LD, 1)} · {fixed(h.performance.LDmax, 1)}</span></div>
          <div className="kv"><span className="k">Best L/D speed (max range, prop)</span><span className="v">{kts(h.performance.vBestLD)} (C_L {fixed(h.performance.CLbestLD, 2)})</span></div>
          <div className="kv"><span className="k">Minimum power speed (max endurance, prop)</span><span className="v">{kts(h.performance.vMinPower)}</span></div>
        </div>
      </div>
      <p className="muted hq-note">Limits are from MIL-F-8785C (Class I, centre stick) and the pre-amendment-64 text of 14 CFR 23, which ASTM F3173 still accepts as a means of compliance. Stick-fixed modes only: the elevator degree of freedom is not modelled.</p>
    </div>
  );
}
