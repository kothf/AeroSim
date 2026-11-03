import { analyze } from '../model';
import { DEFAULT_INPUTS, AircraftInputs } from '../aircraft';
import { dragAt, thrustAvailableAt } from '../propulsion';
import { isa } from '../atmosphere';
import { moveEngine, moveWing, cgStation } from '../installation';

const run = (over: Partial<AircraftInputs> = {}) => {
  const r = analyze({ ...DEFAULT_INPUTS, ...over });
  if (!r.ok) throw new Error(r.error);
  return r.result;
};

describe('Powerplant', () => {
  it('level flight: thrust required equals drag, throttle = T_req / T_avail', () => {
    const r = run();
    const p = r.prop;
    const q = r.flight.qbar;
    const CD = DEFAULT_INPUTS.cd0 + r.flight.CW ** 2 / (Math.PI * DEFAULT_INPUTS.oswald * DEFAULT_INPUTS.aspectRatio);
    expect(p.thrustRequired).toBeCloseTo(q * DEFAULT_INPUTS.wingArea * CD, 6);
    expect(p.throttle).toBeCloseTo(p.thrustRequired / p.thrustAvailable, 12);
    expect(p.throttle).toBeGreaterThan(0.3);
    expect(p.throttle).toBeLessThan(1);
  });

  it('V_max is where full-throttle thrust equals drag, and lies above the cruise speed', () => {
    const r = run();
    const v = r.prop.vMax!;
    const atm = isa(r.flight.atm.altitude);
    const T = thrustAvailableAt(r.inputs, atm.density / 1.225, v);
    expect(T).toBeCloseTo(dragAt(r.inputs, atm.density, v), 0);
    expect(v).toBeGreaterThan(r.flight.u0);
  });

  it('constant-power propeller gives X_u = -3 qS C_D/(m u0); constant-thrust jet gives -2 qS C_D/(m u0)', () => {
    for (const engineType of ['propeller', 'jet'] as const) {
      const r = run({ engineType });
      const CD = r.prop.drag / (r.flight.qbar * r.inputs.wingArea);
      const k = engineType === 'propeller' ? 3 : 2;
      expect(r.ss.dim.Xu).toBeCloseTo((-k * r.flight.qbar * r.inputs.wingArea * CD) / (r.inputs.mass * r.flight.u0), 10);
    }
  });

  it('thrust line below the CG adds a nose-up moment, so less nose-up elevator is needed', () => {
    const below = run({ thrustLineZ: 0.4 });
    const none = run({ thrustLineZ: 0 });
    expect(below.aero.CmT).toBeGreaterThan(0);
    expect(none.aero.CmT).toBe(0);
    expect(below.stat.trim.deltaE).toBeGreaterThan(none.stat.trim.deltaE);
    // thrust line does not move the stick-fixed neutral point in this model
    expect(below.stat.xnp).toBeCloseTo(none.stat.xnp, 12);
    // and it couples speed into pitch through M_u
    expect(below.ss.dim.Mu).toBeLessThan(0);
  });

  it('higher altitude reduces available power (Gagg-Ferrar lapse)', () => {
    expect(run({ altitudeFt: 15000 }).prop.lapse).toBeLessThan(run({ altitudeFt: 0 }).prop.lapse);
  });
});

describe('Installation moves from the schematic', () => {
  it('moving the engine aft by dx shifts the CG aft by m_e dx / m', () => {
    const r = run();
    const patch = moveEngine(r.inputs, r.geometry, r.inputs.engineStation + 1);
    const after = { ...r.inputs, ...patch };
    expect(cgStation(after, r.geometry) - cgStation(r.inputs, r.geometry)).toBeCloseTo(r.inputs.engineMass / r.inputs.mass, 10);
    // moving it back restores I_yy (parallel-axis bookkeeping is reversible)
    const back = moveEngine(after, r.geometry, r.inputs.engineStation);
    expect(back.iyy!).toBeCloseTo(r.inputs.iyy, 6);
    expect(back.xcg!).toBeCloseTo(r.inputs.xcg, 10);
  });

  it('moving the wing aft keeps the CG in the airframe: x_cg/MAC decreases and the tail arm shortens', () => {
    const r = run();
    const patch = moveWing(r.inputs, r.geometry, r.inputs.wingStation + 0.2);
    expect(patch.xcg!).toBeCloseTo(r.inputs.xcg - 0.2 / r.geometry.mac, 10);
    expect(patch.tailArm!).toBeCloseTo(r.inputs.tailArm - 0.2, 10);
    const after = run(patch);
    expect(cgStation(after.inputs, after.geometry)).toBeCloseTo(cgStation(r.inputs, r.geometry), 10);
    expect(after.stat.staticMargin).toBeGreaterThan(r.stat.staticMargin - 0.2); // sanity
  });

  it('the wing stops when the fixed CG reaches its leading edge instead of dragging the CG along', () => {
    const r = run();
    const patch = moveWing(r.inputs, r.geometry, r.inputs.wingStation + 5);
    expect(patch.xcg!).toBeCloseTo(0, 12);
    expect(patch.wingStation!).toBeCloseTo(r.inputs.wingStation + r.inputs.xcg * r.geometry.mac, 12);
    const after = run(patch);
    expect(cgStation(after.inputs, after.geometry)).toBeCloseTo(cgStation(r.inputs, r.geometry), 10);
  });
});
