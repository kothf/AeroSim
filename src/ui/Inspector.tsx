/**
 * Right-hand inspector: an outliner of the aircraft's parts (like a CAD feature tree) and the
 * properties of the selected one. Selecting a part here or on the canvas is the same thing.
 */
import { AircraftInputs, AnalysisResult, INPUT_BOUNDS, MassItem, MassProperties, MassRef, geometry, itemPosFromStation, itemStation } from '../engine';
import { Hint, NacaField, NumberField, Slider } from './Fields';
import { PARAM_INFO } from './params';

export type Sel = 'aircraft' | 'flight' | 'fuselage' | 'wing' | 'tail' | 'engine' | `item:${string}`;

interface Props {
  inp: AircraftInputs; // raw inputs (what the user edits)
  r: AnalysisResult;
  mp: MassProperties | null;
  sel: Sel;
  onSelect: (s: Sel) => void;
  set: (patch: Partial<AircraftInputs>) => void;
  onReset: () => void;
}

const b = (k: keyof AircraftInputs) => INPUT_BOUNDS[k] as [number, number];
const STRUCT: Record<string, Sel> = { wing: 'wing', fuel: 'wing', fus: 'fuselage', tail: 'tail' };
const REF_LABEL: Record<MassRef, string> = {
  nose: 'Fuselage (fixed)',
  fuselage: 'Fuselage (scales with length)',
  mac: 'Wing (moves with the wing)',
  tail: 'Tail (moves with the tail)',
};

