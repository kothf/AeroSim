import { describe, expect, it } from 'vitest';
import {
  AircraftInputs, DEFAULT_INPUTS, DEG, ELEVATOR_UP_LIMIT, G0, KT_TO_MS, N_TO_LBF, analyze, applyMassBreakdown, capLevel,
  minManeuverForce, phugoidLevel, solve2, spDampingLevel, stickForcePerGBand, stickForcePerGLevel,
} from '..';
import type { AnalysisResult } from '..';

const run = (over: Partial<AircraftInputs> = {}): AnalysisResult => {
  const r = analyze(applyMassBreakdown({ ...DEFAULT_INPUTS, ...over }));
  if (!r.ok) throw new Error(r.error);
  return r.result;
};
const manual = (over: Partial<AircraftInputs> = {}) => run({ massMode: 'manual', ...over });
const LBF = 1 / N_TO_LBF;

/** The v0.5 default aircraft, whose controls were too light (see the engineering review). */
const OLD_DEFAULT: Partial<AircraftInputs> = {
  wingNaca: '4415', wingIncidenceDeg: 0, stickGearing: 2, chDelta: -0.32, downSpringN: 0, maxPowerKw: 310, speedKts: 180,
};

describe('MIL-F-8785C / 14 CFR 23 criteria', () => {
  it('stick force per g band follows table V for a centre stick', () => {
    // n_L = 3.8, n/alpha = 37.8 g/rad: min 21/2.8 = 7.5 lbf/g, max 240/37.8 = 6.3 -> raised to 56/2.8 = 20 lbf/g
    const b = stickForcePerGBand(3.8, 37.8);
    expect(b.min).toBeCloseTo(7.5 * LBF, 6);
    expect(b.max).toBeCloseTo(20 * LBF, 6);
    // high limit load factor: the 3 lbf/g floor and 28 lbf/g cap apply
    const f = stickForcePerGBand(9, 5);
    expect(f.min).toBeCloseTo(3 * LBF, 6);
    expect(f.max).toBeCloseTo(28 * LBF, 6);
    // 14 N/g = 3.1 lbf/g is below the Level 1 (7.5), Level 2 (6.4) and Level 3 (4.3 lbf/g) minima
    expect(stickForcePerGLevel(14, 3.8, 37.8)).toBe(4);
    expect(stickForcePerGLevel(30, 3.8, 37.8)).toBe(2);
    expect(stickForcePerGLevel(50, 3.8, 37.8)).toBe(1);
  });

  it('short-period damping, CAP and phugoid levels', () => {
    expect(spDampingLevel(0.7, 'A')).toBe(1);
    expect(spDampingLevel(0.3, 'A')).toBe(2);
    expect(spDampingLevel(0.3, 'B')).toBe(1);
    expect(spDampingLevel(0.1, 'C')).toBe(4);
    expect(capLevel(1.5, 'B')).toBe(1);
    expect(capLevel(0.2, 'A')).toBe(2);
    expect(capLevel(20, 'A')).toBe(3);
    expect(phugoidLevel(true, true, 0.05, null)).toBe(1);
    expect(phugoidLevel(true, true, 0.02, null)).toBe(2);
    expect(phugoidLevel(false, true, -0.01, 80)).toBe(3);
    expect(phugoidLevel(false, false, NaN, 11)).toBe(4);
  });

  it('23.155 minimum force is W/140 bounded by 15 and 35 lbf', () => {
    expect(minManeuverForce(1150 * G0)).toBeCloseTo(((1150 * G0 * N_TO_LBF) / 140) * LBF, 6);
    expect(minManeuverForce(500 * G0)).toBeCloseTo(15 * LBF, 6);
    expect(minManeuverForce(5000 * G0)).toBeCloseTo(35 * LBF, 6);
  });
});

describe('Handling qualities of the default aircraft', () => {
  it('meets Level 1 and the 14 CFR 23 force checks across its loading range', () => {
    const loads = [
      DEFAULT_INPUTS.massItems,
      DEFAULT_INPUTS.massItems.map((m) => (m.id === 'bag' ? { ...m, mass: 80 } : m)),
      DEFAULT_INPUTS.massItems.map((m) => (m.id === 'rear' || m.id === 'bag' ? { ...m, mass: 0 } : m.id === 'fuel' ? { ...m, mass: 20 } : m)),
    ];
    for (const massItems of loads) {
      const r = run({ massItems });
      expect(r.hq.level).toBe(1);
      expect(r.hq.maneuverForce.pass).toBe(true);
      expect(r.hq.speedStability.pass).toBe(true);
      expect(r.man.handling.forceAtLimit).toBeLessThan(r.man.handling.forceLimit);
      expect(r.inputs.xcg).toBeLessThan(r.hq.cgLimits.aft);
    }
  });

  it('cruises with the fuselage about level and well clear of the stall', () => {
    const r = run();
    expect(Math.abs(r.stat.trim.alpha)).toBeLessThan(1 * DEG);
    expect(r.hq.stall.status).toBe('ok');
    expect(r.prop.throttle).toBeLessThan(0.8);
  });

  it('flags the old default: stick far too light and a flat speed gradient', () => {
    const r = run(OLD_DEFAULT);
    expect(r.man.handling.status).toBe('too-light');
    expect(r.hq.stickForcePerG.level).toBeGreaterThan(1);
    expect(r.hq.maneuverForce.pass).toBe(false);
    expect(r.hq.speedStability.pass).toBe(false);
    expect(r.hq.speedStability.value).toBeGreaterThan(0); // stable, just too shallow
  });
});

