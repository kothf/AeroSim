/**
 * Aircraft editor canvas: top view (left) and side view (right), both nose-left, on one zoomable,
 * pannable stage. Click any part to select it (its properties open in the inspector), drag it to
 * move it, and drag the round handles of the selected part to resize it. The CG and the other
 * reference points are display-only, so they never block a drag.
 *
 * Wheel = zoom about the pointer, drag on empty space = pan, Shift while dragging = fine control.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AircraftInputs, AnalysisResult, DEG, INPUT_BOUNDS, MassProperties, itemPosFromStation, macLeadingEdge, moveEngine, moveWing } from '../engine';
import { TERMS } from './glossary';
import { useSize } from './useSize';
import type { Sel } from './Inspector';

interface Props {
  r: AnalysisResult;
  mp: MassProperties | null;
  sel: Sel;
  onSelect: (s: Sel) => void;
  onChange: (patch: Partial<AircraftInputs>) => void;
}

type Kind =
  | 'pan' | 'wing' | 'wingTip' | 'wingRootTe' | 'tail' | 'tailTip' | 'hinge' | 'fusEnd' | 'fusSide'
  | 'engine' | 'engineSide' | `item:${string}` | `itemSize:${string}`;

const clamp = (k: keyof AircraftInputs, v: number) => {
  const b = INPUT_BOUNDS[k];
  return b ? Math.min(Math.max(v, b[0]), b[1]) : v;
};
const r3 = (v: number) => Number(v.toFixed(3));

/** s: px per metre; ox/oy: screen offset; Y0: top-view centre line (span); X0/Z0: side-view origin */
interface View { s: number; ox: number; oy: number; Y0: number; X0: number; Z0: number }

const STAGE_H = 560;

