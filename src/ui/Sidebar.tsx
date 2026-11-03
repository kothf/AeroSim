import { AircraftInputs, INPUT_BOUNDS, MassProperties } from '../engine';
import { MassTable } from './MassTable';
import { Hint, NacaField, NumberField, Slider } from './Fields';
import { PARAM_INFO } from './params';

interface Props {
  inp: AircraftInputs;
  set: (patch: Partial<AircraftInputs>) => void;
  onReset: () => void;
  /** computed mass properties (components mode) */
  mp: MassProperties | null;
}

const b = (k: keyof AircraftInputs) => INPUT_BOUNDS[k] as [number, number];

export function Sidebar({ inp, set, onReset, mp }: Props) {
  const num = (k: keyof typeof PARAM_INFO, over?: { label: string; hint: string }) => {
    const info = PARAM_INFO[k];
    return (
      <NumberField key={k} label={over?.label ?? info.label} unit={info.unit} hint={over?.hint ?? info.hint} slider={info.slider}
        value={Number((inp[k] as number).toPrecision(6))}
        min={b(k)[0]} max={b(k)[1]}
        onChange={(v) => set({ [k]: v } as Partial<AircraftInputs>)} />
    );
  };
  return (
    <aside className="sidebar" aria-label="Design parameters">
      <div className="side-head">
        <h2>Design params</h2>
        <button className="btn ghost" onClick={onReset}>Reset</button>
      </div>

      <section className="group">
        <h3>Mass &amp; balance</h3>
        <label className="field">
          <span className="field-label">CG source<Hint text="From components: the CG (position and height), total mass and I_yy are computed from the mass and position of each component, so moving the wing, tail or engine moves the CG. Manual: type the CG, mass and I_yy in directly." /></span>
          <select value={inp.massMode} onChange={(e) => set({ massMode: e.target.value as AircraftInputs['massMode'] })}>
            <option value="components">From components (mass &amp; balance)</option>
            <option value="manual">Manual CG, mass, I_yy</option>
          </select>
        </label>
        {mp ? (
          <MassTable inp={inp} mp={mp} set={set} />
        ) : (
          <>
            <Slider label="CG position" hint={PARAM_INFO.xcg.hint} value={inp.xcg * 100} min={0} max={100} step={0.5}
              format={(v) => `${v.toFixed(1)}% MAC`} onChange={(v) => set({ xcg: v / 100 })} />
            <div className="params">
              {num('mass')}
              {num('iyy')}
            </div>
          </>
        )}
      </section>

      <section className="group">
        <h3>Fuselage &amp; layout</h3>
        <div className="params">
          {num('fuselageLength')}
          {num('fuselageDiameter')}
          {num('wingStation')}
        </div>
      </section>

      <section className="group">
        <h3>Main wing profile</h3>
        <NacaField label="Wing section" hint="NACA 4-digit (e.g. 4415: 4% camber at 40% chord, 15% thick) or 5-digit (e.g. 23012) code. Thin airfoil theory gives the zero-lift angle α₀ and the moment c_m,c/4 from the camber line." value={inp.wingNaca} onChange={(v) => set({ wingNaca: v })} />
        <div className="params">
          {num('aspectRatio')}
          {num('sweepDeg')}
          {num('taperRatio')}
          {num('wingArea')}
          {num('xacWing')}
          {num('fuselageXacShift')}
          {num('cd0')}
          {num('oswald')}
        </div>
        <label className="field">
          <span className="field-label">3D lift-slope method<Hint text="Lifting line: C_Lα = c_lα cosΛ/(1 + c_lα cosΛ/(π AR)) as in FRS 1.3. DATCOM (Helmbold–Diederich) is more accurate for low AR and swept wings." /></span>
          <select value={inp.liftSlopeMethod} onChange={(e) => set({ liftSlopeMethod: e.target.value as AircraftInputs['liftSlopeMethod'] })}>
            <option value="lifting-line">Lifting line (FRS 1.3)</option>
            <option value="datcom">DATCOM / Helmbold</option>
          </select>
        </label>
      </section>

      <section className="group">
        <h3>Tail plane profile</h3>
        <NacaField label="Tail section" hint="NACA code of the horizontal tail section. Symmetric sections (00xx) have α₀ = 0." value={inp.tailNaca} onChange={(v) => set({ tailNaca: v })} />
        <div className="params">
          {num('tailVolume')}
          {num('tailArm')}
          {num('tailAspectRatio')}
          {num('tailEfficiency')}
          {num('tailIncidenceDeg')}
          {num('elevatorChordRatio')}
        </div>
      </section>

      <section className="group">
        <h3>Hinge moments &amp; controls</h3>
        <div className="params">
          {num('ch0')}
          {num('chAlpha')}
          {num('chDelta')}
          {num('stickGearing')}
        </div>
      </section>

      <section className="group">
        <h3>Powerplant</h3>
        <div className="params">
          <label className="field">
            <span className="field-label">Engine type<Hint text="Propeller: constant power, thrust falls as 1/V (adds speed damping, X_u = −3qSC_D/(m u₀)). Jet: constant thrust (X_u = −2qSC_D/(m u₀))." /></span>
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
            ? num('thrustLineZ', { label: 'Thrust line below ref. line', hint: `Engine installation height: thrust line (and engine CG) below the fuselage reference line, positive down. The model uses its offset from the computed CG, z_T = z_engine − z_cg = ${mp.thrustLineBelowCg.toFixed(3)} m. Thrust below the CG gives a nose-up moment C_m,T = T z_T/(q S c̄) and, for a propeller, M_u = z_T dT/du / I_yy (more phugoid damping). The engine mass also raises or lowers the CG.` })
            : num('thrustLineZ')}
          {num('engineMass')}
        </div>
      </section>

      <section className="group">
        <h3>Environmental state</h3>
        <div className="params">
          {num('speedKts')}
          {num('altitudeFt')}
          {num('flightPathDeg')}
          {num('limitLoadFactor')}
        </div>
      </section>
    </aside>
  );
}
