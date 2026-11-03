/**
 * Validation against published reference data (textbooks, standards, NACA reports).
 * Each block cites its source; see docs/physics-validation.md for the discussion.
 */
import { isa, DEG, G0 } from '../atmosphere';
import { parseNaca } from '../naca';
import { solveThinAirfoil, flapEffectiveness } from '../thinAirfoil';
import { liftSlope3D } from '../wing';
import { analyze, stateSpace, AeroDerivatives, FlightState, Geometry, AnalysisResult } from '../model';
import { DEFAULT_INPUTS, AircraftInputs } from '../aircraft';
import { classifyModes } from '../modes';
import { simulatePulse, augmentedSystem } from '../simulate';
import { staticThrust, propDiameter, thrustAvailableAt, PROP_FIGURE_OF_MERIT } from '../propulsion';
import { Matrix, matmul } from '../linalg';
import { cabs } from '../complex';

const FT = 0.3048;
const run = (over: Partial<AircraftInputs> = {}): AnalysisResult => {
  const r = analyze({ ...DEFAULT_INPUTS, ...over });
  if (!r.ok) throw new Error(r.error);
  return r.result;
};
const section = (code: string) => {
  const r = parseNaca(code);
  if (!r.ok) throw new Error(r.error);
  return solveThinAirfoil(r.profile);
};
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('ISA vs U.S. Standard Atmosphere 1976 tables', () => {
  it.each([
    // h [m], T [K], p [Pa], rho [kg/m^3]
    [0, 288.15, 101325, 1.225],
    [1524, 278.244, 84307, 1.0555],
    [3000, 268.65, 70108, 0.90925],
    [11000, 216.65, 22632, 0.36392],
  ])('h = %d m', (h, T, p, rho) => {
    const a = isa(h);
    expect(a.temperature).toBeCloseTo(T, 2);
    expect(rel(a.pressure, p)).toBeLessThan(2e-4);
    expect(rel(a.density, rho)).toBeLessThan(3e-4);
  });
});

describe('Thin airfoil theory vs Abbott & von Doenhoff (Theory of Wing Sections) and Anderson', () => {
  it('NACA 230 camber line: ideal lift coefficient pi*A1 = 0.30 (the value the mean line was designed for)', () => {
    // At the ideal angle A0 = 0, so c_l,i = pi (2 A0 + A1) = pi A1 (Abbott & von Doenhoff sec. 4.5, 6.4)
    expect(Math.PI * section('23012').A1).toBeCloseTo(0.3, 2);
    expect(Math.PI * section('23112').A1).toBeCloseTo(0.3, 2);
    expect(Math.PI * section('43012').A1).toBeCloseTo(0.6, 2); // linear scaling with L
  });

  it('reflexed 23112 mean line has nearly zero c_m,c/4 (its design purpose)', () => {
    expect(Math.abs(section('23112').cmC4)).toBeLessThan(0.005);
  });

  it.each([
    // Abbott & von Doenhoff Appendix IV wind-tunnel data, Re ~ 6e6 (alpha_L0 [deg], c_m,c/4)
    ['2412', -2.1, -0.047],
    ['4412', -4.0, -0.095],
    ['23012', -1.2, -0.012],
  ])('NACA %s agrees with experiment within the usual thin-airfoil accuracy', (code, a0, cm) => {
    const s = section(code);
    expect(Math.abs(s.alpha0 / DEG - a0)).toBeLessThan(0.4); // deg
    expect(Math.abs(s.cmC4 - cm)).toBeLessThan(0.015);
    expect(Math.abs(s.cmC4)).toBeGreaterThanOrEqual(Math.abs(cm) * 0.9); // theory over-predicts |c_m| (viscous decambering)
  });

  it('NACA 4412 closed-form result alpha_L0 = -4.15 deg, c_m,c/4 = -0.106 (Anderson, Fundamentals of Aerodynamics, ch. 4 problems)', () => {
    const s = section('4412');
    expect(s.alpha0 / DEG).toBeCloseTo(-4.15, 1);
    expect(s.cmC4).toBeCloseTo(-0.106, 3);
  });

  it('plain-flap effectiveness equals an independent thin-airfoil integration of a hinged flat plate', () => {
    // dz/dx = -delta aft of the hinge; alpha_L0 = -(1/pi) int (dz/dx)(cos th - 1) dth
    for (const cf of [0.1, 0.2, 0.3, 0.5]) {
      const thh = Math.acos(1 - 2 * (1 - cf));
      const N = 2000;
      let I = 0;
      for (let i = 0; i < N; i++) {
        const th = thh + ((i + 0.5) * (Math.PI - thh)) / N;
        I += (-1 * (Math.cos(th) - 1) * (Math.PI - thh)) / N;
      }
      const tau = (1 / Math.PI) * I; // -d alpha_L0 / d delta
      expect(flapEffectiveness(cf)).toBeCloseTo(tau, 6);
    }
    // Lift increment form, Glauert / Anderson: dCl/ddelta = 2(pi - th_h) + 2 sin th_h = 2 pi tau
    const thh = Math.acos(1 - 2 * 0.7);
    expect(2 * Math.PI * flapEffectiveness(0.3)).toBeCloseTo(2 * (Math.PI - thh) + 2 * Math.sin(thh), 12);
  });
});

