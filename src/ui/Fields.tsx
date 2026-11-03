import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { NACA_PRESETS, parseNaca, solveThinAirfoil, surfaceCoordinates } from '../engine';

interface NumProps {
  label: string;
  value: number;
  unit?: string;
  min: number;
  max: number;
  /** slider range [min, max, step] */
  slider?: [number, number, number];
  onChange: (v: number) => void;
  hint?: string;
}

/** Hover/focus info marker; the text is shown by the global TipLayer. */
export function Hint({ text }: { text: string }) {
  return <span className="hint" tabIndex={0} role="img" aria-label={text} data-tip={text}>i</span>;
}

const decimals = (step: number) => Math.max(0, -Math.floor(Math.log10(step) + 1e-9));

/** Numeric input + slider. Only values that parse and lie inside [min, max] are committed. */
export function NumberField({ label, value, unit, min, max, slider, onChange, hint }: NumProps) {
  const [text, setText] = useState(String(value));
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (Number(text) !== value) setText(String(Number(value.toPrecision(6))));
    setErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const commit = (t: string) => {
    setText(t);
    if (!/^-?\d*\.?\d+(e-?\d+)?$/i.test(t.trim())) return setErr('Enter a number');
    const v = Number(t);
    if (v < min || v > max) return setErr(`Range ${min} to ${max}`);
    setErr(null);
    onChange(v);
  };
  const [smin, smax, step] = slider ?? [min, max, (max - min) / 100];
  const lo = Math.min(smin, value), hi = Math.max(smax, value);
  return (
    <div className={`field param ${err ? 'has-error' : ''}`}>
      <div className="param-row">
        <span className="field-label">{label}{hint && <Hint text={hint} />}</span>
        <span className="field-input">
          <input inputMode="decimal" value={text} onChange={(e) => commit(e.target.value)} aria-invalid={!!err} aria-label={label} />
          {unit && <span className="unit">{unit}</span>}
        </span>
      </div>
      <input type="range" min={lo} max={hi} step={step} value={value} aria-label={`${label} slider`}
        onChange={(e) => onChange(Number(Number(e.target.value).toFixed(decimals(step))))} />
      {err && <span className="field-error">{err}</span>}
    </div>
  );
}

interface NacaProps {
  hint?: string;
  label: string;
  value: string;
  onChange: (code: string) => void;
}

/** SVG path of a NACA section (upper surface forward, lower surface back), y up. */
function profilePath(code: string, n = 50): string | null {
  const r = parseNaca(code);
  if (!r.ok) return null;
  const { upper, lower } = surfaceCoordinates(r.profile, n);
  return `M${upper.map(([x, y]) => `${x},${-y}`).join('L')}L${lower.slice().reverse().map(([x, y]) => `${x},${-y}`).join('L')}Z`;
}

function ProfileSvg({ code, className = 'profile', n = 50 }: { code: string; className?: string; n?: number }) {
  const d = useMemo(() => profilePath(code, n), [code, n]);
  if (!d) return null;
  return (
    <svg className={className} viewBox="-0.02 -0.16 1.04 0.32" preserveAspectRatio="xMidYMid meet" aria-hidden={className !== 'profile'} aria-label={`NACA ${code} section`}>
      <line x1="0" x2="1" y1="0" y2="0" className="chord" />
      <path d={d} className="section" />
    </svg>
  );
}

const PRESET_ROWS = NACA_PRESETS.flatMap((g) =>
  g.presets.map((p) => {
    const r = parseNaca(p.code);
    const s = r.ok ? solveThinAirfoil(r.profile) : null;
    return { ...p, group: g.title, alpha0: s ? (s.alpha0 * 180) / Math.PI : 0, cm: s ? s.cmC4 : 0 };
  }),
);

/** Drop-down list of common sections, each with a small drawing and its thin-airfoil alpha_0 and c_m. */
function NacaPicker({ value, onPick, label }: { value: string; onPick: (code: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!open) return;
    const i = PRESET_ROWS.findIndex((p) => p.code === value);
    setActive(i >= 0 ? i : 0);
    const close = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    requestAnimationFrame(() => list.current?.focus());
    return () => document.removeEventListener('mousedown', close);
  }, [open, value]);
  useEffect(() => {
    if (open) list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);
  const pick = (code: string) => { onPick(code); setOpen(false); };
  const id = `naca-list-${label.replace(/\s+/g, '-')}`;
  return (
    <div className="naca-picker" ref={root}>
      <button type="button" className="naca-toggle" aria-haspopup="listbox" aria-expanded={open} aria-controls={id}
        aria-label={`Choose a ${label.toLowerCase()} from the list`} onClick={() => setOpen((o) => !o)}>▾</button>
      {open && (
        <ul className="naca-menu" role="listbox" id={id} ref={list} tabIndex={-1} aria-label={`${label} presets`}
          aria-activedescendant={`${id}-${active}`}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, PRESET_ROWS.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(PRESET_ROWS[active].code); }
            else if (e.key === 'Escape' || e.key === 'Tab') setOpen(false);
          }}>
          {PRESET_ROWS.map((p, i) => (
            <Fragment key={p.code}>
            {(i === 0 || PRESET_ROWS[i - 1].group !== p.group) && <li role="presentation" className="naca-group">{p.group}</li>}
            <li id={`${id}-${i}`} data-i={i} role="option" aria-selected={p.code === value}
              className={`naca-opt ${i === active ? 'active' : ''} ${p.code === value ? 'selected' : ''}`}
              onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p.code)}>
              <ProfileSvg code={p.code} className="naca-thumb" n={24} />
              <span className="naca-opt-text">
                <b>NACA {p.code}</b>
                <span>{p.note}</span>
                <span className="naca-opt-num">α₀ {p.alpha0.toFixed(1)}°, c_m {p.cm.toFixed(3)}</span>
              </span>
            </li>
            </Fragment>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Strict NACA parser on the client: invalid codes are blocked and never reach the engine. */
export function NacaField({ label, value, onChange, hint }: NacaProps) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const parsed = useMemo(() => parseNaca(text), [text]);
  return (
    <div className={`field naca ${parsed.ok ? '' : 'has-error'}`}>
      <label className="field-label" htmlFor={`naca-${label}`}>{label}{hint && <Hint text={hint} />}</label>
      <div className="naca-row">
        <span className="field-input">
          <span className="unit pre">NACA</span>
          <input
            id={`naca-${label}`}
            value={text}
            maxLength={5}
            inputMode="numeric"
            onChange={(e) => {
              const t = e.target.value.replace(/[^0-9]/g, '').slice(0, 5);
              setText(t);
              if (parseNaca(t).ok) onChange(t);
            }}
            aria-invalid={!parsed.ok}
          />
        </span>
        <NacaPicker value={value} label={label} onPick={(c) => { setText(c); onChange(c); }} />
      </div>
      {!parsed.ok && <span className="field-error">{parsed.error}. Using NACA {value}.</span>}
      <ProfileSvg code={value} />
    </div>
  );
}

interface SliderProps {
  hint?: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}

export function Slider({ label, value, min, max, step, format, onChange, hint }: SliderProps) {
  return (
    <label className="field slider">
      <span className="field-label">{label}{hint && <Hint text={hint} />} <b>{format(value)}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
