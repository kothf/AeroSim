import { AircraftInputs, INPUT_BOUNDS } from '../engine';
import { NacaField, NumberField, Slider } from './Fields';

interface Props {
  inp: AircraftInputs;
  set: (patch: Partial<AircraftInputs>) => void;
  onReset: () => void;
}

const b = (k: keyof AircraftInputs) => INPUT_BOUNDS[k] as [number, number];

export function Sidebar({ inp, set, onReset }: Props) {
  const num = (k: keyof AircraftInputs, label: string, unit?: string, scale = 1, hint?: string) => (
    <NumberField key={k} label={label} unit={unit} hint={hint}
      value={Number(((inp[k] as number) * scale).toPrecision(6))}
      min={b(k)[0] * scale} max={b(k)[1] * scale}
      onChange={(v) => set({ [k]: v / scale } as Partial<AircraftInputs>)} />
  );
  return (
    <aside className="sidebar" aria-label="Design parameters">
      <div className="side-head">
        <h2>Design params</h2>
        <button className="btn ghost" onClick={onReset}>Reset</button>
      </div>

      <section className="group">
        <h3>Mass &amp; balance</h3>
        <Slider label="CG position" value={inp.xcg * 100} min={0} max={100} step={0.5}
          format={(v) => `${v.toFixed(1)}% MAC`} onChange={(v) => set({ xcg: v / 100 })} />
        <div className="grid2">
          {num('mass', 'Mass', 'kg')}
          {num('iyy', 'I_yy', 'kg·m²')}
        </div>
      </section>

      <section className="group">
        <h3>Main wing profile</h3>
        <NacaField label="Wing section" value={inp.wingNaca} onChange={(v) => set({ wingNaca: v })} />
        <div className="grid2">
          {num('aspectRatio', 'Aspect ratio')}
          {num('sweepDeg', 'Sweep Λ', '°')}
          {num('wingArea', 'Area S', 'm²')}
          {num('wingStation', 'Root LE station', 'm', 1, 'Fuselage station of the wing root leading edge')}
          {num('xacWing', 'Wing x_ac', 'MAC')}
          {num('fuselageXacShift', 'Body Δx_ac', 'MAC', 1, 'Fuselage/nacelle shift of the aerodynamic centre (negative = forward)')}
          {num('cd0', 'C_D0')}
          {num('oswald', 'Oswald e')}
        </div>
        <label className="field">
          <span className="field-label">3D lift-slope method</span>
          <select value={inp.liftSlopeMethod} onChange={(e) => set({ liftSlopeMethod: e.target.value as AircraftInputs['liftSlopeMethod'] })}>
            <option value="lifting-line">Lifting line (FRS 1.3)</option>
            <option value="datcom">DATCOM / Helmbold</option>
          </select>
        </label>
      </section>

      <section className="group">
        <h3>Tail plane profile</h3>
        <NacaField label="Tail section" value={inp.tailNaca} onChange={(v) => set({ tailNaca: v })} />
        <div className="grid2">
          {num('tailVolume', 'Tail volume V_h')}
          {num('tailArm', 'Tail arm l_t', 'm')}
          {num('tailAspectRatio', 'Tail AR')}
          {num('tailEfficiency', 'Efficiency η')}
          {num('tailIncidenceDeg', 'Incidence i_t', '°')}
          {num('elevatorChordRatio', 'Elevator c_e/c_t')}
        </div>
      </section>

      <section className="group">
        <h3>Hinge moments &amp; controls</h3>
        <div className="grid2">
          {num('ch0', 'C_h0')}
          {num('chAlpha', 'C_hα', '/rad')}
          {num('chDelta', 'C_hδ', '/rad')}
          {num('stickGearing', 'Gearing G', 'rad/m')}
        </div>
      </section>

      <section className="group">
        <h3>Powerplant</h3>
        <div className="grid2">
          <label className="field">
            <span className="field-label">Type</span>
            <select value={inp.engineType} onChange={(e) => set({ engineType: e.target.value as AircraftInputs['engineType'] })}>
              <option value="propeller">Propeller (const. power)</option>
              <option value="jet">Jet (const. thrust)</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Layout</span>
            <select value={inp.engineCount} onChange={(e) => set({ engineCount: Number(e.target.value) })}>
              <option value={1}>Single, centreline</option>
              <option value={2}>Twin, wing-mounted</option>
            </select>
          </label>
          {inp.engineType === 'propeller' ? num('maxPowerKw', 'Max power (total)', 'kW') : num('maxThrustKn', 'Max thrust (total)', 'kN')}
          {inp.engineType === 'propeller' && num('propEfficiency', 'Prop efficiency η_p')}
          {num('engineStation', 'Engine station', 'm', 1, 'Moving the engine moves the CG (engine mass is part of total mass)')}
          {num('thrustLineZ', 'Thrust line below CG', 'm')}
          {num('engineMass', 'Engine mass', 'kg')}
        </div>
      </section>

      <section className="group">
        <h3>Environmental state</h3>
        <div className="grid2">
          {num('speedKts', 'Speed', 'kts')}
          {num('altitudeFt', 'Altitude', 'ft')}
          {num('flightPathDeg', 'Flight path γ₀', '°')}
          {num('limitLoadFactor', 'Limit n', 'g')}
          {num('fuselageLength', 'Fuselage length', 'm')}
        </div>
      </section>
    </aside>
  );
}