describe('Finite-wing lift slope', () => {
  it('Prandtl lifting line, elliptic wing: a = a0/(1 + a0/(pi AR)) -> AR 6: 4.712 /rad (Anderson eq. 5.69)', () => {
    expect(liftSlope3D(2 * Math.PI, 6)).toBeCloseTo(4.7124, 3);
  });
  it('Helmbold / DATCOM 1.2.2.1 (Raymer eq. 12.6): AR 6 unswept M 0 -> 4.529 /rad; M 0.6 -> 5.236 /rad', () => {
    expect(liftSlope3D(2 * Math.PI, 6, 0, 0, 'datcom')).toBeCloseTo(4.5289, 3);
    expect(liftSlope3D(2 * Math.PI, 6, 0, 0.6, 'datcom')).toBeCloseTo(5.2360, 3);
  });
  it('DATCOM tends to the slender-wing limit pi AR / 2 as AR -> 0 (Jones)', () => {
    const AR = 0.05;
    expect(rel(liftSlope3D(2 * Math.PI, AR, 0, 0, 'datcom'), (Math.PI * AR) / 2)).toBeLessThan(0.01);
  });
});

/**
 * Nelson, Flight Stability and Automatic Control (2nd ed.), Navion: Appendix B data and the
 * dimensional derivatives / roots of the longitudinal example in ch. 4.
 * u0 = 176 ft/s, sea level, W = 2750 lb, S = 184 ft^2, c = 5.7 ft, b = 33.4 ft, Iy = 3000 slug ft^2.
 */
describe('Navion: stability-derivative chain vs Nelson', () => {
  const S = 184 * FT * FT;
  const c = 5.7 * FT;
  const AR = 33.4 ** 2 / 184;
  const m = (2750 * 4.448222) / G0;
  const Iy = 3000 * 14.593903 * FT * FT;
  const u0 = 176 * FT;
  const CL = 0.41, CD = 0.05, CLa = 4.44, CDa = 0.33;
  const k = CDa / (2 * CL * CLa);
  const inp: AircraftInputs = {
    ...DEFAULT_INPUTS, wingArea: S, aspectRatio: AR, mass: m, iyy: Iy,
    oswald: 1 / (Math.PI * k * AR), cd0: CD - k * CL * CL, thrustLineZ: 0, flightPathDeg: 0,
  };
  const a = { CLa, Cma: -0.683, Cmadot: -4.36, Cmq: -9.96, CLde: 0.355, Cmde: -0.923 } as AeroDerivatives;
  const f = { u0, qbar: 0.5 * 1.225 * u0 * u0, mach: 0 } as FlightState; // Nelson takes C_Lu = 0
  const geo = { mac: c } as Geometry;
  const ss = stateSpace(inp, a, f, geo, CL, 0);

  it.each([
    // name, Nelson value (ft, s units), conversion factor ft-units -> SI
    ['Xu', -0.045, 1], ['Xw', 0.036, 1], ['Zu', -0.369, 1], ['Zw', -2.02, 1],
    ['Mw', -0.05, 1 / FT], ['Mwdot', -0.0051, 1 / FT], ['Mq', -2.05, 1],
    ['Zde', -28.17, FT], ['Mde', -11.88, 1],
  ] as const)('%s = %f', (name, ref, conv) => {
    expect(rel(ss.dim[name], ref * conv)).toBeLessThan(0.03);
  });

  it('full 4x4 roots: short period -2.51 +/- 2.59i, phugoid -0.017 +/- 0.213i', () => {
    const { shortPeriod: sp, phugoid: ph } = classifyModes(ss.eigenvalues);
    expect(rel(sp.roots[0].re, -2.51)).toBeLessThan(0.03);
    expect(rel(sp.roots[0].im, 2.59)).toBeLessThan(0.03);
    expect(Math.abs(ph.roots[0].re - -0.017)).toBeLessThan(0.002);
    expect(rel(ph.roots[0].im, 0.213)).toBeLessThan(0.03);
  });

  it('short-period approximation is within 5% of the full solution, Lanchester phugoid within 25%', () => {
    const modes = classifyModes(ss.eigenvalues);
    expect(rel(ss.approx.shortPeriod.wn, modes.shortPeriod.wn)).toBeLessThan(0.05);
    expect(rel(ss.approx.phugoid.wn, modes.phugoid.wn)).toBeLessThan(0.25);
  });
});

