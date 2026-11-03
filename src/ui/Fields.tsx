import { useEffect, useMemo, useState } from 'react';
import { parseNaca, surfaceCoordinates } from '../engine';

interface NumProps {
  label: string;
  value: number;
  unit?: string;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  hint?: string;
}

/** Numeric input that only commits values that parse and lie inside [min, max]. */
export function NumberField({ label, value, unit, min, max, step, onChange, hint }: NumProps) {
  const [text, setText] = useState(String(value));
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (Number(text) !== value) setText(String(Number(value.toPrecision(6))));
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
  return (
    <label className={`field ${err ? 'has-error' : ''}`} title={hint}>
      <span className="field-label">{label}</span>
      <span className="field-input">
        <input inputMode="decimal" value={text} step={step} onChange={(e) => commit(e.target.value)} aria-invalid={!!err} />
        {unit && <span className="unit">{unit}</span>}
      </span>
      {err && <span className="field-error">{err}</span>}
    </label>
  );
}

interface NacaProps {
  label: string;
  value: string;
  onChange: (code: string) => void;
}

/** Strict NACA parser on the client: invalid codes are blocked and never reach the engine. */
export function NacaField({ label, value, onChange }: NacaProps) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const parsed = useMemo(() => parseNaca(text), [text]);
  const shown = parseNaca(value);
  const shape = useMemo(() => (shown.ok ? surfaceCoordinates(shown.profile, 50) : null), [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`field naca ${parsed.ok ? '' : 'has-error'}`}>
      <label className="field-label" htmlFor={`naca-${label}`}>{label}</label>
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
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}

export function Slider({ label, value, min, max, step, format, onChange }: SliderProps) {
  return (
    <label className="field slider">
      <span className="field-label">{label} <b>{format(value)}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
