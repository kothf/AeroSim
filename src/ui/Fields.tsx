import { useEffect, useMemo, useState } from 'react';
import { parseNaca, surfaceCoordinates } from '../engine';

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

/** Strict NACA parser on the client: invalid codes are blocked and never reach the engine. */
export function NacaField({ label, value, onChange, hint }: NacaProps) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const parsed = useMemo(() => parseNaca(text), [text]);
  const shown = parseNaca(value);
  const shape = useMemo(() => (shown.ok ? surfaceCoordinates(shown.profile, 50) : null), [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`field naca ${parsed.ok ? '' : 'has-error'}`}>
      <label className="field-label" htmlFor={`naca-${label}`}>{label}{hint && <Hint text={hint} />}</label>
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
      {!parsed.ok && <span className="field-error">{parsed.error}. Using NACA {value}.</span>}
      {shape && (
        <svg className="profile" viewBox="-0.02 -0.16 1.04 0.32" preserveAspectRatio="xMidYMid meet" aria-label={`NACA ${value} section`}>
          <line x1="0" x2="1" y1="0" y2="0" className="chord" />
          <path
            d={`M${shape.upper.map(([x, y]) => `${x},${-y}`).join('L')}L${shape.lower.slice().reverse().map(([x, y]) => `${x},${-y}`).join('L')}Z`}
            className="section"
          />
        </svg>
      )}
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
