import { useEffect, useRef, useState } from 'react';

export const chapters = [
  { id: 'ground', label: 'พื้นดิน', en: 'THE BEGINNING', altitude: '000', title: 'เริ่มจากโค้ดบรรทัดแรก', code: 'const journey = new Developer();', lesson: 'CURIOSITY → FOUNDATION' },
  { id: 'mountain', label: 'ภูเขา', en: 'THE CLIMB', altitude: '2,400', title: 'ทุกปัญหาคืออีกก้าวที่เติบโต', code: 'while (learning) { build(); }', lesson: 'CHALLENGES → EXPERIENCE' },
  { id: 'sky', label: 'ท้องฟ้า', en: 'THE EXPLORATION', altitude: '12,000', title: 'ให้สิ่งที่เรียนรู้พาไอเดียออกบิน', code: 'await ideas.map(experiment);', lesson: 'EXPERIMENTS → POSSIBILITIES' },
  { id: 'space', label: 'อวกาศ', en: 'THE NEXT FRONTIER', altitude: '∞', title: 'ยังมีโลกใหม่ให้สร้างเสมอ', code: 'return buildTogether(nextChapter);', lesson: 'COLLABORATION → WHAT’S NEXT' },
] as const;

export function useJourney() {
  const progress = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const offset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 80;
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      const starts = chapters.map(chapter => Math.min(maxScroll, Math.max(0, ((document.getElementById(chapter.id)?.getBoundingClientRect().top ?? 0) + scrollY) - offset)));
      const y = scrollY + 2;
      let index = 0;
      while (index < starts.length - 1 && y >= starts[index + 1]) index++;
      const fraction = index === 3 ? 0 : Math.min(1, Math.max(0, (y - starts[index]) / Math.max(1, starts[index + 1] - starts[index])));
      progress.current = index + fraction;
      setActiveIndex(index);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    update();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); };
  }, []);
  return { progress, activeIndex, active: chapters[activeIndex].id };
}