describe('CG envelope and maneuver points', () => {
  it('stick force per g vanishes at the stick-free maneuver point, which lies between the free NP and the fixed MP', () => {
    const r = manual();
    const x = r.hq.xmpFree!;
    expect(manual({ xcg: x }).man.stickForcePerG).toBeCloseTo(0, 6);
    expect(x).toBeGreaterThan(r.stat.xnpFree);
    expect(x).toBeLessThan(r.man.xmp);
  });

  it('the force-based aft limit is where the stick force per g reaches the Level 1 minimum', () => {
    const r = manual();
    const x = r.hq.cgLimits.aftForce!;
    expect(manual({ xcg: x }).man.stickForcePerG).toBeCloseTo(r.hq.stickForcePerG.min, 4);
    expect(r.hq.cgLimits.aft).toBeCloseTo(Math.min(r.stat.xnpFree - 0.05, x), 12);
  });

  it('at the forward limit, trimming at C_L,max takes full up elevator', () => {
    const r = manual({ clMax: 2.2 });
    const x = r.hq.cgLimits.forward!;
    expect(x).toBeGreaterThan(0);
    const a = manual({ clMax: 2.2, xcg: x }).aero;
    const de = solve2(a.CLa, a.CLde, a.Cma, a.Cmde, 2.2 - a.CL0, -a.Cm0Aero)[1];
    expect(de).toBeCloseTo(ELEVATOR_UP_LIMIT, 6);
    // more C_L,max (flaps) pushes the forward limit aft
    expect(x).toBeGreaterThan(manual({ clMax: 1.8 }).hq.cgLimits.forward ?? -Infinity);
  });
});

describe('Speed stability, down-spring, wing incidence, stall and polar', () => {
  it('a down-spring steepens the stick-force/speed gradient by about 2F/V0 and does not change the force per g', () => {
    const a = run({ downSpringN: 0 });
    const b = run({ downSpringN: 40 });
    const expected = ((2 * 40) / a.flight.u0) * KT_TO_MS;
    expect(b.hq.speedStability.value - a.hq.speedStability.value).toBeCloseTo(expected, 2);
    expect(b.man.stickForcePerG).toBeCloseTo(a.man.stickForcePerG, 10);
  });

  it('the speed gradient grows with stick gearing and with the stick-free margin', () => {
    const base = manual({ downSpringN: 0 });
    expect(manual({ downSpringN: 0, stickGearing: DEFAULT_INPUTS.stickGearing * 2 }).hq.speedStability.value).toBeCloseTo(2 * base.hq.speedStability.value, 6);
    expect(manual({ downSpringN: 0, xcg: 0.15 }).hq.speedStability.value).toBeGreaterThan(base.hq.speedStability.value);
  });

  it('wing incidence lowers the fuselage trim angle and leaves the wing lift and stability unchanged', () => {
    const a = manual({ wingIncidenceDeg: 0 });
    const b = manual({ wingIncidenceDeg: 2 });
    expect(b.points.CLwTrim).toBeCloseTo(a.points.CLwTrim, 2);
    expect((a.stat.trim.alpha - b.stat.trim.alpha) / DEG).toBeGreaterThan(1.6);
    expect((a.stat.trim.alpha - b.stat.trim.alpha) / DEG).toBeLessThan(2.1);
    expect(b.stat.xnp).toBeCloseTo(a.stat.xnp, 12);
    expect(b.aero.Cma).toBeCloseTo(a.aero.Cma, 12);
  });

  it('stall speed and the stall warning', () => {
    const r = run();
    const W = r.flight.weight;
    expect(r.hq.stall.vStall).toBeCloseTo(Math.sqrt((2 * W) / (r.flight.atm.density * r.inputs.wingArea * r.inputs.clMax)), 8);
    expect(run({ speedKts: r.hq.stall.vStall / KT_TO_MS * 1.2 }).hq.stall.status).toBe('low-margin');
    expect(run({ speedKts: 50, clMax: 1.2 }).hq.stall.status).toBe('stalled');
  });

  it('L/D at the best-L/D speed equals (L/D)max', () => {
    const r = run();
    const p = r.hq.performance;
    expect(p.LDmax).toBeCloseTo(0.5 * Math.sqrt((Math.PI * r.inputs.oswald * r.inputs.aspectRatio) / r.inputs.cd0), 10);
    const atBest = run({ speedKts: p.vBestLD / KT_TO_MS });
    expect(atBest.hq.performance.LD).toBeCloseTo(p.LDmax, 6);
    expect(p.vMinPower).toBeCloseTo(p.vBestLD / Math.pow(3, 0.25), 8);
  });
});
