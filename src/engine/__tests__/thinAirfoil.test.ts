import { parseNaca } from '../naca';
import { solveThinAirfoil, flapEffectiveness } from '../thinAirfoil';
import { liftSlope3D, downwashGradient } from '../wing';

const DEG = Math.PI / 180;
const solve = (code: string) => {
  const r = parseNaca(code);
  if (!r.ok) throw new Error(r.error);
  return solveThinAirfoil(r.profile);
};

/** Closed-form thin-airfoil results for a NACA 4-digit camber line (Anderson, Fundamentals of Aerodynamics). */
function analytic4(m: number, p: number) {
  const thp = Math.acos(1 - 2 * p);
  const s = Math.sin(thp), c = Math.cos(thp);
  const k1 = m / (p * p), k2 = m / ((1 - p) * (1 - p));
  // dyc/dx = k*(2p - 1 + cos th) on each branch
  const I = (k: number, a: number, b: number, fn: (th: number) => number) => k * (fn(b) - fn(a));
  // int (2p-1+cos)(cos-1) dth
  const F0 = (th: number) => (2 * p - 1) * (Math.sin(th) - th) + (th / 2 + Math.sin(2 * th) / 4) - Math.sin(th);
  const F1 = (th: number) => (2 * p - 1) * Math.sin(th) + th / 2 + Math.sin(2 * th) / 4;
  const F2 = (th: number) => (2 * p - 1) * Math.sin(2 * th) / 2 + Math.sin(th) / 2 + Math.sin(3 * th) / 6;
  const alpha0 = -(I(k1, 0, thp, F0) + I(k2, thp, Math.PI, F0)) / Math.PI;
  const A1 = (2 / Math.PI) * (I(k1, 0, thp, F1) + I(k2, thp, Math.PI, F1));
  const A2 = (2 / Math.PI) * (I(k1, 0, thp, F2) + I(k2, thp, Math.PI, F2));
  void s; void c;
  return { alpha0, A1, A2, cm: (Math.PI / 4) * (A2 - A1) };
}

describe('Thin airfoil theory solver (FR-1.2)', () => {
  it('symmetric NACA 0012: alpha_0 = 0, c_m,c/4 = 0, c_l_alpha = 2 pi', () => {
    const s = solve('0012');
    expect(s.alpha0).toBeCloseTo(0, 12);
    expect(s.cmC4).toBeCloseTo(0, 12);
    expect(s.clAlpha).toBeCloseTo(2 * Math.PI, 12);
  });

  it('NACA 2412 reproduces the textbook values alpha_0 = -2.08 deg, c_m,c/4 = -0.053', () => {
    const s = solve('2412');
    expect(s.alpha0 / DEG).toBeCloseTo(-2.08, 2);
    expect(s.cmC4).toBeCloseTo(-0.053, 3);
  });

  it.each([['2412'], ['4415'], ['6409'], ['1408'], ['4412']])('NACA %s matches the closed-form integrals', (code) => {
    const r = parseNaca(code);
    if (!r.ok || r.profile.series !== 4) throw new Error();
    const s = solveThinAirfoil(r.profile);
    const a = analytic4(r.profile.m, r.profile.p);
    expect(s.alpha0).toBeCloseTo(a.alpha0, 8);
    expect(s.A1).toBeCloseTo(a.A1, 8);
    expect(s.A2).toBeCloseTo(a.A2, 8);
    expect(s.cmC4).toBeCloseTo(a.cm, 8);
  });

  it('alpha_0 from FR-1.2 equals -(A0 + A1/2) identity of the Fourier series', () => {
    // C_l = pi (2 A0 + A1) = 0  ->  alpha_0 = alpha_ideal - A1/2
    for (const code of ['2412', '4415', '23012', '23112']) {
      const s = solve(code);
      expect(s.alpha0).toBeCloseTo(s.alphaIdeal - s.A1 / 2, 8);
    }
  });

  it('NACA 4415 (default wing) gives alpha_0 ~ -4.2 deg and c_m ~ -0.10', () => {
    const s = solve('4415');
    expect(s.alpha0 / DEG).toBeGreaterThan(-4.5);
    expect(s.alpha0 / DEG).toBeLessThan(-3.9);
    expect(s.cmC4).toBeCloseTo(-0.105, 2);
  });

  it('NACA 23012: small nose-down moment and alpha_0 near -1.1 deg', () => {
    const s = solve('23012');
    expect(s.alpha0 / DEG).toBeGreaterThan(-1.4);
    expect(s.alpha0 / DEG).toBeLessThan(-0.9);
    expect(s.cmC4).toBeLessThan(0);
    expect(s.cmC4).toBeGreaterThan(-0.02);
  });

  it('reflexed 23112 has less nose-down moment than 23012', () => {
    expect(solve('23112').cmC4).toBeGreaterThan(solve('23012').cmC4);
  });

  it('plain flap effectiveness: tau(0)=0, tau(1)=1, tau(0.25) ~ 0.6', () => {
    expect(flapEffectiveness(0)).toBeCloseTo(0, 10);
    expect(flapEffectiveness(1)).toBeCloseTo(1, 10);
    expect(flapEffectiveness(0.25)).toBeCloseTo(0.6, 1);
  });
});

describe('3D finite wing correction (FR-1.3)', () => {
  it('matches C_La = c_la / (1 + c_la/(pi AR)) for an unswept wing at M = 0', () => {
    const a0 = 2 * Math.PI;
    for (const AR of [4, 6, 9.5, 12]) expect(liftSlope3D(a0, AR)).toBeCloseTo(a0 / (1 + a0 / (Math.PI * AR)), 12);
    expect(liftSlope3D(a0, 9.5)).toBeCloseTo(5.1905, 3);
  });
  it('sweep and lower aspect ratio both reduce the lift slope; DATCOM agrees within 3% when unswept', () => {
    const a0 = 2 * Math.PI;
    expect(liftSlope3D(a0, 9.5, 30 * DEG)).toBeLessThan(liftSlope3D(a0, 9.5));
    expect(liftSlope3D(a0, 6)).toBeLessThan(liftSlope3D(a0, 9.5));
    expect(liftSlope3D(a0, 9.5, 30 * DEG, 0, 'datcom')).toBeLessThan(liftSlope3D(a0, 9.5, 0, 0, 'datcom'));
    const ll = liftSlope3D(a0, 9.5), dc = liftSlope3D(a0, 9.5, 0, 0, 'datcom');
    expect(Math.abs(ll - dc) / ll).toBeLessThan(0.03);
  });
  it('downwash gradient 2 C_La / (pi AR)', () => {
    expect(downwashGradient(5, 9.5)).toBeCloseTo(10 / (Math.PI * 9.5), 12);
  });
});
