/**
 * Interactive configuration schematic: planform (nose up) and side view (nose left).
 * Drag handles to change the installation and geometry:
 *  - wing (body): wing station along the fuselage; the CG stays fixed in the airframe, so x_cg/MAC and l_t change
 *  - wing tip handle: span (aspect ratio at constant area) and quarter-chord sweep
 *  - tail (body): tail arm l_t at constant tail area (V_h follows)
 *  - tail tip handle: tail span at constant tail AR (tail area, hence V_h, follows)
 *  - elevator hinge line: elevator chord ratio
 *  - CG marker: centre of gravity
 *  - engine: station (both views) and thrust-line height (side view); its mass moves the CG
 */
import { useRef, useState } from 'react';
import { AircraftInputs, AnalysisResult, DEG, INPUT_BOUNDS, MassProperties, itemPosFromStation, macLeadingEdge, moveEngine, moveWing } from '../engine';
import { useSize } from './useSize';
import { Hint } from './Fields';
import { TERMS } from './glossary';

type Kind = 'wing' | 'wingTip' | 'tail' | 'tailTip' | 'hinge' | 'cg' | 'engine' | 'engineSide' | `item:${string}`;

interface Props {
  r: AnalysisResult;
  /** computed mass properties when the CG comes from components */
  mp?: MassProperties | null;
  onChange: (patch: Partial<AircraftInputs>) => void;
}

const clamp = (k: keyof AircraftInputs, v: number) => {
  const b = INPUT_BOUNDS[k];
  return b ? Math.min(Math.max(v, b[0]), b[1]) : v;
};

const TOP_H_MAX = 420;
const SIDE_H = 180;