describe('Static and maneuver stability identities', () => {
  it('Lanchester phugoid (constant thrust): wn = sqrt(2) g/u0, zeta = C_D / (sqrt(2) C_L) (Nelson ch. 4, Etkin & Reid ch. 6)', () => {
    const r = run({ engineType: 'jet', speedKts: 250 });
    const CD = r.prop.drag / (r.flight.qbar * r.inputs.wingArea);
    // compressibility adds C_Lu = M^2/(1-M^2) C_L (Nelson ch. 3), so wn^2 = (g/u0)^2 (2 + M^2/(1-M^2))
    const M2 = r.flight.mach ** 2;
    const wn = (G0 / r.flight.u0) * Math.sqrt(2 + M2 / (1 - M2));
    expect(r.ss.approx.phugoid.wn).toBeCloseTo(wn, 10);
    expect(run({ engineType: 'jet', speedKts: 40, altitudeFt: 0 }).ss.approx.phugoid.wn * (40 * 0.514444) / G0).toBeCloseTo(Math.SQRT2, 2);
    expect(r.ss.approx.phugoid.zeta).toBeCloseTo((CD / r.flight.CW) * ((G0 / r.flight.u0) / wn), 10); // = C_D/(sqrt2 C_L) when M -> 0
  });

  it('stick-fixed maneuver point: h_m - h_n = -C_mq / (2 mu), mu = 2m/(rho S c) (Etkin & Reid, Dynamics of Flight)', () => {
    const r = run();
    const mu = (2 * r.inputs.mass) / (r.flight.atm.density * r.inputs.wingArea * r.geometry.mac);
    // the engine normalises C_m alpha by the wing lift slope, which brings the factor CLa / CLa_w
    const expected = -(r.aero.CLa / r.aero.CLaWing) * (r.aero.Cmq / (2 * mu));
    expect(r.man.xmp - r.stat.xnp).toBeCloseTo(expected, 10);
  });

  it("stick-free neutral point: h_n' = h_ac + V_H eta (a_t/a_w)(1 - de/da)(1 - tau C_ha/C_hd) (Nelson ch. 2, stick-free stability)", () => {
    const r = run();
    const i = r.inputs, a = r.aero;
    const expected = a.xac + i.tailVolume * i.tailEfficiency * (a.CLaTail / a.CLaWing) * (1 - a.deda) * (1 - (a.tau * i.chAlpha) / i.chDelta);
    expect(r.stat.xnpFree).toBeCloseTo(expected, 12);
  });

  it('pitch damping C_mq = -2 eta a_t V_H l_t/c (x1.1 fuselage) and C_m alpha-dot = C_mq-tail * de/da (Nelson ch. 3)', () => {
    const r = run();
    const i = r.inputs, a = r.aero;
    const tail = -2 * i.tailEfficiency * a.CLaTail * i.tailVolume * (i.tailArm / r.geometry.mac);
    expect(a.Cmq).toBeCloseTo(1.1 * tail, 12);
    expect(a.Cmadot).toBeCloseTo(tail * a.deda, 12);
  });
});

describe('State matrix in climbing flight (theta0 != 0)', () => {
  it('equals E^-1 A_bar from the implicit form with M_wdot on the left-hand side (Etkin & Reid)', () => {
    const r = run({ flightPathDeg: 8 });
    const d = r.ss.dim, u0 = r.ss.u0, th = r.ss.theta0, g = G0;
    // E xdot = A_bar x, row 3 of E carries -M_wdot on w_dot
    const Abar: Matrix = [
      [d.Xu, d.Xw, 0, -g * Math.cos(th)],
      [d.Zu, d.Zw, u0, -g * Math.sin(th)],
      [d.Mu, d.Mw, d.Mq, 0],
      [0, 0, 1, 0],
    ];
    const Einv: Matrix = [[1, 0, 0, 0], [0, 1, 0, 0], [0, d.Mwdot, 1, 0], [0, 0, 0, 1]];
    const A = matmul(Einv, Abar);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) expect(r.ss.A[i][j]).toBeCloseTo(A[i][j], 12);
    expect(r.ss.A[2][3]).not.toBe(0);
  });
});

