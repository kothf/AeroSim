import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS, analyze, geometry, macLeadingEdge, AircraftInputs } from '..';

const run = (patch: Partial<AircraftInputs> = {}) => {
  const out = analyze({ ...DEFAULT_INPUTS, ...patch });
  if (!out.ok) throw new Error(out.error);
  return out.result;
};

describe('trapezoidal wing geometry', () => {
  it('rectangular wing keeps MAC = S/b at the quarter span', () => {
    const g = geometry(DEFAULT_INPUTS);
    expect(g.mac).toBeCloseTo(DEFAULT_INPUTS.wingArea / g.span, 12);
    expect(g.rootChord).toBeCloseTo(g.mac, 12);
    expect(g.tipChord).toBeCloseTo(g.mac, 12);
    expect(g.yMac).toBeCloseTo(g.span / 4, 12);
  });

  it('tapered wing: chords integrate to S, MAC and y_MAC match the closed forms', () => {
    const inp = { ...DEFAULT_INPUTS, taperRatio: 0.5, sweepDeg: 20 };
    const g = geometry(inp);
    expect(((g.rootChord + g.tipChord) / 2) * g.span).toBeCloseTo(inp.wingArea, 10);
    // numerical MAC = (2/S) ∫0^{b/2} c(y)^2 dy, y_mac = (2/S) ∫ c y dy
    const N = 4000, hb = g.span / 2;
    let i2 = 0, iy = 0;
    for (let k = 0; k < N; k++) {
      const y = ((k + 0.5) / N) * hb;
      const c = g.rootChord + (g.tipChord - g.rootChord) * (y / hb);
      i2 += c * c * (hb / N);
      iy += c * y * (hb / N);
    }
    expect(g.mac).toBeCloseTo((2 / inp.wingArea) * i2, 6);
    expect(g.yMac).toBeCloseTo((2 / inp.wingArea) * iy, 6);
    // quarter-chord line keeps the input sweep
    const tipLe = hb * Math.tan(g.sweepLE);
    const dx = tipLe + 0.25 * g.tipChord - 0.25 * g.rootChord;
    expect(Math.atan2(dx, hb) * 180 / Math.PI).toBeCloseTo(20, 8);
    expect(macLeadingEdge(inp, g)).toBeCloseTo(g.macLe, 12);
  });

  it('default rectangular configuration results are unchanged by the taper input', () => {
    const r = run();
    expect(r.geometry.macLe).toBeCloseTo(DEFAULT_INPUTS.wingStation, 12);
  });
});

describe('aerodynamic centre and centre of pressure', () => {
  it('aircraft AC is the neutral point and wing-body AC includes the body shift', () => {
    const r = run();
    expect(r.points.acAircraft).toBe(r.stat.xnp);
    expect(r.points.acWingBody).toBeCloseTo(DEFAULT_INPUTS.xacWing + DEFAULT_INPUTS.fuselageXacShift, 12);
  });

  it('wing CP lies aft of the AC for a cambered wing (c_m,ac < 0) and satisfies x_cp = x_ac − c_m,ac/C_Lw', () => {
    const r = run();
    const { cpWing, CLwTrim } = r.points;
    expect(r.aero.wing.cmC4).toBeLessThan(0);
    expect(cpWing).not.toBeNull();
    expect(cpWing!).toBeGreaterThan(r.points.acWing);
    // moment about the CP is zero: c_m,ac + C_Lw (x_cp - x_ac) = 0
    expect(r.aero.wing.cmC4 + CLwTrim * (cpWing! - r.points.acWing)).toBeCloseTo(0, 12);
  });

  it('symmetric wing section: CP coincides with the AC', () => {
    const r = run({ wingNaca: '0012' });
    expect(r.points.cpWing!).toBeCloseTo(r.points.acWing, 10);
  });

  it('aircraft CP is at the CG with the thrust line through the CG, and aft of it with a nose-up thrust moment', () => {
    const r0 = run({ thrustLineZ: 0 });
    expect(r0.points.cpAircraft!).toBeCloseTo(r0.inputs.xcg, 12);
    const r1 = run({ thrustLineZ: 0.3 });
    expect(r1.aero.CmT).toBeGreaterThan(0);
    expect(r1.points.cpAircraft!).toBeGreaterThan(r1.inputs.xcg);
  });

  it('overall length covers the fuselage and the tail', () => {
    const r = run();
    expect(r.points.overallLength).toBeGreaterThanOrEqual(DEFAULT_INPUTS.fuselageLength);
    expect(r.points.overallLength).toBeGreaterThanOrEqual(r.points.stations.tailTe);
    const long = run({ tailArm: 8, tailVolume: 1.0 });
    expect(long.points.overallLength).toBeCloseTo(long.points.stations.tailTe, 12);
  });
});
