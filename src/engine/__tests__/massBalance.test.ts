import { describe, expect, it } from 'vitest';
import { AircraftInputs, DEFAULT_INPUTS, analyze, applyMassBreakdown, geometry, itemPosFromStation, itemStation, massProperties } from '..';

const comp = (patch: Partial<AircraftInputs> = {}): AircraftInputs => ({ ...DEFAULT_INPUTS, massMode: 'components', ...patch });

describe('mass & balance from components', () => {
  it('default breakdown sums to the default aircraft (1150 kg, CG near 24% MAC)', () => {
    const mp = massProperties(comp());
    expect(mp.mass).toBeCloseTo(1150, 9);
    expect(mp.xcg).toBeGreaterThan(0.2);
    expect(mp.xcg).toBeLessThan(0.28);
    expect(mp.iyy).toBeGreaterThan(1500);
    expect(mp.iyy).toBeLessThan(4000);
  });

  it('CG is the mass-weighted mean of the stations and heights', () => {
    const mp = massProperties(comp());
    const m = mp.rows.reduce((s, r) => s + r.mass, 0);
    expect(mp.station).toBeCloseTo(mp.rows.reduce((s, r) => s + r.mass * r.station, 0) / m, 12);
    expect(mp.z).toBeCloseTo(mp.rows.reduce((s, r) => s + r.mass * r.z, 0) / m, 12);
  });

  it('adding a mass moves the CG by Δm (x − x_cg) / (m + Δm)', () => {
    const base = massProperties(comp());
    const inp = comp({ massItems: [...DEFAULT_INPUTS.massItems, { id: 'b', name: 'Ballast', mass: 50, ref: 'nose', pos: 6, z: 0 }] });
    const mp = massProperties(inp);
    expect(mp.station - base.station).toBeCloseTo((50 * (6 - base.station)) / (base.mass + 50), 10);
  });

  it('moving the engine 1 m aft moves the CG by m_e / m metres', () => {
    const a = massProperties(comp());
    const b = massProperties(comp({ engineStation: DEFAULT_INPUTS.engineStation + 1 }));
    expect(b.station - a.station).toBeCloseTo(DEFAULT_INPUTS.engineMass / a.mass, 12);
  });

  it('wing items move with the wing, fuselage items do not', () => {
    const a = massProperties(comp());
    const b = massProperties(comp({ wingStation: DEFAULT_INPUTS.wingStation + 0.3 }));
    const row = (mp: typeof a, id: string) => mp.rows.find((r) => r.id === id)!.station;
    expect(row(b, 'wing') - row(a, 'wing')).toBeCloseTo(0.3, 12);
    expect(row(b, 'front')).toBeCloseTo(row(a, 'front'), 12);
    // tail is fixed to the tail arm (wing AC + l_t), so it moves with the wing at constant l_t
    expect(row(b, 'tail') - row(a, 'tail')).toBeCloseTo(0.3, 12);
  });

  it('station ⇄ reference position round-trips for every reference', () => {
    const inp = comp();
    const geo = geometry(inp);
    for (const ref of ['nose', 'fuselage', 'mac', 'tail'] as const) {
      const it = { id: 'x', name: 'x', mass: 1, ref, pos: 0, z: 0 };
      const pos = itemPosFromStation(it, 3.3, inp, geo);
      expect(itemStation({ ...it, pos }, inp, geo)).toBeCloseTo(3.3, 12);
    }
  });

  it('engine installation height: thrust offset from the CG = z_engine − z_cg, and the engine mass lifts the CG', () => {
    const lo = massProperties(comp({ thrustLineZ: 0.4 }));
    const hi = massProperties(comp({ thrustLineZ: -0.4 }));
    expect(lo.thrustLineBelowCg).toBeCloseTo(0.4 - lo.z, 12);
    expect(lo.z - hi.z).toBeCloseTo((0.8 * DEFAULT_INPUTS.engineMass) / lo.mass, 12);
    // lower thrust line → nose-up thrust moment
    const rl = analyze(applyMassBreakdown(comp({ thrustLineZ: 0.4 })));
    const rh = analyze(applyMassBreakdown(comp({ thrustLineZ: -0.4 })));
    if (!rl.ok || !rh.ok) throw new Error('analysis failed');
    expect(rl.result.aero.CmT).toBeGreaterThan(0);
    expect(rh.result.aero.CmT).toBeLessThan(0);
  });

  it('manual mode leaves the inputs untouched', () => {
    const inp = { ...DEFAULT_INPUTS, massMode: 'manual' as const };
    expect(applyMassBreakdown(inp)).toBe(inp);
  });
});
