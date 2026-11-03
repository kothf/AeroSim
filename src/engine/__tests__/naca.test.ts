import { parseNaca, camber, camberSlope } from '../naca';

describe('NACA strict parser (input sanitation)', () => {
  it.each(['0012', '2412', '4415', '23012', '23112', '44012', 'NACA 2412', ' 0009 '])('accepts %s', (code) => {
    expect(parseNaca(code).ok).toBe(true);
  });
  it.each([
    ['', 'empty'],
    ['241', 'three digits'],
    ['241200', 'six digits'],
    ['24a2', 'letters'],
    ['2400', 'zero thickness'],
    ['2012', 'camber with p = 0'],
    ['0412', 'symmetric with p != 0'],
    ['23212', 'Q = 2'],
    ['26012', '5-digit P = 6'],
    ['21112', 'reflex P = 1 not tabulated'],
    ['03012', 'L = 0'],
    ['-2412', 'sign'],
    ['24.12', 'decimal'],
  ])('rejects %s (%s)', (code) => {
    expect(parseNaca(code).ok).toBe(false);
  });

  it('decodes 4-digit parameters', () => {
    const r = parseNaca('4415');
    expect(r.ok && r.profile.series === 4 && r.profile).toMatchObject({ m: 0.04, p: 0.4, t: 0.15 });
  });

  it('4-digit camber line peaks at (p, m) with zero slope there and is continuous', () => {
    const r = parseNaca('4415');
    if (!r.ok) throw new Error();
    expect(camber(r.profile, 0.4)).toBeCloseTo(0.04, 12);
    expect(camberSlope(r.profile, 0.4)).toBeCloseTo(0, 12);
    expect(camber(r.profile, 0)).toBeCloseTo(0, 12);
    expect(camber(r.profile, 1)).toBeCloseTo(0, 12);
  });

  it('5-digit 230xx camber line is continuous at r and closes at both ends', () => {
    const r = parseNaca('23012');
    if (!r.ok || r.profile.series !== 5) throw new Error();
    const { r: rr } = r.profile;
    expect(camber(r.profile, rr - 1e-9)).toBeCloseTo(camber(r.profile, rr + 1e-9), 8);
    expect(camber(r.profile, 1)).toBeCloseTo(0, 12);
    // design-lift scaling: max camber about 1.8% for 230xx
    let max = 0;
    for (let x = 0; x <= 1; x += 0.001) max = Math.max(max, camber(r.profile, x));
    expect(max).toBeGreaterThan(0.016);
    expect(max).toBeLessThan(0.02);
  });

  it('reflexed 5-digit camber line closes at the trailing edge', () => {
    const r = parseNaca('23112');
    if (!r.ok) throw new Error();
    expect(camber(r.profile, 1)).toBeCloseTo(0, 10);
    expect(camber(r.profile, 0)).toBeCloseTo(0, 10);
  });
});
