import { useMemo, useState } from 'react';
import { fmt, linear, niceDomain, ticks } from './scale';
import { useSize } from './useSize';

export interface Series {
  id: string;
  label: string;
  color: string;
  points: [number, number][];
  dash?: string;
  width?: number;
  /** do not include in tooltip */
  quiet?: boolean;
}

export interface Band {
  label: string;
  /** polygon points in data space */
  points: [number, number][];
  color: string;
}

export interface Marker {
  x: number;
  y: number;
  label: string;
  color: string;
}

interface Props {
  series: Series[];
  bands?: Band[];
  markers?: Marker[];
  xLabel: string;
  yLabel: string;
  xDomain?: [number, number];
  yDomain?: [number, number];
  /** horizontal reference lines */
  hRefs?: { y: number; label?: string; strong?: boolean }[];
  vRefs?: { x: number; label?: string }[];
  height?: number;
  xUnit?: string;
  yUnit?: string;
  title?: string;
  caption?: React.ReactNode;
  /** fraction of the x-domain to reveal (oscilloscope sweep) */
  reveal?: number;
  ariaLabel: string;
}

const M = { l: 54, r: 14, t: 10, b: 38 };

export function LineChart(p: Props) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const height = p.height ?? 260;
  const width = Math.max(size.width, 200);
  const xd = useMemo<[number, number]>(() => {
    if (p.xDomain) return p.xDomain;
    const xs = p.series.flatMap((s) => s.points.map((q) => q[0]));
    return [Math.min(...xs), Math.max(...xs)];
  }, [p.xDomain, p.series]);
  const yd = useMemo<[number, number]>(() => {
    if (p.yDomain) return p.yDomain;
    const ys = p.series.flatMap((s) => s.points.map((q) => q[1])).concat(p.hRefs?.map((h) => h.y) ?? []);
    const finite = ys.filter(Number.isFinite);
    return niceDomain(Math.min(...finite), Math.max(...finite), 5);
  }, [p.yDomain, p.series, p.hRefs]);
  const X = linear(xd[0], xd[1], M.l, width - M.r);
  const Y = linear(yd[0], yd[1], height - M.b, M.t);
  const xt = ticks(xd[0], xd[1], Math.max(3, Math.floor(width / 90)));
  const yt = ticks(yd[0], yd[1], 5);
  const revealX = p.reveal === undefined ? Infinity : xd[0] + (xd[1] - xd[0]) * p.reveal;
  const clipY = (v: number) => Math.min(Math.max(v, M.t - 2), height - M.b + 2);

  const path = (pts: [number, number][]) => {
    let d = '';
    let pen = false;
    for (const [x, y] of pts) {
      if (x > revealX) break;
      if (!Number.isFinite(y)) { pen = false; continue; }
      d += `${pen ? 'L' : 'M'}${X(x).toFixed(1)},${clipY(Y(y)).toFixed(1)}`;
      pen = true;
    }
    return d;
  };

  const hoverRows =
    hover === null
      ? []
      : p.series
          .filter((s) => !s.quiet && s.points.length)
          .map((s) => {
            // nearest point by x (points sorted by x)
            let lo = 0, hi = s.points.length - 1;
            while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (s.points[mid][0] < hover) lo = mid; else hi = mid; }
            const pt = Math.abs(s.points[lo][0] - hover) < Math.abs(s.points[hi][0] - hover) ? s.points[lo] : s.points[hi];
            return { s, pt };
          })
          .filter((r) => r.pt[0] <= revealX);

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - box.left;
    const x = xd[0] + ((px - M.l) / (width - M.l - M.r)) * (xd[1] - xd[0]);
    setHover(Math.min(Math.max(x, xd[0]), xd[1]));
  };

  const visibleLegend = p.series.filter((s) => !s.quiet);
  return (
    <figure className="chart" aria-label={p.ariaLabel}>
      {(p.title || visibleLegend.length > 1) && (
        <figcaption className="chart-head">
          {p.title && <span className="chart-title">{p.title}</span>}
          {visibleLegend.length > 1 && (
            <span className="legend">
              {visibleLegend.map((s) => (
                <span key={s.id} className="legend-item">
                  <svg width="18" height="8" aria-hidden>
                    <line x1="1" y1="4" x2="17" y2="4" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash} strokeLinecap="round" />
                  </svg>
                  {s.label}
                </span>
              ))}
            </span>
          )}
        </figcaption>
      )}
      <div ref={ref} className="chart-body" style={{ height }}>
        <svg width={width} height={height} role="img" aria-label={p.ariaLabel}>
          <defs>
            <clipPath id={`clip-${p.ariaLabel.replace(/\W/g, '')}`}>
              <rect x={M.l} y={M.t} width={width - M.l - M.r} height={height - M.t - M.b} />
            </clipPath>
          </defs>
          {yt.map((v) => (
            <g key={`y${v}`}>
              <line x1={M.l} x2={width - M.r} y1={Y(v)} y2={Y(v)} className={v === 0 ? 'axis-zero' : 'grid'} />
              <text x={M.l - 6} y={Y(v)} className="tick" textAnchor="end" dominantBaseline="middle">{fmt(v)}</text>
            </g>
          ))}
          {xt.map((v) => (
            <g key={`x${v}`}>
              <line y1={M.t} y2={height - M.b} x1={X(v)} x2={X(v)} className={v === 0 ? 'axis-zero' : 'grid'} />
              <text x={X(v)} y={height - M.b + 14} className="tick" textAnchor="middle">{fmt(v)}</text>
            </g>
          ))}
          <text x={(M.l + width - M.r) / 2} y={height - 4} className="axis-label" textAnchor="middle">{p.xLabel}</text>
          <text transform={`translate(12 ${(M.t + height - M.b) / 2}) rotate(-90)`} className="axis-label" textAnchor="middle">{p.yLabel}</text>
          <g clipPath={`url(#clip-${p.ariaLabel.replace(/\W/g, '')})`}>
            {p.bands?.map((b) => (
              <polygon key={b.label} points={b.points.map(([x, y]) => `${X(x)},${clipY(Y(y))}`).join(' ')} fill={b.color} opacity={0.14} />
            ))}
            {p.hRefs?.map((h, i) => (
              <g key={`h${i}`}>
                <line x1={M.l} x2={width - M.r} y1={Y(h.y)} y2={Y(h.y)} className={h.strong ? 'ref-strong' : 'ref'} />
                {h.label && <text x={width - M.r - 4} y={Y(h.y) - 4} className="ref-label" textAnchor="end">{h.label}</text>}
              </g>
            ))}
            {p.vRefs?.map((v, i) => (
              <g key={`v${i}`}>
                <line y1={M.t} y2={height - M.b} x1={X(v.x)} x2={X(v.x)} className="ref" />
                {v.label && <text x={X(v.x) + 4} y={M.t + 10} className="ref-label">{v.label}</text>}
              </g>
            ))}
            {p.series.map((s) => (
              <path key={s.id} d={path(s.points)} fill="none" stroke={s.color} strokeWidth={s.width ?? 2} strokeDasharray={s.dash} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {p.markers?.map((m) => (
              <g key={m.label}>
                <circle cx={X(m.x)} cy={Y(m.y)} r={5} fill={m.color} stroke="var(--surface)" strokeWidth={2} />
                <text x={X(m.x) + 8} y={Y(m.y) - 8} className="marker-label">{m.label}</text>
              </g>
            ))}
            {p.reveal !== undefined && p.reveal < 1 && <line x1={X(revealX)} x2={X(revealX)} y1={M.t} y2={height - M.b} className="sweep" />}
          </g>
          {hover !== null && (
            <g pointerEvents="none">
              <line x1={X(hover)} x2={X(hover)} y1={M.t} y2={height - M.b} className="crosshair" />
              {hoverRows.map(({ s, pt }) => (
                Number.isFinite(pt[1]) && <circle key={s.id} cx={X(pt[0])} cy={clipY(Y(pt[1]))} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
              ))}
            </g>
          )}
          <rect x={M.l} y={M.t} width={width - M.l - M.r} height={height - M.t - M.b} fill="transparent"
            onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
        {hover !== null && hoverRows.length > 0 && (
          <div className="tooltip" style={{ left: Math.min(X(hover) + 12, width - 190), top: M.t + 4 }}>
            <div className="tt-head">{p.xLabel.split(' [')[0]} = {fmt(hoverRows[0].pt[0])}{p.xUnit ?? ''}</div>
            {hoverRows.map(({ s, pt }) => (
              <div key={s.id} className="tt-row">
                <span className="tt-key" style={{ background: s.color }} />
                <span className="tt-label">{s.label}</span>
                <span className="tt-val">{fmt(pt[1])}{p.yUnit ?? ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {p.caption && <div className="chart-caption">{p.caption}</div>}
    </figure>
  );
}