export function Inspector({ inp, r, mp, sel, onSelect, set, onReset }: Props) {
  const num = (k: keyof typeof PARAM_INFO, over?: Partial<{ label: string; hint: string }>) => {
    const info = PARAM_INFO[k];
    return (
      <NumberField key={k} label={over?.label ?? info.label} unit={info.unit} hint={over?.hint ?? info.hint} slider={info.slider}
        value={Number((inp[k] as number).toPrecision(6))} min={b(k)[0]} max={b(k)[1]}
        onChange={(v) => set({ [k]: v } as Partial<AircraftInputs>)} />
    );
  };
  const geo = r.geometry;
  const upd = (id: string, patch: Partial<MassItem>) => set({ massItems: inp.massItems.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  const addItem = () => {
    const id = `item${Date.now().toString(36)}`;
    set({ massItems: [...inp.massItems, { id, name: 'New mass', mass: 20, ref: 'nose', pos: Number((mp?.station ?? 2.5).toFixed(2)), z: 0, len: 0.4, h: 0.3 }] });
    onSelect(`item:${id}`);
  };
  const itemOf = (id: string) => inp.massItems.find((m) => m.id === id);
  const massOf = (id: string) => itemOf(id)?.mass;

  // ---------------- outliner
  const parts: { sel: Sel; label: string; sub: string }[] = [
    { sel: 'aircraft', label: 'Aircraft', sub: mp ? `${mp.mass.toFixed(0)} kg · CG ${(r.inputs.xcg * 100).toFixed(1)}%` : `manual CG ${(inp.xcg * 100).toFixed(1)}%` },
    { sel: 'fuselage', label: 'Fuselage', sub: `${inp.fuselageLength.toFixed(2)} × ⌀${inp.fuselageDiameter.toFixed(2)} m` },
    { sel: 'wing', label: 'Wing', sub: `NACA ${inp.wingNaca} · ${inp.wingArea.toFixed(1)} m² · b ${geo.span.toFixed(2)} m` },
    { sel: 'tail', label: 'Horizontal tail', sub: `NACA ${inp.tailNaca} · ${geo.tailArea.toFixed(2)} m² · l_t ${inp.tailArm.toFixed(2)} m` },
    { sel: 'engine', label: inp.engineCount === 2 ? 'Engines (2)' : 'Engine', sub: `${inp.engineType} · ${inp.engineMass.toFixed(0)} kg` },
  ];
  const freeItems = inp.massItems.filter((m) => !STRUCT[m.id]);

  return (
    <aside className="inspector" aria-label="Parts and properties">
      <div className="insp-head">
        <h2>Parts</h2>
        <button className="btn ghost sm" onClick={onReset} data-tip="Restore the default aircraft">Reset</button>
      </div>
      <ul className="outliner" role="listbox" aria-label="Aircraft parts">
        {parts.map((p) => (
          <li key={p.sel} role="option" aria-selected={sel === p.sel} className={sel === p.sel ? 'on' : ''} onClick={() => onSelect(p.sel)}>
            <span className={`ol-dot dot-${p.sel}`} /> <span className="ol-name">{p.label}</span> <span className="ol-sub">{p.sub}</span>
          </li>
        ))}
        {inp.massMode === 'components' && (
          <>
            <li className="ol-group">Masses <button className="linkish" onClick={addItem}>+ add</button></li>
            {freeItems.map((m) => {
              const id: Sel = `item:${m.id}`;
              return (
                <li key={m.id} role="option" aria-selected={sel === id} className={`ol-item ${sel === id ? 'on' : ''}`} onClick={() => onSelect(id)}>
                  <span className="ol-dot dot-item" /> <span className="ol-name">{m.name}</span> <span className="ol-sub">{m.mass} kg</span>
                </li>
              );
            })}
          </>
        )}
        <li role="option" aria-selected={sel === 'flight'} className={sel === 'flight' ? 'on' : ''} onClick={() => onSelect('flight')}>
          <span className="ol-dot dot-flight" /> <span className="ol-name">Flight condition</span> <span className="ol-sub">{inp.speedKts} kts · {inp.altitudeFt} ft</span>
        </li>
      </ul>

      <div className="insp-body">
        {sel === 'aircraft' && (
          <Section title="Aircraft · mass & balance">
            <label className="field">
              <span className="field-label">CG source<Hint text="From components: the CG (position and height), total mass and I_yy are computed from the parts and the masses you place. Manual: type the CG, mass and I_yy in directly." /></span>
              <select value={inp.massMode} onChange={(e) => set({ massMode: e.target.value as AircraftInputs['massMode'] })}>
                <option value="components">Computed from parts &amp; masses</option>
                <option value="manual">Manual CG, mass, I_yy</option>
              </select>
            </label>
            {mp ? (
              <>
                <Readout rows={[
                  ['Total mass', `${mp.mass.toFixed(0)} kg`],
                  ['CG', `${(mp.xcg * 100).toFixed(1)}% MAC · x ${mp.station.toFixed(3)} m`, mp.xcg < 0 || mp.xcg > 1],
                  ['CG height (below ref. line)', `${mp.z.toFixed(3)} m`],
                  ['I_yy', `${mp.iyy.toFixed(0)} kg·m²`],
                ]} />
                <MassList mp={mp} onSelect={onSelect} />
              </>
            ) : (
              <>
                <Slider label="CG position" hint={PARAM_INFO.xcg.hint} value={inp.xcg * 100} min={0} max={100} step={0.5}
                  format={(v) => `${v.toFixed(1)}% MAC`} onChange={(v) => set({ xcg: v / 100 })} />
                {num('mass')}
                {num('iyy')}
              </>
            )}
            <h4>Drag polar</h4>
            {num('cd0')}
            {num('oswald')}
          </Section>
        )}

        {sel === 'fuselage' && (
          <Section title="Fuselage">
            {num('fuselageLength')}
            {num('fuselageDiameter')}
            {num('fuselageXacShift')}
            {mp && massOf('fus') !== undefined && <ItemMass item={itemOf('fus')!} upd={upd} />}
          </Section>
        )}

        {sel === 'wing' && (
          <Section title="Wing">
            <NacaField label="Wing section" hint="NACA 4-digit (e.g. 4415) or 5-digit (e.g. 23012) code. Thin airfoil theory gives α₀ and c_m,c/4 from the camber line." value={inp.wingNaca} onChange={(v) => set({ wingNaca: v })} />
            {num('wingStation')}
            {num('wingArea')}
            {num('aspectRatio')}
            {num('taperRatio')}
            {num('sweepDeg')}
            {num('wingIncidenceDeg')}
            {num('clMax')}
            {num('xacWing')}
            <label className="field">
              <span className="field-label">3D lift-slope method<Hint text="Lifting line: C_Lα = c_lα cosΛ/(1 + c_lα cosΛ/(π AR)). DATCOM (Helmbold–Diederich) is more accurate for low AR and swept wings." /></span>
              <select value={inp.liftSlopeMethod} onChange={(e) => set({ liftSlopeMethod: e.target.value as AircraftInputs['liftSlopeMethod'] })}>
                <option value="lifting-line">Lifting line</option>
                <option value="datcom">DATCOM / Helmbold</option>
              </select>
            </label>
            <Readout rows={[
              ['Span b', `${geo.span.toFixed(2)} m`],
              ['Root / tip chord', `${geo.rootChord.toFixed(2)} / ${geo.tipChord.toFixed(2)} m`],
              ['MAC c̄ · at y', `${geo.mac.toFixed(3)} m · ${geo.yMac.toFixed(2)} m`],
            ]} />
            {mp && itemOf('wing') && <ItemMass item={itemOf('wing')!} upd={upd} />}
            {mp && itemOf('fuel') && <ItemMass item={itemOf('fuel')!} upd={upd} />}
          </Section>
        )}

        {sel === 'tail' && (
          <Section title="Horizontal tail">
            <NacaField label="Tail section" hint="NACA code of the horizontal tail section. Symmetric sections (00xx) have α₀ = 0." value={inp.tailNaca} onChange={(v) => set({ tailNaca: v })} />
            {num('tailArm')}
            {num('tailVolume')}
            {num('tailAspectRatio')}
            {num('tailEfficiency')}
            {num('tailIncidenceDeg')}
            {num('elevatorChordRatio')}
            <h4>Hinge moments &amp; controls</h4>
            {num('ch0')}
            {num('chAlpha')}
            {num('chDelta')}
            {num('stickGearing')}
            {num('downSpringN')}
            {mp && itemOf('tail') && <ItemMass item={itemOf('tail')!} upd={upd} />}
          </Section>
        )}

        {sel === 'engine' && (
          <Section title="Powerplant">
            <label className="field">
              <span className="field-label">Engine type<Hint text="Propeller: constant power, thrust falls as 1/V (X_u = −3qSC_D/(m u₀)). Jet: constant thrust (X_u = −2qSC_D/(m u₀))." /></span>
              <select value={inp.engineType} onChange={(e) => set({ engineType: e.target.value as AircraftInputs['engineType'] })}>
                <option value="propeller">Propeller (const. power)</option>
                <option value="jet">Jet (const. thrust)</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">Layout<Hint text={PARAM_INFO.engineCount.hint} /></span>
              <select value={inp.engineCount} onChange={(e) => set({ engineCount: Number(e.target.value) })}>
                <option value={1}>Single, centreline</option>
                <option value={2}>Twin, wing-mounted</option>
              </select>
            </label>
            {inp.engineType === 'propeller' ? num('maxPowerKw') : num('maxThrustKn')}
            {inp.engineType === 'propeller' && num('propEfficiency')}
            {num('engineStation')}
            {mp
              ? num('thrustLineZ', { label: 'Installation height z (below ref. line)', hint: `Thrust line (and engine CG) below the fuselage reference line, positive down. The model uses its offset from the computed CG: z_T = ${mp.thrustLineBelowCg.toFixed(3)} m. Thrust below the CG pitches the nose up (C_m,T = T z_T/(q S c̄)) and, for a propeller, adds phugoid damping (M_u = z_T dT/du / I_yy).` })
              : num('thrustLineZ')}
            {num('engineMass')}
          </Section>
        )}

        {sel.startsWith('item:') && (() => {
          const it = itemOf(sel.slice(5));
          if (!it) return <p className="muted">This mass was removed.</p>;
          if (STRUCT[it.id]) return <p className="muted">This mass belongs to the {STRUCT[it.id]}; edit it there.</p>;
          return <ItemEditor item={it} inp={inp} upd={upd} onDelete={() => { set({ massItems: inp.massItems.filter((m) => m.id !== it.id) }); onSelect('aircraft'); }} />;
        })()}

        {sel === 'flight' && (
          <Section title="Flight condition">
            {num('speedKts')}
            {num('altitudeFt')}
            {num('flightPathDeg')}
            {num('limitLoadFactor')}
            <label className="field">
              <span className="field-label">Flight phase category<Hint text="MIL-F-8785C flight phase category used for the handling-quality levels. A: non-terminal tasks needing precise flight-path control; B: cruise, climb, descent; C: take-off, approach and landing." /></span>
              <select value={inp.flightCategory} onChange={(e) => set({ flightCategory: e.target.value as AircraftInputs['flightCategory'] })}>
                <option value="A">A: precision (non-terminal)</option>
                <option value="B">B: cruise, climb, descent</option>
                <option value="C">C: take-off, approach, landing</option>
              </select>
            </label>
          </Section>
        )}
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="insp-section">
      <h3>{title}</h3>
      <div className="params">{children}</div>
    </section>
  );
}

function Readout({ rows }: { rows: [string, string, boolean?][] }) {
  return (
    <div className="readout">
      {rows.map(([k, v, warn]) => (
        <div className="kv" key={k}><span className="k">{k}</span><span className={`v ${warn ? 'warn-text' : ''}`}>{v}</span></div>
      ))}
    </div>
  );
}

function MassList({ mp, onSelect }: { mp: MassProperties; onSelect: (s: Sel) => void }) {
  return (
    <table className="mass-list">
      <thead><tr><th>Mass</th><th>kg</th><th>x m</th><th>z m</th></tr></thead>
      <tbody>
        {mp.rows.map((row) => (
          <tr key={row.id} onClick={() => onSelect(row.id === 'engine' ? 'engine' : STRUCT[row.id] ?? `item:${row.id}`)}>
            <td>{row.name}</td><td>{row.mass.toFixed(0)}</td><td>{row.station.toFixed(2)}</td><td>{row.z.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Mass of a part's structural item (and its position, for the wing fuel). */
function ItemMass({ item, upd }: { item: MassItem; upd: (id: string, p: Partial<MassItem>) => void }) {
  return (
    <>
      <h4>{item.name}</h4>
      <NumberField label="Mass" unit="kg" value={item.mass} min={0} max={1e5} slider={[0, Math.max(400, item.mass * 2), 1]} onChange={(v) => upd(item.id, { mass: v })} />
      {item.ref === 'mac' && (
        <NumberField label="Position" unit="% MAC" value={Number((item.pos * 100).toFixed(2))} min={-100} max={200} slider={[0, 100, 0.5]} onChange={(v) => upd(item.id, { pos: v / 100 })} />
      )}
    </>
  );
}

function ItemEditor({ item, inp, upd, onDelete }: { item: MassItem; inp: AircraftInputs; upd: (id: string, p: Partial<MassItem>) => void; onDelete: () => void }) {
  const geo = geometry(inp);
  const station = itemStation(item, inp, geo);
  return (
    <Section title="Mass item">
      <label className="field">
        <span className="field-label">Name</span>
        <span className="field-input"><input value={item.name} onChange={(e) => upd(item.id, { name: e.target.value })} aria-label="Name" /></span>
      </label>
      <NumberField label="Mass" unit="kg" value={item.mass} min={0} max={1e5} slider={[0, 400, 1]} onChange={(v) => upd(item.id, { mass: v })} />
      <NumberField label="Station x (from nose)" unit="m" value={Number(station.toFixed(3))} min={-5} max={100} slider={[0, Math.ceil(inp.fuselageLength), 0.01]}
        onChange={(v) => upd(item.id, { pos: Number(itemPosFromStation(item, v, inp, geo).toFixed(4)) })} />
      <NumberField label="Height z (below ref. line)" unit="m" value={item.z} min={-10} max={10} slider={[-1.5, 1.5, 0.01]} onChange={(v) => upd(item.id, { z: v })} hint="Positive down. Sets the CG height." />
      <NumberField label="Length" unit="m" value={item.len} min={0} max={50} slider={[0, 3, 0.01]} onChange={(v) => upd(item.id, { len: v })} hint="Box length along x; with the height it sets the item's own pitch inertia m(len² + h²)/12." />
      <NumberField label="Height" unit="m" value={item.h} min={0} max={20} slider={[0, 2, 0.01]} onChange={(v) => upd(item.id, { h: v })} />
      <label className="field">
        <span className="field-label">Attached to<Hint text="What the item moves with when you move or resize parts." /></span>
        <select value={item.ref} onChange={(e) => {
          const ref = e.target.value as MassRef;
          upd(item.id, { ref, pos: Number(itemPosFromStation({ ...item, ref }, station, inp, geo).toFixed(4)) });
        }}>
          {(Object.keys(REF_LABEL) as MassRef[]).map((k) => <option key={k} value={k}>{REF_LABEL[k]}</option>)}
        </select>
      </label>
      <button className="btn danger" onClick={onDelete}>Delete this mass</button>
    </Section>
  );
}
