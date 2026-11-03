import { useMemo, useState } from 'react';
import type { Complex } from '../engine';
import { fmt, linear, niceDomain, ticks } from './scale';
import { useSize } from './useSize';

interface Props {
  roots: Complex[];
  spRoots: Complex[];
  locus: { xcg: number; roots: Complex[] }[];
  xnp: number;
  onPickCg?: (xcg: number) => void;
  zoom: 'all' | 'phugoid';
}

const M = { l: 54, r: 14, t: 12, b: 38 };

export function SPlane({ roots, spRoots, locus, xnp, onPickCg, zoom }: Props) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<{ x: number; y: number; text: string[] } | null>(null);
  const width = Math.max(size.width, 220);
  const height = 320;
  const [xd, yd] = useMemo(() => {
    const all = (zoom === 'phugoid'
      ? roots.filter((r) => !spRoots.includes(r))
      : roots.concat(locus.flatMap((l) => l.roots))
    ).filter((r) => Number.isFinite(r.re));
    const pad = (a: number, b: number) => [a - 0.08 * (b - a || 1), b + 0.08 * (b - a || 1)] as const;
    const rx = pad(Math.min(0, ...all.map((r) => r.re)), Math.max(0, ...all.map((r) => r.re)));
    const im = Math.max(0.05, ...all.map((r) => Math.abs(r.im))) * 1.15;
    return [niceDomain(rx[0], rx[1], 6), niceDomain(-im, im, 6)];
  }, [roots, spRoots, locus, zoom]);
  const X = linear(xd[0], xd[1], M.l, width - M.r);
  const Y = linear(yd[0], yd[1], height - M.b, M.t);
  const inside = (r: Complex) => r.re >= xd[0] && r.re <= xd[1] && r.im >= yd[0] && r.im <= yd[1];
  const locusColor = (xcg: number) => (xcg > xnp ? 'var(--critical)' : 'var(--seq)');

  return (
    <figure className="chart" aria-label="s-plane poles">
      <figcaption className="chart-head">
        <span className="chart-title">s-plane: longitudinal poles {zoom === 'phugoid' ? '(phugoid zoom)' : ''}</span>
        <span className="legend">
          <span className="legend-item"><svg width="12" height="12" aria-hidden><path d="M2 2L10 10M10 2L2 10" stroke="var(--s1)" strokeWidth="2.2" /></svg>Short period</span>
          <span className="legend-item"><svg width="12" height="12" aria-hidden><path d="M2 2L10 10M10 2L2 10" stroke="var(--s2)" strokeWidth="2.2" /></svg>Phugoid</span>
          {zoom === 'all' && <span className="legend-item"><svg width="12" height="12" aria-hidden><circle cx="6" cy="6" r="3" fill="var(--seq)" /></svg>CG locus (stable)</span>}
          {zoom === 'all' && <span className="legend-item"><svg width="12" height="12" aria-hidden><circle cx="6" cy="6" r="3" fill="var(--critical)" /></svg>CG aft of NP</span>}
        </span>
      </figcaption>
      <div ref={ref} className="chart-body" style={{ height }}>
        <svg width={width} height={height} role="img" aria-label="s-plane pole map">
          <rect x={X(0)} y={M.t} width={Math.max(0, width - M.r - X(0))} height={height - M.t - M.b} className="unstable-half" />
          {ticks(yd[0], yd[1], 6).map((v) => (
            <g key={`y${v}`}>
              <line x1={M.l} x2={width - M.r} y1={Y(v)} y2={Y(v)} className={v === 0 ? 'axis-zero' : 'grid'} />
              <text x={M.l - 6} y={Y(v)} className="tick" textAnchor="end" dominantBaseline="middle">{fmt(v)}</text>
            </g>
          ))}
          {ticks(xd[0], xd[1], 6).map((v) => (
            <g key={`x${v}`}>
              <line y1={M.t} y2={height - M.b} x1={X(v)} x2={X(v)} className={v === 0 ? 'axis-zero' : 'grid'} />
              <text x={X(v)} y={height - M.b + 14} className="tick" textAnchor="middle">{fmt(v)}</text>
            </g>
          ))}
          <text x={width - M.r - 4} y={M.t + 12} className="ref-label" textAnchor="end">unstable</text>
          <text x={(M.l + width - M.r) / 2} y={height - 4} className="axis-label" textAnchor="middle">Real axis n [1/s]</text>
          <text transform={`translate(12 ${(M.t + height - M.b) / 2}) rotate(-90)`} className="axis-label" textAnchor="middle">Imag axis ω [rad/s]</text>
          {zoom === 'all' && locus.map((l) =>
            l.roots.filter(inside).map((r, i) => (
              <circle key={`${l.xcg}-${i}`} cx={X(r.re)} cy={Y(r.im)} r={3} fill={locusColor(l.xcg)} opacity={0.55}
                className="locus-pt"
                onPointerEnter={() => setHover({ x: X(r.re), y: Y(r.im), text: [`CG ${(l.xcg * 100).toFixed(1)}% MAC`, `λ = ${fmt(r.re)} ${r.im >= 0 ? '+' : '−'} ${fmt(Math.abs(r.im))}i`, 'click to set CG'] })}
                onPointerLeave={() => setHover(null)}
                onClick={() => onPickCg?.(l.xcg)} />
            )),
          )}
          {roots.filter(inside).map((r, i) => {
            const sp = spRoots.includes(r);
            const s = 7;
            const wn = Math.hypot(r.re, r.im);
            return (
              <g key={i} onPointerEnter={() => setHover({ x: X(r.re), y: Y(r.im), text: [sp ? 'Short period' : 'Phugoid', `λ = ${fmt(r.re)} ${r.im >= 0 ? '+' : '−'} ${fmt(Math.abs(r.im))}i`, `ωn = ${fmt(wn)} rad/s, ζ = ${fmt(-r.re / wn)}`] })}
                onPointerLeave={() => setHover(null)}>
                <circle cx={X(r.re)} cy={Y(r.im)} r={11} fill="transparent" />
                <path d={`M${X(r.re) - s},${Y(r.im) - s}L${X(r.re) + s},${Y(r.im) + s}M${X(r.re) + s},${Y(r.im) - s}L${X(r.re) - s},${Y(r.im) + s}`}
                  stroke="var(--surface)" strokeWidth={5} strokeLinecap="round" />
                <path d={`M${X(r.re) - s},${Y(r.im) - s}L${X(r.re) + s},${Y(r.im) + s}M${X(r.re) + s},${Y(r.im) - s}L${X(r.re) - s},${Y(r.im) + s}`}
                  stroke={sp ? 'var(--s1)' : 'var(--s2)'} strokeWidth={2.4} strokeLinecap="round" />
              </g>
            );
          })}
        </svg>
        {hover && (
          <div className="tooltip" style={{ left: Math.min(hover.x + 12, width - 200), top: Math.max(hover.y - 60, 0) }}>
            {hover.text.map((t, i) => <div key={i} className={i === 0 ? 'tt-head' : 'tt-row'}>{t}</div>)}
          </div>
        )}
      </div>
    </figure>
  );
}
