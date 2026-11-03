/** Mass & balance table: component masses and positions, and the CG, mass and I_yy they give. */
import { geometry, itemPosFromStation } from '../engine';
import type { AircraftInputs, MassItem, MassProperties, MassRef } from '../engine';
import { Hint } from './Fields';

interface Props {
  inp: AircraftInputs;
  mp: MassProperties;
  set: (patch: Partial<AircraftInputs>) => void;
}

const REF_LABEL: Record<MassRef, { unit: string; label: string; step: number }> = {
  nose: { unit: 'm', label: 'm aft of nose', step: 0.05 },
  fuselage: { unit: '×L', label: 'fraction of fuselage length', step: 0.01 },
  mac: { unit: '×c̄', label: 'fraction of MAC aft of the MAC LE (moves with the wing)', step: 0.01 },
  tail: { unit: 'm', label: 'm aft of the tail AC (moves with the tail)', step: 0.05 },
};

function Cell({ value, onChange, step, label, min = -1e6, max = 1e6 }: { value: number; onChange: (v: number) => void; step: number; label: string; min?: number; max?: number }) {
  return (
    <input className="mt-num" type="number" step={step} min={min} max={max} value={Number(value.toPrecision(6))} aria-label={label}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (e.target.value !== '' && Number.isFinite(v) && v >= min && v <= max) onChange(v);
      }} />
  );
}

export function MassTable({ inp, mp, set }: Props) {
  const upd = (id: string, patch: Partial<MassItem>) => set({ massItems: inp.massItems.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  const del = (id: string) => set({ massItems: inp.massItems.filter((m) => m.id !== id) });
  const add = () => {
    const id = `item${Date.now().toString(36)}`;
    set({ massItems: [...inp.massItems, { id, name: 'New item', mass: 10, ref: 'nose', pos: Number(mp.station.toFixed(2)), z: 0 }] });
  };
  const eng = mp.rows.find((r) => r.id === 'engine')!;
  const outside = mp.xcg < 0 || mp.xcg > 1;
  return (
    <div className="mass-table">
      <div className="mt-legend">Per row: mass kg · position x (and its reference) · height z below the reference line, m</div>
      <div className="mt-head">
        <span>Component</span>
        <span>kg</span>
        <span>x<Hint text="Longitudinal position. Pick what it is measured from: m from the nose (fuselage-fixed items), a fraction of the fuselage length, a fraction of the MAC (wing items, move with the wing), or m aft of the tail AC (tail items, move with the tail)." /></span>
        <span>z ↓<Hint text="Height below the fuselage reference line, m (positive down). Sets the CG height and so the thrust-line offset from the CG." /></span>
      </div>
      {inp.massItems.map((m) => (
        <div className="mt-row" key={m.id}>
          <div className="mt-line">
            <input className="mt-name" value={m.name} aria-label="Component name" onChange={(e) => upd(m.id, { name: e.target.value })} />
            <button className="mt-del" onClick={() => del(m.id)} aria-label={`Remove ${m.name}`} title="Remove">×</button>
          </div>
          <div className="mt-line mt-vals">
            <Cell value={m.mass} step={1} min={0} max={1e6} label={`${m.name} mass`} onChange={(v) => upd(m.id, { mass: v })} />
            <span className="mt-x">
              <Cell value={m.pos} step={REF_LABEL[m.ref].step} label={`${m.name} position (${REF_LABEL[m.ref].label})`} onChange={(v) => upd(m.id, { pos: v })} />
              <select className="mt-ref" value={m.ref} aria-label={`${m.name} position reference`} title={REF_LABEL[m.ref].label}
                onChange={(e) => {
                  const ref = e.target.value as MassRef;
                  // keep the item where it is: convert its station into the new reference
                  const row = mp.rows.find((r) => r.id === m.id)!;
                  const pos = Number(itemPosFromStation({ ...m, ref }, row.station, inp, geometry(inp)).toFixed(3));
                  upd(m.id, { ref, pos });
                }}>
                <option value="nose">m from nose</option>
                <option value="fuselage">× fus. length</option>
                <option value="mac">× MAC (wing)</option>
                <option value="tail">m from tail AC</option>
              </select>
            </span>
            <Cell value={m.z} step={0.05} label={`${m.name} height below reference line`} onChange={(v) => upd(m.id, { z: v })} />
          </div>
        </div>
      ))}
      <div className="mt-row mt-engine">
        <div className="mt-line"><span>{eng.name}<Hint text="Engine mass, station and thrust-line height are set in the Powerplant section (or by dragging the engine on the schematic)." /></span></div>
        <div className="mt-line mt-vals"><span>{eng.mass.toFixed(0)}</span><span>{eng.station.toFixed(2)} m from nose</span><span>{eng.z.toFixed(2)}</span></div>
      </div>
      <button className="btn ghost mt-add" onClick={add}>+ Add component</button>
      <div className="mt-sum">
        <div className="kv"><span className="k">Total mass</span><span className="v">{mp.mass.toFixed(0)} kg</span></div>
        <div className="kv"><span className="k">CG<Hint text="x_cg = Σ m_i x_i / Σ m_i, shown in % MAC and as a station from the nose. Limited to 0–100% MAC." /></span><span className={`v ${outside ? 'warn-text' : ''}`}>{(mp.xcg * 100).toFixed(1)}% MAC · {mp.station.toFixed(3)} m</span></div>
        <div className="kv"><span className="k">CG height<Hint text="z_cg = Σ m_i z_i / Σ m_i below the fuselage reference line." /></span><span className="v">{mp.z.toFixed(3)} m</span></div>
        <div className="kv"><span className="k">Thrust line below CG z_T</span><span className="v">{mp.thrustLineBelowCg.toFixed(3)} m</span></div>
        <div className="kv"><span className="k">I_yy<Hint text="Pitch inertia about the CG: Σ m_i[(x_i − x_cg)² + (z_i − z_cg)²] plus the own inertia of the distributed items (fuselage, wing, tail modelled as rods)." /></span><span className="v">{mp.iyy.toFixed(0)} kg·m²</span></div>
      </div>
    </div>
  );
}
