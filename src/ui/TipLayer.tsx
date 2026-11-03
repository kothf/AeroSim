import { useEffect, useState } from 'react';

/**
 * One fixed-position tooltip for every element carrying `data-tip` (hover or keyboard focus).
 * Fixed positioning keeps it visible inside scrolling containers such as the sidebar.
 */
export function TipLayer() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  useEffect(() => {
    const show = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.('[data-tip]') as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = Math.min(Math.max(r.left + r.width / 2 - 150, 8), window.innerWidth - 308);
      const below = r.bottom + 8;
      setTip({ text: el.dataset.tip!, x, y: below + 120 > window.innerHeight ? r.top - 8 : below });
    };
    const hide = (e: Event) => {
      if ((e.target as Element | null)?.closest?.('[data-tip]')) setTip(null);
    };
    document.addEventListener('pointerover', show);
    document.addEventListener('focusin', show);
    document.addEventListener('pointerout', hide);
    document.addEventListener('focusout', hide);
    window.addEventListener('scroll', () => setTip(null), true);
    return () => {
      document.removeEventListener('pointerover', show);
      document.removeEventListener('focusin', show);
      document.removeEventListener('pointerout', hide);
      document.removeEventListener('focusout', hide);
    };
  }, []);
  if (!tip) return null;
  const above = tip.y < 0 || tip.y + 120 > window.innerHeight;
  return (
    <div className="tip-layer" role="tooltip" style={{ left: tip.x, top: tip.y, transform: above ? 'translateY(-100%)' : undefined }}>
      {tip.text}
    </div>
  );
}
