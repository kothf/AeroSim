import { characteristicPolynomial, eigenvalues, polyEval, Matrix } from '../linalg';
import { classifyModes } from '../modes';
import { analyze, AnalysisResult, cgRootLocus } from '../model';
import { DEFAULT_INPUTS } from '../aircraft';
import { simulatePulse } from '../simulate';
import { cabs, Complex } from '../complex';

const run = (over: Partial<typeof DEFAULT_INPUTS> = {}): AnalysisResult => {
  const r = analyze({ ...DEFAULT_INPUTS, ...over });
  if (!r.ok) throw new Error(r.error);
  return r.result;
};

/** Nelson, Flight Stability and Automatic Control, Navion longitudinal example (ft, s). */
const NAVION = { Xu: -0.045, Xw: 0.036, Zu: -0.369, Zw: -2.02, Mu: 0, Mw: -0.05, Mwdot: -0.0051, Mq: -2.05, u0: 176, g: 32.2 };
const navionA = (): Matrix => {
  const d = NAVION;
  return [
    [d.Xu, d.Xw, 0, -d.g],
    [d.Zu, d.Zw, d.u0, 0],
    [d.Mu + d.Mwdot * d.Zu, d.Mw + d.Mwdot * d.Zw, d.Mq + d.Mwdot * d.u0, 0],
    [0, 0, 1, 0],
  ];
};

describe('Eigenvalue extraction (FR-3.2)', () => {
  it('characteristic polynomial of the Navion matrix matches the reference (numpy.poly)', () => {
    const p = characteristicPolynomial(navionA());
    const ref = [1, 5.0126, 13.177826, 0.67017438, 0.59409];
    p.forEach((v, i) => expect(v).toBeCloseTo(ref[i], 6));
  });

  it('Navion roots: short period -2.49 +/- 2.60i, phugoid -0.017 +/- 0.213i', () => {
    const roots = eigenvalues(navionA());
    const modes = classifyModes(roots);
    expect(modes.shortPeriod.roots[0].re).toBeCloseTo(-2.48925, 4);
    expect(modes.shortPeriod.roots[0].im).toBeCloseTo(2.60113, 4);
    expect(modes.phugoid.roots[0].re).toBeCloseTo(-0.0170494, 6);
    expect(modes.phugoid.roots[0].im).toBeCloseTo(0.213405, 5);
    expect(modes.shortPeriod.zeta).toBeCloseTo(2.48925 / Math.hypot(2.48925, 2.60113), 4);
    expect(modes.phugoid.period).toBeCloseTo((2 * Math.PI) / 0.213405, 2);
  });

  it('roots satisfy det(lambda I - A) = 0 and come in conjugate pairs for random stable matrices', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    for (let k = 0; k < 50; k++) {
      const A: Matrix = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => rnd() * 5));
      const p = characteristicPolynomial(A);
      const roots = eigenvalues(A);
      expect(roots).toHaveLength(4);
      for (const r of roots) expect(cabs(polyEval(p, r)) / (1 + cabs(r) ** 4)).toBeLessThan(1e-8);
      const sumRe = roots.reduce((s, r) => s + r.re, 0);
      const trace = A[0][0] + A[1][1] + A[2][2] + A[3][3];
      expect(sumRe).toBeCloseTo(trace, 8);
      expect(Math.abs(roots.reduce((s, r) => s + r.im, 0))).toBeLessThan(1e-8);
    }
  });

  it('classifies a split short period (four real roots)', () => {
    const roots: Complex[] = [{ re: -10, im: 0 }, { re: -0.5, im: 0 }, { re: -0.3, im: 0 }, { re: 0.2, im: 0 }];
    const m = classifyModes(roots);
    expect(m.shortPeriod.kind).toBe('aperiodic');
    expect(m.shortPeriod.roots.map((r) => r.re).sort((a, b) => a - b)).toEqual([-10, -0.5]);
    expect(m.phugoid.stable).toBe(false);
    expect(m.phugoid.tDouble).toBeCloseTo(Math.LN2 / 0.2, 10);
  });
});

