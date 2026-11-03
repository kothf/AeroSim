/** Common NACA sections offered in the section picker (Abbott & von Doenhoff, Theory of Wing Sections). */
export interface NacaPreset {
  code: string;
  note: string;
}

export interface NacaPresetGroup {
  title: string;
  presets: NacaPreset[];
}

export const NACA_PRESETS: NacaPresetGroup[] = [
  {
    title: 'Symmetric 4-digit',
    presets: [
      { code: '0006', note: 'thin; fins, high-speed tails' },
      { code: '0009', note: 'tail surfaces' },
      { code: '0010', note: 'tail surfaces' },
      { code: '0012', note: 'classic tail / reference section' },
      { code: '0015', note: 'thick tail, struts' },
      { code: '0018', note: 'thick; root of tapered tails' },
    ],
  },
  {
    title: 'Cambered 4-digit',
    presets: [
      { code: '1408', note: 'light camber, thin' },
      { code: '2408', note: 'thin GA wing tip' },
      { code: '2412', note: 'general aviation wing (Cessna 172)' },
      { code: '2415', note: 'general aviation wing root' },
      { code: '2418', note: 'thick root section' },
      { code: '4412', note: 'high lift, classic test section' },
      { code: '4415', note: 'high lift, default wing' },
      { code: '4418', note: 'high lift, thick' },
      { code: '6409', note: 'strong camber, thin' },
      { code: '6412', note: 'strong camber, low speed' },
    ],
  },
  {
    title: '5-digit (230 series)',
    presets: [
      { code: '23009', note: 'thin, low moment' },
      { code: '23012', note: 'low pitching moment wing' },
      { code: '23015', note: 'low moment, root' },
      { code: '23018', note: 'thick root section' },
      { code: '24012', note: 'camber aft (x_f = 0.20)' },
      { code: '25012', note: 'camber aft (x_f = 0.25)' },
      { code: '23112', note: 'reflexed, near-zero moment' },
    ],
  },
];