export function Editor({ r, mp, sel, onSelect, onChange }: Props) {
  const [ref, size] = useSize<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const inp = r.inputs;
  const geo = r.geometry;
  const pts = r.points;
  const c = geo.mac;
  const hb = geo.span / 2;
  const hbT = geo.tailSpan / 2;
  const L = inp.fuselageLength;
  const D = inp.fuselageDiameter;
  const R = D / 2;
  const macLe = macLeadingEdge(inp, geo);
  const cr = geo.rootChord;
  const ct = geo.tipChord;
  const tipLe = pts.tipLe;
  const { tailLe, tailTe } = pts.stations;
  const hingeSt = tailTe - geo.elevatorChord;
  const fusL = Math.max(L, tailTe + 0.15);
  const cgSt = macLe + inp.xcg * c;
  const zcg = mp ? mp.z : 0;
  const zT = zcg + inp.thrustLineZ; // thrust line below the reference line
  const [showMasses, setShowMasses] = useState(true);
  const [active, setActive] = useState<Kind | null>(null);

  // ---------------- view (fit / zoom / pan)
  const width = Math.max(size.width, 320);
  // world layout: top view (nose up) on the left, side view (nose left) on the right
  const fit = (): View => {
    const len = Math.max(fusL, tipLe + ct);
    const gutter = 2.4; // labels of the reference-point ruler
    const halfW = Math.max(hb, hbT) + 0.3;
    const gap = 1.0;
    const worldW = gutter + 2 * halfW + gap + len + 0.6;
    const worldH = len + 1.2;
    const s = Math.min((width - 16) / worldW, (STAGE_H - 16) / worldH);
    const ox = (width - worldW * s) / 2;
    return { s, ox, oy: (STAGE_H - worldH * s) / 2 + 0.6 * s, Y0: gutter + halfW, X0: gutter + 2 * halfW + gap, Z0: len * 0.45 };
  };
  const [view, setView] = useState<View | null>(null);
  const userView = useRef(false);
  useLayoutEffect(() => {
    if (!userView.current && size.width > 0) setView(fit());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width]);
  const v = view ?? fit();
  const { s } = v;
  const PX = (y: number) => v.ox + (v.Y0 + y) * s; // top view: span → screen x
  const PY = (x: number) => v.oy + x * s; // top view: station → screen y (nose up)
  const QX = (x: number) => v.ox + (v.X0 + x) * s; // side view: station → screen x (nose left)
  const QZ = (z: number) => v.oy + (v.Z0 + z) * s; // side view: z (down)
  const P = (x: number, y: number) => `${PX(y).toFixed(1)},${PY(x).toFixed(1)}`;
  const Q = (x: number, z: number) => `${QX(x).toFixed(1)},${QZ(z).toFixed(1)}`;

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const k = Math.exp(-e.deltaY * 0.0015);
      userView.current = true;
      setView((cur) => {
        const c0 = cur ?? fit();
        const s1 = Math.min(Math.max(c0.s * k, 4), 600);
        const kk = s1 / c0.s;
        return { ...c0, s: s1, ox: mx - (mx - c0.ox) * kk, oy: my - (my - c0.oy) * kk };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  // ---------------- dragging
  const drag = useRef<{ kind: Kind; side: boolean; x0: number; y0: number; inp: AircraftInputs; geo: AnalysisResult['geometry']; v: View; zcg: number; a: number; b: number } | null>(null);
  /** side = the element is in the side view (screen x = station, screen y = z); else top view (screen y = station, x = span) */
  const start = (kind: Kind, select?: Sel, a = 0, b = 0, side = false) => (e: React.PointerEvent) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { kind, side, x0: e.clientX, y0: e.clientY, inp: { ...inp }, geo: { ...geo }, v, zcg, a, b };
    setActive(kind);
    if (select) onSelect(select);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const fine = e.shiftKey ? 0.2 : 1;
    const sx = (fine * (e.clientX - d.x0)) / d.v.s;
    const sy = (fine * (e.clientY - d.y0)) / d.v.s;
    // dx: along the fuselage (aft +); dy: span (top view, right +) or z (side view, down +)
    const dx = d.side ? sx : sy;
    const dy = d.side ? sy : sx;
    const i0 = d.inp, g0 = d.geo;
    const k = d.kind;
    if (k === 'pan') {
      userView.current = true;
      setView({ ...d.v, ox: d.v.ox + (e.clientX - d.x0), oy: d.v.oy + (e.clientY - d.y0) });
      return;
    }
    if (k.startsWith('item:')) {
      const id = k.slice(5);
      onChange({ massItems: i0.massItems.map((m) => (m.id === id ? { ...m, pos: r3(itemPosFromStation(m, d.a + dx, i0, g0)), z: r3(d.b + dy) } : m)) });
      return;
    }
    if (k.startsWith('itemSize:')) {
      const id = k.slice(9);
      onChange({ massItems: i0.massItems.map((m) => (m.id === id ? { ...m, len: r3(Math.max(0.05, d.a + 2 * dx)), h: r3(Math.max(0.05, d.b + 2 * dy)) } : m)) });
      return;
    }
    switch (k) {
      case 'wing':
        onChange(moveWing(i0, g0, r3(Math.min(Math.max(i0.wingStation + dx, 0), i0.fuselageLength - 0.2))));
        break;
      case 'wingTip': {
        const hbNew = Math.max(g0.span / 2 + d.a * dy, 0.5);
        const AR = clamp('aspectRatio', (4 * hbNew * hbNew) / i0.wingArea);
        const hbC = Math.sqrt(AR * i0.wingArea) / 2;
        const c4dx = (g0.span / 2) * Math.tan(i0.sweepDeg * DEG) + dx;
        onChange({ aspectRatio: Number(AR.toFixed(2)), sweepDeg: Number(clamp('sweepDeg', Math.atan2(c4dx, hbC) / DEG).toFixed(1)) });
        break;
      }
      case 'wingRootTe': {
        // root chord at constant span and taper: S scales with the chord
        const k2 = Math.max(0.2, (g0.rootChord + dx) / g0.rootChord);
        const S = clamp('wingArea', i0.wingArea * k2);
        onChange({ wingArea: Number(S.toFixed(2)), aspectRatio: Number(clamp('aspectRatio', (g0.span * g0.span) / S).toFixed(2)) });
        break;
      }
      case 'tail': {
        const tailArm = clamp('tailArm', i0.tailArm + dx);
        onChange({ tailArm: r3(tailArm), tailVolume: r3(clamp('tailVolume', (g0.tailArea * tailArm) / (i0.wingArea * g0.mac))) });
        break;
      }
      case 'tailTip': {
        const hbNew = Math.max(g0.tailSpan / 2 + (d.a >= 0 ? dy : -dy), 0.3);
        const St = (4 * hbNew * hbNew) / i0.tailAspectRatio;
        onChange({ tailVolume: r3(clamp('tailVolume', (St * i0.tailArm) / (i0.wingArea * g0.mac))) });
        break;
      }
      case 'hinge':
        onChange({ elevatorChordRatio: r3(clamp('elevatorChordRatio', i0.elevatorChordRatio - dx / g0.tailChord)) });
        break;
      case 'fusEnd':
        onChange({ fuselageLength: Number(clamp('fuselageLength', i0.fuselageLength + dx).toFixed(2)) });
        break;
      case 'fusSide':
        onChange({ fuselageDiameter: Number(clamp('fuselageDiameter', i0.fuselageDiameter + 2 * (d.a >= 0 ? dy : -dy)).toFixed(2)) });
        break;
      case 'engine':
      case 'engineSide': {
        const st = Math.min(Math.max(i0.engineStation + dx, 0), i0.fuselageLength);
        // in components mode thrustLineZ is stored from the reference line; i0 holds it relative to the CG
        const z = i0.thrustLineZ + d.zcg + (k === 'engineSide' ? dy : 0);
        onChange(moveEngine(i0, g0, r3(st), r3(z)));
        break;
      }
    }
  };
  const end = () => {
    drag.current = null;
    setActive(null);
  };
  const isSel = (x: Sel) => (sel === x ? 'is-selected' : '');
  const act = (x: Kind) => (active === x ? 'is-active' : '');

  // ---------------- shapes
  const noseL = Math.min(R * 3, fusL * 0.25);
  const fusTop = `M${P(0, 0)} C${P(noseL * 0.15, R)} ${P(noseL * 0.55, R)} ${P(noseL, R)} L${P(fusL * 0.55, R)} L${P(fusL, R * 0.25)}
    L${P(fusL, -R * 0.25)} L${P(fusL * 0.55, -R)} L${P(noseL, -R)} C${P(noseL * 0.55, -R)} ${P(noseL * 0.15, -R)} ${P(0, 0)}Z`;
  const wingPoly = [[inp.wingStation, 0], [tipLe, hb], [tipLe + ct, hb], [inp.wingStation + cr, 0], [tipLe + ct, -hb], [tipLe, -hb]] as [number, number][];
  const engY = inp.engineCount === 2 ? [hb * 0.35, -hb * 0.35] : [0];
  const fusSide = `M${Q(0, 0)} Q${Q(noseL * 0.3, -R * 1.05)} ${Q(noseL, -R)} L${Q(fusL * 0.6, -R * 0.9)} L${Q(fusL, -R * 0.55)}
    L${Q(fusL, -R * 0.2)} L${Q(fusL * 0.6, R * 0.55)} L${Q(noseL, R)} Q${Q(noseL * 0.3, R * 0.95)} ${Q(0, 0)}Z`;
  const finH = Math.max(1.1, 1.6 * D);

  // ---------------- reference-point ruler under the top view
  const status = r.stat.status;
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const marks = [
    { st: cgSt, text: `CG ${pct(inp.xcg)}`, cls: `mk-cg st-${status}`, tip: TERMS.CG },
    { st: macLe + r.stat.xnp * c, text: `NP=AC ${pct(r.stat.xnp)}`, cls: 'mk-np', tip: `${TERMS.NP} ${TERMS.AC_AIRCRAFT}` },
    { st: macLe + r.stat.xnpFree * c, text: `NP′ ${pct(r.stat.xnpFree)}`, cls: 'mk-npf', tip: TERMS.NPF },
    { st: macLe + r.man.xmp * c, text: `MP ${pct(r.man.xmp)}`, cls: 'mk-mp', tip: TERMS.MP },
    { st: pts.stations.acWingBody, text: `AC wb ${pct(pts.acWingBody)}`, cls: 'mk-ac', tip: TERMS.AC },
    ...(pts.cpAircraft !== null ? [{ st: pts.stations.cpAircraft!, text: `CP ${pct(pts.cpAircraft)}`, cls: 'mk-cp', tip: TERMS.CP }] : []),
    ...(pts.cpWing !== null ? [{ st: pts.stations.cpWing!, text: `CP wing ${pct(pts.cpWing)}`, cls: 'mk-cpw', tip: TERMS.CP_WING }] : []),
  ].sort((a, b) => a.st - b.st);
  // vertical MAC ruler in the left gutter; labels de-conflicted vertically
  const rulerX = v.ox + 2.15 * s;
  let lastY = -Infinity;
  const placed = marks.map((m) => {
    const y0 = PY(m.st);
    const y = Math.max(y0, lastY + 14);
    lastY = y;
    return { ...m, y0, y };
  });

  // structural masses (wing, fuel, fuselage, tail) belong to their parts and are edited there
  const items = mp ? mp.rows.filter((row) => row.id !== 'engine' && inp.massItems.find((m) => m.id === row.id)?.ref === 'nose') : [];
  const itemsById = new Map(inp.massItems.map((m) => [m.id, m]));
  const fitNow = () => { userView.current = false; setView(fit()); };
  const zoomBy = (k: number) => {
    userView.current = true;
    setView((cur) => {
      const c0 = cur ?? fit();
      const mx = width / 2, my = STAGE_H / 2;
      return { ...c0, s: c0.s * k, ox: mx - (mx - c0.ox) * k, oy: my - (my - c0.oy) * k };
    });
  };

  return (
    <div className="editor">
      <div className="editor-bar">
        <span className="editor-title">Aircraft</span>
        <span className="editor-hint">Click a part to edit it · drag to move · round handles resize · wheel to zoom · drag empty space to pan · Shift = fine</span>
        <span className="spacer" />
        {mp && <label className="chk"><input type="checkbox" checked={showMasses} onChange={(e) => setShowMasses(e.target.checked)} /> Masses</label>}
        <button className="btn ghost sm" onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">−</button>
        <button className="btn ghost sm" onClick={() => zoomBy(1.25)} aria-label="Zoom in">+</button>
        <button className="btn ghost sm" onClick={fitNow}>Fit</button>
      </div>
      <div ref={ref} className="editor-stage" onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
        <svg ref={svgRef} width={width} height={STAGE_H} role="img" aria-label="Aircraft editor: top view and side view"
          onPointerDown={start('pan', 'aircraft')} className={active === 'pan' ? 'panning' : ''}>
          <defs>
            <pattern id="grid" width={s} height={s} patternUnits="userSpaceOnUse" x={v.ox} y={v.oy}>
              <path d={`M${s},0 L0,0 0,${s}`} className="ed-grid" />
            </pattern>
          </defs>
          <rect width={width} height={STAGE_H} fill="url(#grid)" />
          <text x={PX(0)} y={PY(0) - 12} textAnchor="middle" className="ed-view-label">TOP</text>
          <text x={QX(0)} y={QZ(-R - finH) - 14} className="ed-view-label">SIDE</text>

          {/* ============ TOP VIEW (nose up) ============ */}
          <path d={fusTop} className={`ed-part ed-fus ${isSel('fuselage')}`} onPointerDown={start('pan', 'fuselage')}>
            <title>Fuselage: click to edit length and diameter</title>
          </path>
          <polygon points={wingPoly.map(([x, y]) => P(x, y)).join(' ')} className={`ed-part ed-wing ${isSel('wing')} ${act('wing')}`} onPointerDown={start('wing', 'wing')}>
            <title>Wing: drag to move along the fuselage; click to edit</title>
          </polygon>
          {[1, -1].map((sg) => <line key={sg} x1={PX(sg * geo.yMac)} x2={PX(sg * geo.yMac)} y1={PY(macLe)} y2={PY(macLe + c)} className="ed-mac" />)}
          <polygon points={[[tailLe, -hbT], [tailLe, hbT], [tailTe, hbT], [tailTe, -hbT]].map(([x, y]) => P(x, y)).join(' ')}
            className={`ed-part ed-tail ${isSel('tail')} ${act('tail')}`} onPointerDown={start('tail', 'tail')}>
            <title>Horizontal tail: drag to change the tail arm; click to edit</title>
          </polygon>
          <polygon points={[[hingeSt, -hbT], [hingeSt, hbT], [tailTe, hbT], [tailTe, -hbT]].map(([x, y]) => P(x, y)).join(' ')} className="ed-elev" pointerEvents="none" />
          {engY.map((y, i) => {
            const hw = Math.max(5, 0.22 * s), hl = Math.max(12, 0.8 * s);
            return (
              <g key={i} className={`ed-part ed-engine ${isSel('engine')} ${act('engine')}`} onPointerDown={start('engine', 'engine')}>
                <rect x={PX(y) - hw} y={PY(inp.engineStation) - 4} width={2 * hw} height={hl} rx={3} />
                {inp.engineType === 'propeller' && <line x1={PX(y) - 0.95 * s} x2={PX(y) + 0.95 * s} y1={PY(inp.engineStation) - 5} y2={PY(inp.engineStation) - 5} className="prop" />}
                <title>Engine: drag to move; click to edit</title>
              </g>
            );
          })}
          {/* reference ticks across the fuselage and the CG (display only) */}
          <g pointerEvents="none">
            {placed.map((m) => <line key={`t${m.cls}`} className={`sch-tick ${m.cls}`} x1={PX(-R) - 4} x2={PX(R) + 4} y1={m.y0} y2={m.y0} />)}
            <g className={`sch-cg st-${status}`}>
              <circle cx={PX(0)} cy={PY(cgSt)} r={8} className="cg-disc" />
              <path d={cgQuads(PX(0), PY(cgSt), 8)} className="cg-quads" />
            </g>
          </g>
          {/* MAC ruler with the reference points */}
          <g className="ed-ruler">
            <line x1={rulerX} x2={rulerX} y1={PY(macLe)} y2={PY(macLe + c)} className="ed-ruler-bar" />
            <text x={rulerX + 8} y={PY(macLe) - 8} textAnchor="middle" className="ed-small strong" data-tip={TERMS.MAC}>MAC</text>
            {placed.map((m) => (
              <g key={m.cls} className={`sch-mark ${m.cls}`}>
                <polyline points={`${rulerX + 5},${m.y0} ${rulerX - 4},${m.y0} ${rulerX - 12},${m.y}`} fill="none" />
                <text x={rulerX - 15} y={m.y} textAnchor="end" dominantBaseline="middle" data-tip={m.tip} className="tip-target">{m.text}</text>
              </g>
            ))}
          </g>

          {/* handles of the selected top-view part */}
          {sel === 'wing' && (
            <>
              {[1, -1].map((sg) => (
                <circle key={sg} cx={PX(sg * hb)} cy={PY(tipLe + ct / 2)} r={7} className={`ed-handle ${act('wingTip')}`} onPointerDown={start('wingTip', undefined, sg)}>
                  <title>Span (out/in) and sweep (fore/aft)</title>
                </circle>
              ))}
              <circle cx={PX(0)} cy={PY(inp.wingStation + cr)} r={7} className={`ed-handle ${act('wingRootTe')}`} onPointerDown={start('wingRootTe')}>
                <title>Root chord (wing area at constant span)</title>
              </circle>
              <Dim x1={PX(-hb)} y1={PY(Math.min(inp.wingStation, tipLe)) - 12} x2={PX(hb)} y2={PY(Math.min(inp.wingStation, tipLe)) - 12} text={`b ${geo.span.toFixed(2)} m · S ${inp.wingArea.toFixed(1)} m²`} />
            </>
          )}
          {sel === 'tail' && (
            <>
              {[1, -1].map((sg) => (
                <circle key={sg} cx={PX(sg * hbT)} cy={PY(tailLe + geo.tailChord / 2)} r={6} className={`ed-handle ${act('tailTip')}`} onPointerDown={start('tailTip', undefined, sg)}>
                  <title>Tail span (tail volume V_h)</title>
                </circle>
              ))}
              <line x1={PX(-hbT)} x2={PX(hbT)} y1={PY(hingeSt)} y2={PY(hingeSt)} className={`ed-hinge ${act('hinge')}`} onPointerDown={start('hinge')}>
                <title>Elevator hinge line: elevator chord</title>
              </line>
              <Dim x1={PX(hbT) + 16} y1={PY(pts.stations.acWing)} x2={PX(hbT) + 16} y2={PY(pts.stations.tailAc)} text={`l_t ${inp.tailArm.toFixed(2)} m · V_h ${inp.tailVolume.toFixed(2)}`} vertical />
            </>
          )}
          {sel === 'fuselage' && (
            <>
              <circle cx={PX(0)} cy={PY(L)} r={7} className={`ed-handle ${act('fusEnd')}`} onPointerDown={start('fusEnd')}><title>Fuselage length</title></circle>
              {[1, -1].map((sg) => (
                <circle key={sg} cx={PX(sg * R)} cy={PY(fusL * 0.4)} r={6} className={`ed-handle ${act('fusSide')}`} onPointerDown={start('fusSide', undefined, sg)}><title>Fuselage diameter</title></circle>
              ))}
              <Dim x1={PX(R) + 16} y1={PY(0)} x2={PX(R) + 16} y2={PY(L)} text={`L ${L.toFixed(2)} m · ⌀ ${D.toFixed(2)} m`} vertical />
            </>
          )}

          {/* ============ SIDE VIEW ============ */}
          <path d={fusSide} className={`ed-part ed-fus ${isSel('fuselage')}`} onPointerDown={start('pan', 'fuselage', 0, 0, true)} />
          <line x1={QX(0)} x2={QX(fusL)} y1={QZ(0)} y2={QZ(0)} className="sch-ref-line" pointerEvents="none" />
          <path d={`M${Q(tailLe - 0.15, -R * 0.6)} L${Q(tailTe - 0.35, -R * 0.6 - finH)} L${Q(tailTe, -R * 0.6 - finH)} L${Q(tailTe, -R * 0.4)}Z`}
            className={`ed-part ed-fin ${isSel('tail')}`} onPointerDown={start('tail', 'tail', 0, 0, true)}><title>Tail: drag to change the tail arm</title></path>
          <rect x={QX(tailLe)} y={QZ(-R * 0.5) - 3} width={geo.tailChord * s} height={6} rx={2} className={`ed-part ed-tail ${isSel('tail')}`} onPointerDown={start('tail', 'tail', 0, 0, true)} />
          <rect x={QX(inp.wingStation)} y={QZ(R * 0.55) - 4} width={cr * s} height={8} rx={3} className={`ed-part ed-wing ${isSel('wing')}`} onPointerDown={start('wing', 'wing', 0, 0, true)}>
            <title>Wing: drag to move</title>
          </rect>
          {/* masses */}
          {showMasses && items.map((row) => {
            const it = itemsById.get(row.id)!;
            const w = Math.max(it.len * s, 6), h = Math.max(it.h * s, 6);
            const id: Sel = `item:${row.id}`;
            const structural = it.ref !== 'nose';
            return (
              <g key={row.id} className={`ed-item ${structural ? 'structural' : ''} ${isSel(id)} ${act(`item:${row.id}`)}`}>
                <rect x={QX(row.station) - w / 2} y={QZ(row.z) - h / 2} width={w} height={h} rx={3}
                  onPointerDown={start(`item:${row.id}`, id, row.station, row.z, true)} />
                <circle cx={QX(row.station)} cy={QZ(row.z)} r={2.5} pointerEvents="none" />
                {sel === id && <text x={QX(row.station)} y={QZ(row.z) - h / 2 - 5} textAnchor="middle" className="ed-small strong">{it.name} · {it.mass} kg</text>}
                {sel === id && (
                  <circle cx={QX(row.station) + w / 2} cy={QZ(row.z) + h / 2} r={5.5} className={`ed-handle ${act(`itemSize:${row.id}`)}`}
                    onPointerDown={start(`itemSize:${row.id}`, undefined, it.len, it.h, true)}><title>Size (length × height)</title></circle>
                )}
                <title>{`${it.name}: ${it.mass} kg at x ${row.station.toFixed(2)} m, z ${row.z.toFixed(2)} m. Drag to move.`}</title>
              </g>
            );
          })}
          {/* thrust line + engine */}
          <line x1={QX(Math.min(inp.engineStation, cgSt) - 0.5)} x2={QX(Math.max(inp.engineStation, cgSt) + 0.5)} y1={QZ(zT)} y2={QZ(zT)} className="sch-thrust" pointerEvents="none" />
          <g className={`ed-part ed-engine ${isSel('engine')} ${act('engineSide')}`} onPointerDown={start('engineSide', 'engine', 0, 0, true)}>
            <rect x={QX(inp.engineStation) - 4} y={QZ(zT) - Math.max(6, 0.3 * s)} width={Math.max(14, 0.8 * s)} height={2 * Math.max(6, 0.3 * s)} rx={4} />
            {inp.engineType === 'propeller' && <line x1={QX(inp.engineStation) - 5} x2={QX(inp.engineStation) - 5} y1={QZ(zT) - 0.95 * s} y2={QZ(zT) + 0.95 * s} className="prop" />}
            <title>Engine: drag to move (station and installation height)</title>
          </g>
          {/* forces and CG: display only */}
          <g pointerEvents="none">
            {pts.stations.cpAircraft !== null && (
              <g className="sch-force lift">
                <line x1={QX(pts.stations.cpAircraft)} x2={QX(pts.stations.cpAircraft)} y1={QZ(zcg)} y2={QZ(-R) - 30} />
                <path d={`M${QX(pts.stations.cpAircraft)},${QZ(-R) - 36} l-5,8 h10z`} />
                <text x={QX(pts.stations.cpAircraft) + 6} y={QZ(-R) - 30} className="ed-small">L @ CP</text>
              </g>
            )}
            <g className="sch-force weight">
              <line x1={QX(cgSt)} x2={QX(cgSt)} y1={QZ(zcg)} y2={QZ(R) + 24} />
              <path d={`M${QX(cgSt)},${QZ(R) + 30} l-5,-8 h10z`} />
              <text x={QX(cgSt) + 6} y={QZ(R) + 28} className="ed-small">W @ CG</text>
            </g>
            <g className={`sch-cg st-${status}`}>
              <circle cx={QX(cgSt)} cy={QZ(zcg)} r={8} className="cg-disc" />
              <path d={cgQuads(QX(cgSt), QZ(zcg), 8)} className="cg-quads" />
            </g>
            <Dim x1={QX(0)} y1={QZ(R) + 46} x2={QX(pts.overallLength)} y2={QZ(R) + 46} text={`overall length ${pts.overallLength.toFixed(2)} m`} />
            <text x={QX(pts.overallLength)} y={QZ(-R - finH) - 14} textAnchor="end" className="ed-small">
              T {(r.prop.thrustRequired / 1000).toFixed(2)} kN · z_T {inp.thrustLineZ.toFixed(2)} m {inp.thrustLineZ > 0 ? 'below CG (nose-up)' : inp.thrustLineZ < 0 ? 'above CG (nose-down)' : '(through CG)'}
            </text>
          </g>
        </svg>
      </div>
      <div className="editor-legend">
        <span className="legend-item" data-tip={TERMS.CG}><span className="sw sw-cg" />CG</span>
        <span className="legend-item" data-tip={TERMS.NP}><span className="sw sw-np" />NP (= aircraft AC)</span>
        <span className="legend-item" data-tip={TERMS.NPF}><span className="sw sw-npf" />NP′ stick-free</span>
        <span className="legend-item" data-tip={TERMS.MP}><span className="sw sw-mp" />MP maneuver point</span>
        <span className="legend-item" data-tip={TERMS.AC}><span className="sw sw-ac" />AC wing-body</span>
        <span className="legend-item" data-tip={TERMS.CP}><span className="sw sw-cp" />CP</span>
        {mp && <span className="legend-item"><span className="sw sw-item" />mass items</span>}
      </div>
    </div>
  );
}

function cgQuads(x: number, y: number, r: number) {
  return `M${x},${y - r} A${r},${r} 0 0 1 ${x + r},${y} L${x},${y}Z M${x},${y + r} A${r},${r} 0 0 1 ${x - r},${y} L${x},${y}Z`;
}

function Dim({ x1, y1, x2, y2, text, vertical }: { x1: number; y1: number; x2: number; y2: number; text: string; vertical?: boolean }) {
  return (
    <g className="sch-dim" pointerEvents="none">
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      {vertical ? (
        <>
          <line x1={x1 - 4} x2={x1 + 4} y1={y1} y2={y1} /><line x1={x2 - 4} x2={x2 + 4} y1={y2} y2={y2} />
          <text x={x1 + 6} y={(y1 + y2) / 2} dominantBaseline="middle">{text}</text>
        </>
      ) : (
        <>
          <line x1={x1} x2={x1} y1={y1 - 4} y2={y1 + 4} /><line x1={x2} x2={x2} y1={y2 - 4} y2={y2 + 4} />
          <text x={(x1 + x2) / 2} y={y1 - 5} textAnchor="middle">{text}</text>
        </>
      )}
    </g>
  );
}