describe('Propeller static thrust (actuator-disk momentum theory, McCormick)', () => {
  it('satisfies FM P = T^(3/2)/sqrt(2 rho A) per engine', () => {
    for (const engineCount of [1, 2]) {
      const inp = { ...DEFAULT_INPUTS, engineCount, maxPowerKw: 400 };
      const T = staticThrust(inp, 1) / engineCount;
      const D = propDiameter(inp);
      const A = (Math.PI * D * D) / 4;
      expect(Math.pow(T, 1.5) / Math.sqrt(2 * 1.225 * A)).toBeCloseTo((PROP_FIGURE_OF_MERIT * 400e3) / engineCount, 4);
    }
  });

  it('gives 20-35 N/kW for 100-300 kW piston singles (typical light-aircraft static thrust)', () => {
    for (const kw of [100, 150, 230, 300]) {
      const nPerKw = staticThrust({ ...DEFAULT_INPUTS, maxPowerKw: kw, engineCount: 1 }, 1) / kw;
      expect(nPerKw).toBeGreaterThan(20);
      expect(nPerKw).toBeLessThan(35);
    }
  });

  it('the cap only acts near stall speed: at 70 kt full-throttle thrust is eta_p P / V', () => {
    const inp = { ...DEFAULT_INPUTS, maxPowerKw: 120 };
    const V = 70 * 0.514444;
    expect(thrustAvailableAt(inp, 1, V)).toBeCloseTo((inp.propEfficiency * 120e3) / V, 6);
  });
});

describe('Time integration', () => {
  /** Independent fine-step classical RK4 reference of the same augmented system. */
  function rk4Reference(r: AnalysisResult, amp: number, t0: number, dur: number, tEnd: number, h: number) {
    const { F, G } = augmentedSystem(r.ss);
    const de = (t: number) => (t >= t0 - 1e-12 && t < t0 + dur - 1e-12 ? amp : 0);
    // edges lie on the step grid, so the input is held at its step-start value across all four stages
    const f = (y: number[], u: number) => F.map((row, i) => row.reduce((s, v, j) => s + v * y[j], 0) + G[i] * u);
    let y = [0, 0, 0, 0, 0];
    const N = Math.round(tEnd / h);
    for (let n = 0; n < N; n++) {
      const u = de(n * h);
      const k1 = f(y, u);
      const k2 = f(y.map((v, j) => v + 0.5 * h * k1[j]), u);
      const k3 = f(y.map((v, j) => v + 0.5 * h * k2[j]), u);
      const k4 = f(y.map((v, j) => v + h * k3[j]), u);
      y = y.map((v, j) => v + (h / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    }
    return y;
  }

  it('exact ZOH propagation matches a fine-step RK4 reference', () => {
    const r = run({ flightPathDeg: 5 });
    const h = simulatePulse(r.ss, { amplitude: -0.03, duration: 0.5, start: 0.5 }, 20, 0.02);
    const y = rk4Reference(r, -0.03, 0.5, 0.5, 20, 0.0005);
    const last = h.t.length - 1;
    const got = [h.du[last], h.dw[last], h.dq[last], h.dtheta[last], h.dh[last]];
    got.forEach((v, j) => expect(Math.abs(v - y[j])).toBeLessThan(1e-6 * (1 + Math.abs(y[j]))));
  });

  it('pulse edges that fall between samples are honoured exactly (result independent of dt)', () => {
    const r = run();
    const p = { amplitude: -0.03, duration: 0.33, start: 0.47 };
    const a = simulatePulse(r.ss, p, 10, 0.05);
    const b = simulatePulse(r.ss, p, 10, 0.01);
    expect(a.dq[a.t.length - 1]).toBeCloseTo(b.dq[b.t.length - 1], 9);
  });

  it('stiff but stable corner of the input space (tiny I_yy) stays finite and decays', () => {
    const r = run({ iyy: 10 });
    expect(Math.max(...r.ss.eigenvalues.map(cabs)) * 0.02).toBeGreaterThan(2.8); // beyond fixed-step RK4 stability
    const h = simulatePulse(r.ss, { amplitude: -0.02, duration: 0.5 }, 120, 0.02);
    const last = h.t.length - 1;
    expect(Number.isFinite(h.dq[last])).toBe(true);
    expect(Math.abs(h.du[last])).toBeLessThan(1);
  });
});
