/** Shared scroll → journey progress maths, kept free of three.js so App can use it without loading the 3D bundle. */
export const chapterIds = ['ground', 'mountain', 'sky', 'space'] as const;
export type ChapterId = typeof chapterIds[number];

// Altitude (metres) at each station; the last entry is "beyond space".
export const altitudes = [0, 2400, 12000, 100000, 400000];

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const smooth = (t: number) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };
/** Inside a chapter the camera drifts slowly (first 70% of its scroll); the real travel happens in the gap before the next chapter. */
export const travel = (f: number) => (f < 0.7 ? (f / 0.7) * 0.2 : 0.2 + 0.8 * smooth((f - 0.7) / 0.3));
/** Backdrop colour blend: hold the chapter colour, then cross-fade during the last 40%. */
export const blend = (f: number) => (f < 0.6 ? 0 : smooth((f - 0.6) / 0.4));

export function altitudeAt(progress: number) {
  const q = clamp(progress, 0, altitudes.length - 1);
  const index = Math.min(Math.floor(q), altitudes.length - 2);
  return altitudes[index] + (altitudes[index + 1] - altitudes[index]) * travel(q - index);
}
export function formatAltitude(metres: number) {
  return metres >= 100000 ? `${Math.round(metres / 1000)} KM` : `${(Math.round(metres / 10) * 10).toLocaleString('en-US')} M`;
}

/** Scroll position → continuous chapter progress (0 = start of ground … 3.7 = end of space). */
export function measureProgress() {
  const anchor = window.scrollY + window.innerHeight * 0.38;
  const bounds = chapterIds.map(id => {
    const element = document.getElementById(id);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { top: rect.top + window.scrollY, bottom: rect.bottom + window.scrollY };
  });
  for (let index = 0; index < bounds.length; index++) {
    const section = bounds[index];
    if (!section) continue;
    if (anchor < section.top) return index === 0 ? 0 : index;
    if (anchor < section.bottom) return index + (0.7 * (anchor - section.top)) / Math.max(1, section.bottom - section.top);
    const next = bounds[index + 1];
    if (next && anchor < next.top) return index + 0.7 + (0.3 * (anchor - section.bottom)) / Math.max(1, next.top - section.bottom);
  }
  return 3.7;
}
