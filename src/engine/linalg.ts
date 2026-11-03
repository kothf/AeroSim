/**
 * Small dense linear algebra for the longitudinal state-space model:
 * characteristic polynomial (Faddeev-LeVerrier) and polynomial roots
 * (Durand-Kerner/Weierstrass iteration, then Newton polishing).
 */
import { Complex, c, cabs, cadd, cdiv, cmul, csub } from './complex';

export type Matrix = number[][];

export function matmul(A: Matrix, B: Matrix): Matrix {
  const n = A.length;
  const m = B[0].length;
  const k = B.length;
  const C: Matrix = Array.from({ length: n }, () => new Array(m).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    let s = 0;
    for (let l = 0; l < k; l++) s += A[i][l] * B[l][j];
    C[i][j] = s;
  }
  return C;
}

export function matvec(A: Matrix, x: number[]): number[] {
  return A.map((row) => row.reduce((s, a, j) => s + a * x[j], 0));
}

/** Monic characteristic polynomial coefficients [1, c1, ..., cn] of det(lambda I - A). */
export function characteristicPolynomial(A: Matrix): number[] {
  const n = A.length;
  const coeffs = [1];
  let M: Matrix = A.map((r) => r.map(() => 0)); // M_0 = 0
  for (let k = 1; k <= n; k++) {
    // M_k = A M_{k-1} + c_{n-k+1} I
    const AM = matmul(A, M);
    const ck_prev = coeffs[k - 1];
    M = AM.map((row, i) => row.map((v, j) => v + (i === j ? ck_prev : 0)));
    const AMk = matmul(A, M);
    let tr = 0;
    for (let i = 0; i < n; i++) tr += AMk[i][i];
    coeffs.push(-tr / k);
  }
  return coeffs;
}

export function polyEval(coeffs: number[], z: Complex): Complex {
  let r = c(0);
  for (const a of coeffs) r = cadd(cmul(r, z), c(a));
  return r;
}

function polyDerivEval(coeffs: number[], z: Complex): Complex {
  const n = coeffs.length - 1;
  let r = c(0);
  for (let i = 0; i < n; i++) r = cadd(cmul(r, z), c(coeffs[i] * (n - i)));
  return r;
}

/** All complex roots of a monic real polynomial. */
export function polyRoots(coeffs: number[]): Complex[] {
  const n = coeffs.length - 1;
  if (n < 1) return [];
  const a = coeffs.map((v) => v / coeffs[0]);
  // Cauchy bound for the initial circle radius
  const radius = 1 + Math.max(...a.slice(1).map(Math.abs));
  let z: Complex[] = Array.from({ length: n }, (_, k) => {
    const ang = (2 * Math.PI * k) / n + 0.4;
    return c(radius * 0.5 * Math.cos(ang), radius * 0.5 * Math.sin(ang));
  });
  for (let iter = 0; iter < 500; iter++) {
    let maxStep = 0;
    const next = z.map((zi, i) => {
      let den = c(1);
      for (let j = 0; j < n; j++) if (j !== i) den = cmul(den, csub(zi, z[j]));
      const step = cdiv(polyEval(a, zi), den);
      maxStep = Math.max(maxStep, cabs(step) / Math.max(1, cabs(zi)));
      return csub(zi, step);
    });
    z = next;
    if (maxStep < 1e-14) break;
  }
  // Newton polish
  z = z.map((zi) => {
    let x = zi;
    for (let k = 0; k < 3; k++) {
      const d = polyDerivEval(a, x);
      if (cabs(d) < 1e-300) break;
      x = csub(x, cdiv(polyEval(a, x), d));
    }
    return x;
  });
  // Clean tiny imaginary parts and enforce exact conjugate symmetry
  const scale = Math.max(1e-12, ...z.map(cabs));
  z = z.map((zi) => (Math.abs(zi.im) < 1e-9 * scale ? c(zi.re, 0) : zi));
  return z.sort((p, q) => q.re - p.re || q.im - p.im);
}

export function eigenvalues(A: Matrix): Complex[] {
  return polyRoots(characteristicPolynomial(A));
}

/** Solve a 2x2 linear system. */
export function solve2(a11: number, a12: number, a21: number, a22: number, b1: number, b2: number): [number, number] {
  const det = a11 * a22 - a12 * a21;
  return [(b1 * a22 - a12 * b2) / det, (a11 * b2 - a21 * b1) / det];
}

/**
 * Matrix exponential e^M by scaling and squaring with a truncated Taylor series
 * (Moler & Van Loan, "Nineteen Dubious Ways to Compute the Exponential of a Matrix", SIAM Rev. 2003).
 * The matrix is scaled so that ||M||_inf / 2^s <= 0.5, where an 18-term series is accurate to machine precision.
 */
export function expm(M: Matrix): Matrix {
  const n = M.length;
  const norm = Math.max(...M.map((r) => r.reduce((s, v) => s + Math.abs(v), 0)));
  const s = norm > 0.5 ? Math.ceil(Math.log2(norm / 0.5)) : 0;
  const scale = Math.pow(2, -s);
  const X = M.map((r) => r.map((v) => v * scale));
  const I = (): Matrix => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  let E = I();
  let term = I();
  for (let k = 1; k <= 18; k++) {
    term = matmul(term, X).map((r) => r.map((v) => v / k));
    E = E.map((r, i) => r.map((v, j) => v + term[i][j]));
  }
  for (let k = 0; k < s; k++) E = matmul(E, E);
  return E;
}