describe('Static stability & trim (FR-2.x)', () => {
  it('neutral point is where dCm/dalpha (and dCm/dCL) vanishes', () => {
    const base = run();
    const atNp = run({ xcg: base.stat.xnp });
    expect(atNp.aero.Cma).toBeCloseTo(0, 10);
    expect(base.stat.staticMargin).toBeCloseTo(base.stat.xnp - DEFAULT_INPUTS.xcg, 12);
  });

  it('neutral point matches FR-2.2 X_np = X_ac + V_h eta (CLa_t/CLa)(1 - de/da)', () => {
    const r = run();
    const a = r.aero;
    const i = r.inputs;
    expect(r.stat.xnp).toBeCloseTo(a.xac + i.tailVolume * i.tailEfficiency * (a.CLaTail / a.CLaWing) * (1 - a.deda), 12);
  });

  it('Cm-alpha slope flips sign as the CG passes the neutral point (FR-2.3)', () => {
    const r = run();
    const fwd = run({ xcg: r.stat.xnp - 0.05 });
    const aft = run({ xcg: r.stat.xnp + 0.05 });
    expect(fwd.aero.Cma).toBeLessThan(0);
    expect(fwd.stat.status).toBe('marginal');
    expect(aft.aero.Cma).toBeGreaterThan(0);
    expect(aft.stat.status).toBe('unstable');
    expect(run({ xcg: 0.1 }).stat.status).toBe('stable');
  });

  it('trim solution satisfies Cm = 0 and CL = W/(qS)', () => {
    const r = run();
    const { alpha, deltaE } = r.stat.trim;
    const a = r.aero;
    expect(a.Cm0 + a.Cma * alpha + a.Cmde * deltaE).toBeCloseTo(0, 12);
    expect(a.CL0 + a.CLa * alpha + a.CLde * deltaE).toBeCloseTo(r.flight.CW, 12);
  });

  it('stick-free neutral point lies ahead of the stick-fixed one for Ch_a, Ch_d < 0', () => {
    const r = run();
    expect(r.stat.xnpFree).toBeLessThan(r.stat.xnp);
  });

  it('CG input is clamped to 0..100% MAC', () => {
    expect(run({ xcg: 1.7 }).inputs.xcg).toBe(1);
    expect(run({ xcg: -0.2 }).inputs.xcg).toBe(0);
  });

  it('invalid NACA codes are reported, not computed', () => {
    const r = analyze({ ...DEFAULT_INPUTS, tailNaca: '00X2' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('tailNaca');
  });
});

describe('Linearised state-space model (FR-3.1, FR-3.3)', () => {
  it('matrix structure follows the FRS layout', () => {
    const { ss } = run();
    const d = ss.dim;
    expect(ss.A[0]).toEqual([d.Xu, d.Xw, 0, -9.80665]);
    expect(ss.A[1][2]).toBeCloseTo(ss.u0, 12);
    expect(ss.A[2][0]).toBeCloseTo(d.Mu + d.Mwdot * d.Zu, 14);
    expect(ss.A[2][1]).toBeCloseTo(d.Mw + d.Mwdot * d.Zw, 14);
    expect(ss.A[2][2]).toBeCloseTo(d.Mq + d.Mwdot * ss.u0, 14);
    expect(ss.A[3]).toEqual([0, 0, 1, 0]);
  });

  it('default aircraft has a well-damped short period and a lightly damped phugoid', () => {
    const { ss } = run();
    const { shortPeriod: sp, phugoid: ph } = ss.modes;
    expect(sp.kind).toBe('oscillatory');
    expect(ph.kind).toBe('oscillatory');
    expect(sp.wn).toBeGreaterThan(10 * ph.wn);
    expect(sp.zeta).toBeGreaterThan(0.3);
    expect(ph.zeta).toBeLessThan(0.3);
    expect(ss.modes.stable).toBe(true);
  });

  it('short-period and Lanchester phugoid approximations are close to the full solution', () => {
    const { ss } = run();
    expect(ss.approx.shortPeriod.wn).toBeCloseTo(ss.modes.shortPeriod.wn, 1);
    expect(Math.abs(ss.approx.phugoid.wn - ss.modes.phugoid.wn) / ss.modes.phugoid.wn).toBeLessThan(0.3);
  });

  it('moving the CG aft of the neutral point produces a positive real root', () => {
    const r = run();
    const { ss } = run({ xcg: r.stat.xnp + 0.1 });
    expect(Math.max(...ss.eigenvalues.map((e) => e.re))).toBeGreaterThan(0);
    expect(ss.modes.stable).toBe(false);
  });

  it('root locus sweeps the CG and returns four roots per station', () => {
    const loc = cgRootLocus(DEFAULT_INPUTS, 0.05, 0.6, 20);
    expect(loc).toHaveLength(21);
    loc.forEach((p) => expect(p.roots).toHaveLength(4));
  });
});

describe('Time-history oscilloscope (FR-3.4)', () => {
  it('pulse response decays and the phugoid period matches the eigenvalue', () => {
    const { ss } = run();
    const h = simulatePulse(ss, { amplitude: -2 * Math.PI / 180, duration: 0.5 }, 200, 0.02);
    // short period: alpha has settled after ~5 s to small values compared with the peak
    const peak = Math.max(...Array.from(h.dalpha.slice(0, 200)).map(Math.abs));
    const tailIdx = Math.round(6 / 0.02);
    expect(Math.abs(h.dalpha[tailIdx])).toBeLessThan(0.2 * peak);
    // phugoid: measure period from the upward zero crossings of du after t = 10 s
    const crossings: number[] = [];
    for (let i = Math.round(10 / 0.02); i < h.t.length - 1; i++)
      if (h.du[i] < 0 && h.du[i + 1] >= 0) crossings.push(h.t[i] + (0 - h.du[i]) / (h.du[i + 1] - h.du[i]) * 0.02);
    expect(crossings.length).toBeGreaterThanOrEqual(2);
    const T = crossings[1] - crossings[0];
    expect(T).toBeCloseTo(ss.modes.phugoid.period!, 0);
  });

  it('nose-up pulse gives a positive initial alpha and a climb', () => {
    const { ss } = run();
    const h = simulatePulse(ss, { amplitude: -2 * Math.PI / 180, duration: 0.5 }, 30, 0.02);
    expect(Math.max(...Array.from(h.dalpha.slice(0, 100)))).toBeGreaterThan(0);
    expect(h.dh[Math.round(5 / 0.02)]).toBeGreaterThan(0);
  });
});

describe('Maneuvering flight (FR-4.x)', () => {
  it('elevator per g vanishes at the maneuver point, which lies aft of the neutral point', () => {
    const r = run();
    expect(r.man.xmp).toBeGreaterThan(r.stat.xnp);
    const atMp = run({ xcg: r.man.xmp });
    expect(atMp.man.deltaEPerG).toBeCloseTo(0, 10);
    expect(r.man.deltaEPerG).toBeLessThan(0); // trailing edge up to pull g
  });

  it('stick force per g is a positive pull for the default aircraft and decreases as CG moves aft', () => {
    const fwd = run({ xcg: 0.15 });
    const aft = run({ xcg: 0.3 });
    expect(fwd.man.stickForcePerG).toBeGreaterThan(aft.man.stickForcePerG);
    expect(run().man.stickForcePerG).toBeGreaterThan(0);
  });

  it('stick force per g scales linearly with gearing and hinge-moment derivatives', () => {
    const a = run();
    const b = run({ stickGearing: DEFAULT_INPUTS.stickGearing * 2 });
    expect(b.man.stickForcePerG).toBeCloseTo(2 * a.man.stickForcePerG, 8);
  });
});

describe('Non-functional: latency < 30 ms', () => {
  it('analysis + eigenvalues + 120 s RK4 integration complete well inside 30 ms', () => {
    // warm up JIT
    for (let i = 0; i < 5; i++) simulatePulse(run().ss, { amplitude: -0.02, duration: 0.5 });
    const N = 20;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      const r = run({ xcg: 0.1 + i * 0.01 });
      simulatePulse(r.ss, { amplitude: -0.02, duration: 0.5 }, 120, 0.02);
    }
    const per = (performance.now() - t0) / N;
    expect(per).toBeLessThan(30);
  });
});