export function Schematic({ r, mp, onChange }: Props) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [active, setActive] = useState<Kind | null>(null);
  const drag = useRef<{ kind: Kind; x0: number; y0: number; inp: AircraftInputs; geo: AnalysisResult['geometry']; s: number; sSide: number; zcg: number; st0: number; z0: number } | null>(null);
  const inp = r.inputs;
  const geo = r.geometry;
  const c = geo.mac;
  const halfB = geo.span / 2;
    const pts = r.points;
  const macLe = macLeadingEdge(inp, geo);
  const wingAcSt = macLe + inp.xacWing * c;
  const tailAcSt = wingAcSt + inp.tailArm;
  const tailLe = tailAcSt - 0.25 * geo.tailChord;
  const tailTe = tailLe + geo.tailChord;
  const cgSt = macLe + inp.xcg * c;
  const cr = geo.rootChord;
  const ct = geo.tipChord;
  const npSt = macLe + r.stat.xnp * c;
  const npFreeSt = macLe + r.stat.xnpFree * c;
  const mpSt = macLe + r.man.xmp * c;
  const fusL = Math.max(inp.fuselageLength, tailTe + 0.2);
  const tipLe = pts.tipLe;
  const hbT = geo.tailSpan / 2;
  const hingeSt = tailTe - geo.elevatorChord;
  const fusW = inp.fuselageDiameter / 2;
  const overallL = pts.overallLength;

  // ---- top view: fuselage station runs down the screen, span runs across
  const width = Math.max(size.width, 300);
  const labelGutter = 110;
  const worldLen = Math.max(fusL, tipLe + ct, tailTe) + 0.3;
  const worldSpan = 2 * Math.max(halfB, hbT) + 0.4;
  const s = Math.min((width - 2 * labelGutter) / worldSpan, (TOP_H_MAX - 30) / worldLen);
  const TOP_H = Math.ceil(worldLen * s + 30);
  const cx = width / 2;
  const top = 14;
  const P = (x: number, y: number) => `${(cx + y * s).toFixed(1)},${(top + x * s).toFixed(1)}`;
  const SX = (y: number) => cx + y * s;
  const SY = (x: number) => top + x * s;
  const poly = (a: [number, number][]) => a.map(([x, y]) => P(x, y)).join(' ');

  // ---- side view: station runs across, z (down positive) runs down
  const sSide = Math.min((width - 40) / (fusL + 0.6), 60, (SIDE_H - 90) / (fusW * 5.2));
  const sideLeft = 20 + Math.max(0, (width - 40 - sSide * (fusL + 0.6)) / 2) + 0.3 * sSide;
  const zc = SIDE_H / 2 - 6;
  const QX = (x: number) => sideLeft + x * sSide;
  const QZ = (z: number) => zc + z * sSide;

  // CG height below the fuselage reference line (0 in manual mode, where z is relative to the CG)
  const zcg = mp ? mp.z : 0;
  const zT = zcg + inp.thrustLineZ; // thrust line height below the reference line
  const start = (kind: Kind, st0 = 0, z0 = 0) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { kind, x0: e.clientX, y0: e.clientY, inp: { ...inp }, geo: { ...geo }, s, sSide, zcg, st0, z0 };
    setActive(kind);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const i0 = d.inp, g0 = d.geo;
    // top view: down = aft, right = +span; side view: right = aft, down = +z
    const fine = e.shiftKey ? 0.2 : 1; // hold Shift for fine adjustment
    const side = d.kind === 'engineSide' || d.kind.startsWith('item:');
    const dStation = (fine * (side ? e.clientX - d.x0 : e.clientY - d.y0)) / (side ? d.sSide : d.s);
    if (d.kind.startsWith('item:')) {
      const id = d.kind.slice(5);
      const st = Math.min(Math.max(d.st0 + dStation, 0), i0.fuselageLength * 1.1);
      const z = Number((d.z0 + (fine * (e.clientY - d.y0)) / d.sSide).toFixed(3));
      onChange({ massItems: i0.massItems.map((m) => (m.id === id ? { ...m, pos: Number(itemPosFromStation(m, st, i0, g0).toFixed(3)), z } : m)) });
      return;
    }
    const dSpan = (fine * (e.clientX - d.x0)) / d.s;
    switch (d.kind) {
      case 'wing': {
        const hi = Math.max(0.3, i0.fuselageLength * 0.75 - g0.mac);
        onChange(moveWing(i0, g0, Math.min(Math.max(i0.wingStation + dStation, 0.2), hi)));
        break;
      }
      case 'engine':
      case 'engineSide': {
        const st = Math.min(Math.max(i0.engineStation + dStation, 0), i0.fuselageLength);
        // thrustLineZ is stored relative to the reference line in components mode (i0 holds it relative to the CG)
        const z = i0.thrustLineZ + d.zcg + (d.kind === 'engineSide' ? (fine * (e.clientY - d.y0)) / d.sSide : 0);
        onChange(moveEngine(i0, g0, Number(st.toFixed(3)), Number(z.toFixed(3))));
        break;
      }
      case 'wingTip': {
        const hb = Math.max(g0.span / 2 + dSpan, 0.5);
        const AR = clamp('aspectRatio', (4 * hb * hb) / i0.wingArea);
        const hbNew = Math.sqrt(AR * i0.wingArea) / 2;
        const tipDx = (g0.span / 2) * Math.tan(i0.sweepDeg * DEG) + dStation;
        const sweepDeg = clamp('sweepDeg', Math.atan2(tipDx, hbNew) / DEG);
        onChange({ aspectRatio: Number(AR.toFixed(2)), sweepDeg: Number(sweepDeg.toFixed(1)) });
        break;
      }
      case 'tail': {
        const tailArm = clamp('tailArm', i0.tailArm + dStation);
        const tailVolume = clamp('tailVolume', (g0.tailArea * tailArm) / (i0.wingArea * g0.mac));
        onChange({ tailArm: Number(tailArm.toFixed(3)), tailVolume: Number(tailVolume.toFixed(3)) });
        break;
      }
      case 'tailTip': {
        const hb = Math.max(g0.tailSpan / 2 + dSpan, 0.3);
        const St = (4 * hb * hb) / i0.tailAspectRatio;
        const tailVolume = clamp('tailVolume', (St * i0.tailArm) / (i0.wingArea * g0.mac));
        onChange({ tailVolume: Number(tailVolume.toFixed(3)) });
        break;
      }
      case 'hinge': {
        const ratio = clamp('elevatorChordRatio', i0.elevatorChordRatio - dStation / g0.tailChord);
        onChange({ elevatorChordRatio: Number(ratio.toFixed(3)) });
        break;
      }
      case 'cg': {
        onChange({ xcg: clamp('xcg', i0.xcg + dStation / g0.mac) });
        break;
      }
    }
  };
  const end = () => {
    drag.current = null;
    setActive(null);
  };

  const wingPoly: [number, number][] = [
    [inp.wingStation, 0], [tipLe, halfB], [tipLe + ct, halfB], [inp.wingStation + cr, 0], [tipLe + ct, -halfB], [tipLe, -halfB],
  ];
  // nose/tail-cone blend lengths scale with the body diameter
  const noseL = Math.min(fusW * 3, fusL * 0.25);
  const fusPath = `M${P(0, 0)} C${P(noseL * 0.15, fusW)} ${P(noseL * 0.55, fusW)} ${P(noseL, fusW)} L${P(fusL * 0.55, fusW)} L${P(fusL, fusW * 0.25)}
    L${P(fusL, -fusW * 0.25)} L${P(fusL * 0.55, -fusW)} L${P(noseL, -fusW)} C${P(noseL * 0.55, -fusW)} ${P(noseL * 0.15, -fusW)} ${P(0, 0)}Z`;
  const status = r.stat.status;
  const engY = inp.engineCount === 2 ? [halfB * 0.35, -halfB * 0.35] : [0];
  // MAC ruler in the left gutter (same vertical scale as the planform) carries the labels,
  // so the planform itself stays symmetric about the fuselage centreline
  const rulerX = labelGutter - 10;
  const markX = rulerX - 8;

  // CG / NP / NP' / MP labels to the left of the planform, de-conflicted vertically
  const pctOf = (x: number) => `${(x * 100).toFixed(1)}%`;
  const viewMin = -0.2, viewMax = worldLen;
  const labels = [
    { st: cgSt, text: `CG ${pctOf(inp.xcg)}`, cls: `mk-cg st-${status}`, tip: TERMS.CG },
    { st: npSt, text: `NP = AC ${pctOf(r.stat.xnp)}`, cls: 'mk-np', tip: `${TERMS.NP} ${TERMS.AC_AIRCRAFT}` },
    { st: npFreeSt, text: `NP' ${pctOf(r.stat.xnpFree)}`, cls: 'mk-npf', tip: TERMS.NPF },
    { st: mpSt, text: `MP ${pctOf(r.man.xmp)}`, cls: 'mk-mp', tip: TERMS.MP },
    { st: pts.stations.acWingBody, text: `AC wb ${pctOf(pts.acWingBody)}`, cls: 'mk-ac', tip: TERMS.AC },
    ...(pts.cpWing !== null ? [{ st: pts.stations.cpWing!, text: `CP wing ${pctOf(pts.cpWing)}`, cls: 'mk-cpw', tip: TERMS.CP_WING }] : []),
    ...(pts.cpAircraft !== null ? [{ st: pts.stations.cpAircraft!, text: `CP ${pctOf(pts.cpAircraft)}`, cls: 'mk-cp', tip: TERMS.CP }] : []),
  ].map((l) => ({ ...l, st: Math.min(Math.max(l.st, viewMin), viewMax) })).sort((a, b) => a.st - b.st);
  let lastY = -Infinity;
  const placed = labels.map((l) => {
    const y = Math.max(SY(l.st), lastY + 13);
    lastY = y;
    return { ...l, y };
  });
  const shift = Math.max(0, lastY - (SY(Math.max(...labels.map((l) => l.st))) + 20));
  placed.forEach((p) => (p.y -= shift / 2));

  return (
    <figure className="chart schematic" aria-label="Aircraft schematic">
      <figcaption className="chart-head">
        <span className="chart-title">Configuration schematic (drag to edit)<Hint text="Top view (nose up) and side view. Drag: the wing body (wing station), the round handle at the wing tip (span and sweep), the tail (tail arm), the tail tip handle (tail size, V_h), the elevator hinge line (elevator chord), the CG symbol, and the engine (station; in the side view also thrust-line height). Hold Shift for fine control." /></span>
        <span className="legend">
          <span className="legend-item" data-tip={TERMS.CG}><span className="sw sw-cg" />CG</span>
          <span className="legend-item" data-tip={TERMS.NP}><span className="sw sw-np" />NP</span>
          <span className="legend-item" data-tip={TERMS.NPF}><span className="sw sw-npf" />NP′ stick-free</span>
          <span className="legend-item" data-tip={TERMS.MP}><span className="sw sw-mp" />MP maneuver pt</span>
          <span className="legend-item" data-tip={TERMS.AC}><span className="sw sw-ac" />AC</span>
          <span className="legend-item" data-tip={TERMS.CP}><span className="sw sw-cp" />CP</span>
          <span className="legend-item" data-tip={TERMS.ENGINE}><span className="sw sw-eng" />Engine</span>
        </span>
      </figcaption>
      <div ref={ref} className="chart-body" onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
        <svg width={width} height={TOP_H} role="img" aria-label="Planform with draggable wing, tail, elevator, engine and CG">
          <path d={fusPath} className="sch-fus" />
          <polygon points={poly(wingPoly)} className={`sch-wing ${active === 'wing' ? 'is-active' : ''}`} onPointerDown={start('wing')}>
            <title>Drag: wing station along the fuselage</title>
          </polygon>
          <line x1={SX(geo.yMac)} x2={SX(geo.yMac)} y1={SY(macLe)} y2={SY(macLe + c)} className="sch-mac" />
          <line x1={SX(-geo.yMac)} x2={SX(-geo.yMac)} y1={SY(macLe)} y2={SY(macLe + c)} className="sch-mac" />
          <text x={SX(geo.yMac) + 6} y={SY(macLe + c / 2)} className="sch-note tip-target" dominantBaseline="middle" data-tip={TERMS.MAC}>MAC {c.toFixed(2)} m</text>
          <polygon points={poly([[tailLe, -hbT], [tailLe, hbT], [tailTe, hbT], [tailTe, -hbT]])}
            className={`sch-tail ${active === 'tail' ? 'is-active' : ''}`} onPointerDown={start('tail')}>
            <title>Drag: tail arm l_t</title>
          </polygon>
          <polygon points={poly([[hingeSt, -hbT], [hingeSt, hbT], [tailTe, hbT], [tailTe, -hbT]])} className="sch-elev" pointerEvents="none" />
          <line x1={SX(-hbT)} x2={SX(hbT)} y1={SY(hingeSt)} y2={SY(hingeSt)} className={`sch-hinge ${active === 'hinge' ? 'is-active' : ''}`} onPointerDown={start('hinge')}>
            <title>Drag: elevator chord</title>
          </line>
          <g className="sch-dim">
            <line x1={SX(hbT) + 14} x2={SX(hbT) + 14} y1={SY(wingAcSt)} y2={SY(tailAcSt)} />
            <line x1={SX(hbT) + 9} x2={SX(hbT) + 19} y1={SY(wingAcSt)} y2={SY(wingAcSt)} />
            <line x1={SX(hbT) + 9} x2={SX(hbT) + 19} y1={SY(tailAcSt)} y2={SY(tailAcSt)} />
            <text x={SX(hbT) + 20} y={SY((wingAcSt + tailAcSt) / 2) + 26} className="tip-target" data-tip={TERMS.LT}>l_t {inp.tailArm.toFixed(2)} m</text>
            <text x={SX(hbT) + 20} y={SY((wingAcSt + tailAcSt) / 2) + 40} className="tip-target" data-tip={TERMS.VH}>V_h {inp.tailVolume.toFixed(2)}</text>
          </g>
          {engY.map((y, k) => (
            <g key={k} className={`sch-engine ${active === 'engine' ? 'is-active' : ''}`} onPointerDown={start('engine')}>
              <rect x={SX(y) - 7} y={SY(inp.engineStation) - 4} width={14} height={20} rx={4} />
              {inp.engineType === 'propeller' && <line x1={SX(y) - 17} x2={SX(y) + 17} y1={SY(inp.engineStation) - 6} y2={SY(inp.engineStation) - 6} className="prop" />}
              <title>Drag: engine station (engine mass moves the CG)</title>
            </g>
          ))}
          {/* symmetric station ticks across the fuselage */}
          {placed.map((p) => (
            <line key={`t-${p.cls}`} className={`sch-tick ${p.cls}`} x1={SX(-fusW) - 5} x2={SX(fusW) + 5} y1={SY(p.st)} y2={SY(p.st)} />
          ))}
          {/* MAC ruler with labels */}
          <g className="sch-ruler-v">
            <line x1={rulerX} x2={rulerX} y1={SY(macLe)} y2={SY(macLe + c)} />
            <line x1={rulerX - 4} x2={rulerX + 4} y1={SY(macLe)} y2={SY(macLe)} />
            <line x1={rulerX - 4} x2={rulerX + 4} y1={SY(macLe + c)} y2={SY(macLe + c)} />
            <text x={rulerX} y={SY(macLe) - 6} textAnchor="middle">LE</text>
            <text x={rulerX} y={SY(macLe + c) + 12} textAnchor="middle">TE</text>
          </g>
          {placed.map((p) => (
            <g key={p.cls} className={`sch-mark ${p.cls}`}>
              <polyline points={`${rulerX + 6},${SY(p.st)} ${rulerX - 2},${SY(p.st)} ${markX + 2},${p.y}`} fill="none" />
              <text x={markX} y={p.y} textAnchor="end" dominantBaseline="middle" data-tip={p.tip} className="tip-target">{p.text}</text>
            </g>
          ))}
          <g className={`sch-cg st-${status} ${active === 'cg' ? 'is-active' : ''} ${mp ? 'is-computed' : ''}`} onPointerDown={mp ? undefined : start('cg')}>
            <circle cx={cx} cy={SY(cgSt)} r={14} fill="transparent" />
            <circle cx={cx} cy={SY(cgSt)} r={9} className="cg-disc" />
            <path d={`M${cx},${SY(cgSt) - 9} A9,9 0 0 1 ${cx + 9},${SY(cgSt)} L${cx},${SY(cgSt)}Z M${cx},${SY(cgSt) + 9} A9,9 0 0 1 ${cx - 9},${SY(cgSt)} L${cx},${SY(cgSt)}Z`} className="cg-quads" />
            <title>{mp ? 'CG computed from the components (move them in the side view, or switch the CG source to manual)' : 'Drag: CG position'}</title>
          </g>
          <circle cx={SX(halfB)} cy={SY(tipLe + ct / 2)} r={8}
            className={`sch-handle ${active === 'wingTip' ? 'is-active' : ''}`} onPointerDown={start('wingTip')}>
            <title>Drag: span (left/right) and sweep (up/down)</title>
          </circle>
          <circle cx={SX(hbT)} cy={SY(tailLe + geo.tailChord / 2)} r={7} className={`sch-handle ${active === 'tailTip' ? 'is-active' : ''}`} onPointerDown={start('tailTip')}>
            <title>Drag: tail size (V_h)</title>
          </circle>
        </svg>

        <svg width={width} height={SIDE_H} role="img" aria-label="Side view with draggable engine and thrust line" className="side-view">
          <text x={4} y={14} className="sch-note">Side view</text>
          <path d={`M${QX(0)},${QZ(0)} Q${QX(0.6)},${QZ(-fusW * 1.6)} ${QX(2)},${QZ(-fusW * 1.7)} L${QX(fusL * 0.6)},${QZ(-fusW * 1.3)} L${QX(fusL)},${QZ(-fusW * 0.8)}
            L${QX(fusL)},${QZ(-fusW * 0.3)} L${QX(fusL * 0.6)},${QZ(fusW * 0.6)} L${QX(2)},${QZ(fusW * 1.1)} Q${QX(0.6)},${QZ(fusW)} ${QX(0)},${QZ(0)}Z`} className="sch-fus" />
          <line x1={QX(macLe)} x2={QX(macLe + c)} y1={QZ(fusW * 0.9)} y2={QZ(fusW * 0.9)} className="sch-wing-side" />
          <line x1={QX(tailLe)} x2={QX(tailTe)} y1={QZ(-fusW * 0.9)} y2={QZ(-fusW * 0.9)} className="sch-wing-side tail" />
          <path d={`M${QX(tailLe - 0.2)},${QZ(-fusW)} L${QX(tailTe - 0.25)},${QZ(-fusW * 3.4)} L${QX(tailTe)},${QZ(-fusW * 3.4)} L${QX(tailTe)},${QZ(-fusW)}Z`} className="sch-fin" />
          <line x1={QX(0)} x2={QX(fusL)} y1={QZ(0)} y2={QZ(0)} className="sch-ref-line" />
          <g className="sch-dim">
            <line x1={QX(0)} x2={QX(overallL)} y1={SIDE_H - 30} y2={SIDE_H - 30} />
            <line x1={QX(0)} x2={QX(0)} y1={SIDE_H - 35} y2={SIDE_H - 25} />
            <line x1={QX(overallL)} x2={QX(overallL)} y1={SIDE_H - 35} y2={SIDE_H - 25} />
            <text x={QX(overallL / 2)} y={SIDE_H - 18} textAnchor="middle" className="tip-target" data-tip={TERMS.LENGTH}>overall length {overallL.toFixed(2)} m</text>
            <line x1={QX(0) - 8} x2={QX(0) - 8} y1={QZ(-fusW)} y2={QZ(fusW)} />
            <text x={QX(0) - 11} y={QZ(0)} textAnchor="end" dominantBaseline="middle" className="tip-target" data-tip="Fuselage diameter (maximum width/height).">⌀{inp.fuselageDiameter.toFixed(2)}</text>
          </g>
          {pts.stations.cpAircraft !== null && (
            <g className="sch-force lift" data-tip={TERMS.CP}>
              <line x1={QX(pts.stations.cpAircraft)} x2={QX(pts.stations.cpAircraft)} y1={QZ(0)} y2={QZ(-fusW) - 26} />
              <path d={`M${QX(pts.stations.cpAircraft)},${QZ(-fusW) - 32} l-5,8 h10z`} />
              <text x={QX(pts.stations.cpAircraft) + 6} y={QZ(-fusW) - 26} className="sch-note">L @ CP</text>
            </g>
          )}
          <g className="sch-force weight" data-tip={TERMS.CG}>
            <line x1={QX(cgSt)} x2={QX(cgSt)} y1={QZ(zcg)} y2={QZ(fusW) + 18} />
            <path d={`M${QX(cgSt)},${QZ(fusW) + 24} l-5,-8 h10z`} />
            <text x={QX(cgSt) - 6} y={QZ(fusW) + 22} textAnchor="end" className="sch-note">W @ CG</text>
          </g>
          <line x1={QX(Math.min(inp.engineStation, cgSt) - 0.6)} x2={QX(Math.max(inp.engineStation, cgSt) + 0.6)} y1={QZ(zT)} y2={QZ(zT)} className="sch-thrust" />
          <path d={`M${QX(inp.engineStation) - 30},${QZ(zT)} l10,-5 v10z`} className="sch-arrow" />
          <g className={`sch-engine ${active === 'engineSide' ? 'is-active' : ''}`} onPointerDown={start('engineSide')}>
            <rect x={QX(inp.engineStation) - 10} y={QZ(zT) - 8} width={20} height={16} rx={4} />
            {inp.engineType === 'propeller' && <line x1={QX(inp.engineStation) - 13} x2={QX(inp.engineStation) - 13} y1={QZ(zT) - 22} y2={QZ(zT) + 22} className="prop" />}
            <title>Drag: engine station and thrust-line height</title>
          </g>
          {mp && mp.rows.filter((row) => row.id !== 'engine').map((row) => {
            const rr = Math.max(3, Math.min(9, Math.sqrt(row.mass) * 0.6));
            return (
              <g key={row.id} className={`sch-item ${active === `item:${row.id}` ? 'is-active' : ''}`} onPointerDown={start(`item:${row.id}`, row.station, row.z)}>
                <circle cx={QX(row.station)} cy={QZ(row.z)} r={rr + 4} fill="transparent" />
                <circle cx={QX(row.station)} cy={QZ(row.z)} r={rr} className="item-dot" />
                <title>{`${row.name}: ${row.mass.toFixed(0)} kg at ${row.station.toFixed(2)} m, z ${row.z.toFixed(2)} m. Drag to move it.`}</title>
              </g>
            );
          })}
          <g className={`sch-cg st-${status}`}>
            <circle cx={QX(cgSt)} cy={QZ(zcg)} r={7} className="cg-disc" />
            <path d={`M${QX(cgSt)},${QZ(zcg) - 7} A7,7 0 0 1 ${QX(cgSt) + 7},${QZ(zcg)} L${QX(cgSt)},${QZ(zcg)}Z M${QX(cgSt)},${QZ(zcg) + 7} A7,7 0 0 1 ${QX(cgSt) - 7},${QZ(zcg)} L${QX(cgSt)},${QZ(zcg)}Z`} className="cg-quads" />
          </g>
          <text x={width - 6} y={14} textAnchor="end" className="sch-note">
            T = {(r.prop.thrustRequired / 1000).toFixed(2)} kN · z_T = {inp.thrustLineZ.toFixed(2)} m {inp.thrustLineZ > 0 ? '(below CG: nose-up)' : inp.thrustLineZ < 0 ? '(above CG: nose-down)' : '(through CG)'}
          </text>
        </svg>
      </div>
      <div className="chart-caption">
        Length {overallL.toFixed(2)} m · wing root LE {inp.wingStation.toFixed(2)} m · span {geo.span.toFixed(2)} m (AR {inp.aspectRatio.toFixed(1)}, λ {inp.taperRatio.toFixed(2)}) · chords {cr.toFixed(2)}/{ct.toFixed(2)} m · sweep c/4 {inp.sweepDeg.toFixed(1)}° ·
        tail {geo.tailArea.toFixed(2)} m² · elevator {(inp.elevatorChordRatio * 100).toFixed(0)}% chord · engine {inp.engineStation.toFixed(2)} m ({inp.engineMass.toFixed(0)} kg).
        Moving the wing keeps the CG fixed in the airframe; moving the engine moves the CG. Hold Shift while dragging for fine control.
      </div>
    </figure>
  );
}
