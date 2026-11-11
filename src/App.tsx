import { lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, Check, ChevronDown, ChevronLeft, ChevronRight, Code2, Copy, Download, ExternalLink, Github, Images, Linkedin, Mail, Menu, Mountain, Pause, Play, Search, Sparkles, X } from 'lucide-react';
import { projects, type Project } from '../data/personalProjects';
import { workExperience, workProjects, type WorkProject } from '../data/workProject';
import { skillCategories } from '../data/skillCategories';
import { altitudeAt, chapterIds, clamp, formatAltitude } from './journeyMath';
import { category, filterCounts, filters, milestones } from './sceneStory';

const Journey = lazy(() => import('./Journey.tsx'));
type Detail = Project | WorkProject;
// Source files live in public/ (person1.jpg, person.png, image1.jpg, project/*.png); the web-sized
// copies below are produced by `python3 scripts/optimize-images.py`.
const resumeUrl = encodeURI('/Resume — Suthep Jantawee  Software Developer.pdf');
const resumeFileName = 'Suthep-Jantawee-Resume.pdf';
const photos = { portrait: '/photos/suthep-portrait.webp', outdoor: '/photos/suthep-outdoor.webp', presenting: '/photos/suthep-presenting.webp' };
const hasScreenshot = (project: Project) => project.image.startsWith('/project/');
function webImage(source: string, thumb = false) {
  const name = source.replace(/^\/project\//, '').replace(/\.[^.]+$/, '');
  return encodeURI(`/project-web/${thumb ? 'thumbs/' : ''}${name}.webp`);
}
// Browser chrome colour per chapter: the --chrome-solid tokens in style.css.
const themeColors = { ground: '#f4f7ed', mountain: '#f3f0ea', sky: '#f1f7fd', space: '#172c3d' };
const chapters = [
  { id: 'ground', label: 'พื้นดิน', en: 'THE BEGINNING', altitude: '000 M', legend: [['#e8d8b4', 'กระท่อม', 'บ้านหลังเล็กที่บรรทัดแรกของโค้ดถูกเขียนขึ้น', ''], ['#c7ed91', 'โต๊ะทดลอง', 'รากฐานจากวิศวกรรมอิเล็กทรอนิกส์ IoT และ Arduino', 'bench'], ['#8bb9a0', 'แปลงผัก', 'โครงงาน IoT ที่ทำเพื่อแก้ปัญหาให้เกษตรกร มีเสาเซนเซอร์ปักอยู่', 'farm'], ['#d9c9a2', 'ทางเดิน', 'เส้นทางที่ทอดขึ้นสู่ภูเขาลูกแรกของสายอาชีพ', 'path']] },
  { id: 'mountain', label: 'ภูเขา', en: 'THE CLIMB', altitude: '2,400 M', legend: [['#e8c46a', 'ธงตามทาง', 'แต่ละก้าวในสายอาชีพ 2020 · 2022 · 2023', 'flags'], ['#c7ed91', 'ยอดเขา', 'ธงสีเขียวคือตำแหน่งปัจจุบันที่ iApp Technology', 'summit'], ['#b9b3a2', 'กองหิน 7 กอง', 'โปรเจกต์จากงานจริงทั้ง 7 ชิ้น เรียงตามทางขึ้นเขา', 'cairns']] },
  { id: 'sky', label: 'ท้องฟ้า', en: 'THE EXPLORATION', altitude: '12,000 M', legend: [['#db9872', 'บอลลูน', 'ไอเดียที่ปล่อยให้ลอยออกไปทดลอง', 'balloon'], ['#a4b780', 'เกาะลอย 4 เกาะ', 'หมวดของโปรเจกต์ทั้ง 4 หมวด แต่ละเกาะมีสัญลักษณ์ของหมวดนั้น', 'islands'], ['#fbfbf4', 'เครื่องบินกระดาษ', 'การทดลองเล็ก ๆ ที่ปล่อยออกไปดูว่าอะไรบินได้', 'planes']] },
  { id: 'space', label: 'อวกาศ', en: 'THE NEXT FRONTIER', altitude: '100 KM', legend: [['#9aab90', 'ดาวเคราะห์', 'AI & Code โลกใบใหม่ที่กำลังสำรวจ', 'planet'], ['#d6926d', 'ยานอวกาศ', 'ขึ้นยานแล้วออกเดินทางสู่บทถัดไปของการทำงาน', 'rocket'], ['#5f7fb0', 'ดาวเทียม', 'เปิดรับสัญญาณเสมอ ทักมาคุยกันได้เลย', 'satellite'], ['#c6edff', 'ดาวหาง', 'ความคิดใหม่ที่เดินทางผ่านเข้ามา', ''], ['#c0ac8f', 'ดวงจันทร์ 2 ดวง', 'System design และกระบวนการพัฒนาซอฟต์แวร์ ที่กำลังเรียนรู้ต่อ', 'moons']] },
] as const;
const professionalProjects = workProjects;
// Journey progress at which the altimeter reaches an altitude, for the ticks on the route beside the page.
function progressAtAltitude(metres: number) {
  let low = 0, high = 3;
  for (let step = 0; step < 40; step++) { const middle = (low + high) / 2; if (altitudeAt(middle) < metres) low = middle; else high = middle; }
  return (low + high) / 2;
}
const routeTicks = milestones.filter(item => ![0, 2400, 12000, 100000].includes(item.metres)).map(item => progressAtAltitude(item.metres) / 3);
const navLinks = [['ground', 'จุดเริ่มต้น'], ['mountain', 'เส้นทางของผม'], ['sky', 'ผลงาน'], ['space', 'ติดต่อ']] as const;

const toolCount = new Set(skillCategories.flatMap(category => category.skills)).size;

// All categories from data/skillCategories.ts shown at once; the only motion is a gentle staggered reveal when scrolled into view.
function Toolkit() {
  const root = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = root.current;
    if (!element || !('IntersectionObserver' in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } }, { rootMargin: '0px 0px -12% 0px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <section ref={root} className={`toolkit ${visible ? 'in-view' : ''}`} aria-labelledby="toolkit-title">
    <div className="toolkit-heading">
      <div><span className="eyebrow"><Code2 size={13} /> TOOLKIT</span><h3 id="toolkit-title">เครื่องมือที่ใช้ทำงาน</h3><p>{toolCount} รายการใน {skillCategories.length} หมวด จากภาษา เฟรมเวิร์ก ฐานข้อมูล ไปจนถึงเครื่องมือ AI และทักษะการทำงานร่วมกับทีม</p></div>
    </div>
    <div className="toolkit-grid">
      {skillCategories.map((item, index) => <div key={item.name} className="toolkit-group" style={{ '--i': index } as CSSProperties}>
        <div className="group-head"><span className="group-icon" aria-hidden="true">{item.icon}</span><h4>{item.name}</h4><span className="group-count">{item.skills.length}</span></div>
        <ul className="skill-chips">{item.skills.map(skill => <li key={skill}>{skill}</li>)}</ul>
      </div>)}
    </div>
  </section>;
}

// The TOOLKIT note closes the ground chapter, so it is read before the first skill cards pop (at 470 M on the
// altimeter, as the chapter ends). The skill cards on the mountain share its look.
function ClimbNote() {
  return <div className="climb-note"><span className="eyebrow"><Code2 size={13} /> TOOLKIT</span><h3>เครื่องมือที่ใช้ทำงาน</h3><p>เลื่อนลงเพื่อไต่เขาไปพร้อมกัน ทุกจุดพักตามทางจะเปิดการ์ดทีละ 2 หมวด รวม {toolCount} รายการใน {skillCategories.length} หมวด</p></div>;
}

// The climb: a tall, uncovered stretch between the ground and mountain chapters where the 3D scene fills the
// viewport and the skill cards appear two at a time (one pair of camps per stop) as the visitor scrolls, with the
// runner climbing after them (rendered by Journey; the chapter label fades out as the first pair pops). Without WebGL
// the cards fall back to the plain Toolkit grid; otherwise a visually-hidden list keeps the skills readable by assistive tech.
function Climb({ fallback }: { fallback: boolean }) {
  return <div className="travel climb" id="toolkit">
    <div className="climb-head" aria-hidden="true"><ChapterMark to={chapters[1]} /></div>
    {fallback ? <Toolkit /> : <ul className="sr-only">{skillCategories.map(item => <li key={item.name}>{item.name}: {item.skills.join(', ')}</li>)}</ul>}
  </div>;
}

// What the visitor is looking at in the 3D scene behind each chapter, as a quiet strip at the end of the chapter.
// Pointing at an entry that has a spot in the scene makes that object pulse there.
function SceneLegend({ chapter, point }: { chapter: typeof chapters[number]; point: (id: string | null) => void }) {
  return <div className="scene-legend"><span className="legend-title">ในฉาก 3D ของบทนี้</span><ul aria-label={`สิ่งที่อยู่ในฉาก${chapter.label}`}>{chapter.legend.map(([color, name, meaning, spot]) => <li key={name} className={spot ? 'has-spot' : undefined} onPointerEnter={spot ? () => point(spot) : undefined} onPointerLeave={spot ? () => point(null) : undefined}><span className="legend-swatch" style={{ background: color }} aria-hidden="true" /><span><strong>{name}</strong> {meaning}</span></li>)}</ul></div>;
}

const travelNotes = ['', 'ออกจากพื้นดิน มุ่งหน้าขึ้นภูเขา', 'ข้ามยอดเขา ปล่อยไอเดียให้ลอยขึ้นฟ้า', 'ขึ้นยาน พ้นชั้นบรรยากาศ สู่โลกใบต่อไป'];

// What the traveller carries into each chapter: a heading, then the numbers from the chapters behind.
const travelGains = [[], ['เก็บระหว่างทาง', `${toolCount} เครื่องมือ`, `${skillCategories.length} หมวด`], ['เก็บมาแล้ว', '2 ตำแหน่งงาน', `${professionalProjects.length} โปรเจกต์`, '4+ ปี'], ['เก็บมาแล้ว', `${projects.length} โปรเจกต์ทดลอง`, `${filters.length - 1} หมวด`]];

// The mark of a chapter break: a large outlined chapter number beside the name of the chapter ahead. It keeps to one
// side, so the 3D scene stays uncovered while the traveller moves on.
function ChapterMark({ to }: { to: typeof chapters[number] }) {
  const index = chapters.indexOf(to);
  const [heading, ...gains] = travelGains[index];
  return <div className="chapter-mark"><span className="chapter-number">0{index + 1}</span><div className="chapter-mark-text"><span className="travel-label"><ArrowUp size={12} /> บทที่ {index + 1} · เดินทางสู่{to.label}</span><strong>{to.label}<span>{to.en} · {to.altitude}</span></strong><small>{travelNotes[index]}</small><ul className="chapter-gains"><li>{heading}</li>{gains.map(item => <li key={item}>{item}</li>)}</ul></div></div>;
}

// A full screen between two chapters with nothing over the scene but the chapter mark, which stays pinned while the
// flight to the next chapter plays behind it.
function Travel({ to }: { to: typeof chapters[number] }) {
  return <div className={`travel travel-to-${to.id}`} aria-hidden="true"><ChapterMark to={to} /></div>;
}

function ProjectArt({ index }: { index: number }) {
  return <div className={`project-art art-${index % 4}`} aria-hidden="true">
    <div className="art-grid" />
    {index % 4 === 0 ? <div className="mini-chat"><div className="mini-top"><span className="mini-dot" /><span>your everyday AI</span><Sparkles size={12} /></div><div className="chat-line user-line">Find something wonderful.</div><div className="chat-line"><span>✳</span> Let's find your perfect match.</div><div className="mini-products">{[0, 1, 2].map(item => <div key={item}><div className={`product-shape shape-${item}`} /><i /><i /></div>)}</div><div className="mini-input">Ask me anything <ArrowUpRight size={13} /></div></div>
    : index % 4 === 1 ? <div className="mini-matching"><div className="match-orbit orbit-one" /><div className="match-orbit orbit-two" /><div className="match-card"><span>✦</span><small>YOUR NEXT CHAPTER</small><strong>A better fit.<br />A brighter future.</strong><div>Discover your potential <ArrowUpRight size={12} /></div></div><span className="float-chip chip-one">React developer</span><span className="float-chip chip-two">It's a match ↗</span></div>
    : index % 4 === 2 ? <div className="mini-dashboard"><div className="dash-side"><span>sw.</span><i /><i /><i /><i /></div><div className="dash-content"><small>Make good work happen.</small><strong>Your creative workspace</strong><div className="dash-stats"><div>12<small>Projects</small></div><div>08<small>In progress</small></div><div>04<small>Completed</small></div></div><div className="dash-bars">{[35, 55, 45, 75, 60, 90, 70, 95].map((height, bar) => <i key={bar} style={{ height: `${height}%` }} />)}</div></div></div>
    : <div className="mini-code"><div className="code-dots"><i /><i /><i /><span>build-something.ts</span></div><p><em>const</em> nextChapter = {'{'}</p><p>&nbsp; curiosity: <b>'always'</b>,</p><p>&nbsp; ideas: <b>'into reality'</b>,</p><p>&nbsp; learning: <em>true</em></p><p>{'}'};</p><div className="code-success"><span /> Ready for what's next.</div></div>}
    <span className="art-caption">CONCEPT VISUAL · PROJECT PREVIEW</span>
  </div>;
}

function ProjectCover({ project }: { project: Project }) {
  const [portrait, setPortrait] = useState(false);
  const thumb = webImage(project.image, true);
  const count = project.slideImages?.length ?? 0;
  return <div className={`project-cover ${portrait ? 'portrait' : ''}`} aria-hidden="true">
    {portrait && <img className="cover-blur" src={thumb} alt="" aria-hidden="true" />}
    <img src={thumb} alt="" loading="lazy" decoding="async" onLoad={event => setPortrait(event.currentTarget.naturalHeight > event.currentTarget.naturalWidth)} />
    {count > 1 && <span className="cover-count"><Images size={11} /> {count}</span>}
  </div>;
}

function Gallery({ project }: { project: Project }) {
  const images = project.slideImages?.length ? project.slideImages : [project.image];
  const [index, setIndex] = useState(0);
  // Portrait (phone) screenshots get a tall stage so they are not shrunk into a 16:10 box.
  const [portraitByImage, setPortraitByImage] = useState<Record<string, boolean>>({});
  const current = images[index];
  const portrait = portraitByImage[current] ?? (project.type === 'MOBILE APP');
  const go = (delta: number) => setIndex((index + delta + images.length) % images.length);
  // Swipe left/right on the stage to change the screenshot; mostly-vertical drags still scroll the dialog.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchEnd = (x: number, y: number) => {
    const start = touch.current;
    touch.current = null;
    if (!start || images.length < 2) return;
    const dx = x - start.x;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(y - start.y) * 1.5) go(dx < 0 ? 1 : -1);
  };
  return <figure className={`dialog-gallery ${portrait ? 'portrait' : ''}`} onKeyDown={event => { if (event.key === 'ArrowLeft') go(-1); if (event.key === 'ArrowRight') go(1); }}>
    <div className="gallery-stage" onTouchStart={event => { touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }} onTouchEnd={event => onTouchEnd(event.changedTouches[0].clientX, event.changedTouches[0].clientY)}>
      {portrait && <img className="stage-blur" src={webImage(current, true)} alt="" aria-hidden="true" />}
      <img key={current} src={webImage(current)} alt={`${project.title} — ภาพหน้าจอที่ ${index + 1} จาก ${images.length}`} decoding="async" onLoad={event => { const isPortrait = event.currentTarget.naturalHeight > event.currentTarget.naturalWidth; setPortraitByImage(map => map[current] === isPortrait ? map : { ...map, [current]: isPortrait }); }} />
      {images.length > 1 && <>
        <button type="button" className="gallery-nav prev" aria-label="ภาพก่อนหน้า" onClick={() => go(-1)}><ChevronLeft size={20} /></button>
        <button type="button" className="gallery-nav next" aria-label="ภาพถัดไป" onClick={() => go(1)}><ChevronRight size={20} /></button>
        <span className="gallery-count" aria-live="polite">{index + 1} / {images.length}</span>
      </>}
    </div>
    {images.length > 1 && <div className="gallery-thumbs" aria-label="เลือกภาพหน้าจอ">{images.map((image, i) => <button type="button" key={image} className={i === index ? 'selected' : ''} aria-label={`ภาพที่ ${i + 1}`} aria-pressed={i === index} onClick={() => setIndex(i)}><img src={webImage(image, true)} alt="" loading="lazy" decoding="async" /></button>)}</div>}
  </figure>;
}

function ProjectDialog({ detail, close }: { detail: Detail | null; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!detail) return;
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    dialog.current?.showModal();
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = oldOverflow; previous?.focus(); };
  }, [detail]);
  if (!detail) return null;
  const personal = 'id' in detail;
  const repositories = personal ? [
    ['Source code', detail.githubUrl], ['Frontend', detail.githubUrlFrontend],
    ['Backend', detail.githubUrlBackend], ['Data pipeline', detail.githubUrlNodePullData],
  ].filter(([, url]) => url) : [];
  return <dialog ref={dialog} className="project-dialog" aria-labelledby="dialog-title" onCancel={close} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="dialog-inner"><button className="dialog-close icon-button" onClick={close} aria-label="ปิดรายละเอียด"><X /></button><span className="eyebrow">{personal ? detail.type : `${detail.kind.toUpperCase()} · ${workExperience.company}`}</span><h2 id="dialog-title">{detail.title}</h2><span className="role-label">{detail.role}{!personal && ` · ${workExperience.period}`}</span>{personal && hasScreenshot(detail) && <Gallery key={detail.id} project={detail} />}{!personal && <div className="work-summary-box"><span>โปรเจกต์นี้คืออะไร</span><p>{detail.summary}</p></div>}<p className="detail-description">{detail.description}</p>{!personal && <><h3>สิ่งที่รับผิดชอบ</h3><ul className="feature-list">{detail.features.map(feature => <li key={feature}>{feature}</li>)}</ul></>}<h3>Tools & technologies</h3><div className="tags">{detail.technologies.map(tech => <span key={tech}>{tech}</span>)}</div>{detail.demoUrl || repositories.length > 0
      ? <div className="dialog-links">{detail.demoUrl && <a className="button primary" href={detail.demoUrl} target="_blank" rel="noreferrer">เปิดเว็บไซต์ <ExternalLink size={15} /></a>}{repositories.map(([label, url]) => <a key={label} className="button secondary" href={url} target="_blank" rel="noreferrer"><Github size={15} />{label}</a>)}</div>
      : !personal && <p className="private-note">งานของบริษัทและลูกค้า จึงไม่มีลิงก์เดโมหรือซอร์สโค้ดสาธารณะ</p>}</div>
  </dialog>;
}

export default function App() {
  const [active, setActive] = useState<string>(chapterIds[0]);
  const [paused, setPaused] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filter, setFilter] = useState(filters[0]);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [allWork, setAllWork] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState(false);
  // What the page points at in the 3D scene: `pointed` while the pointer is on a timeline entry, work row, legend
  // item or learning topic; a chosen project filter keeps its island highlighted; `pulse` is a one-off reaction.
  const [pointed, setPointed] = useState<string | null>(null);
  const [pulse, setPulse] = useState({ id: '', count: 0 });
  const ping = useCallback((id: string) => setPulse(previous => ({ id, count: previous.count + 1 })), []);
  const spot = pointed ?? (filter === filters[0] ? null : `island-${filters.indexOf(filter) - 1}`);
  const point = (id: string) => ({ onPointerEnter: () => setPointed(id), onPointerLeave: () => setPointed(null) });
  const onFallback = useCallback(() => setFallback(true), []);
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const altimeter = useRef<HTMLSpanElement>(null);
  const caption = useRef<HTMLSpanElement>(null);
  const route = useRef<HTMLSpanElement>(null);
  const milestone = useRef(0);
  const currentChapter = chapters.find(chapter => chapter.id === active)!;
  const filtered = projects.filter(project => (filter === filters[0] || category(project) === filter) && `${project.title} ${project.description} ${project.technologies.join(' ')}`.toLowerCase().includes(query.toLowerCase()));

  // The 3D journey reports which chapter the camera is in; the altimeter is written straight to the DOM so scrolling never re-renders the app.
  // Its JSX seed stays constant so changing the chapter label cannot overwrite the live altitude.
  const onChapter = useCallback((index: number) => setActive(chapterIds[index]), []);
  const onProgress = useCallback((progress: number) => {
    const altitude = altitudeAt(progress);
    if (altimeter.current) altimeter.current.textContent = formatAltitude(altitude);
    route.current?.style.setProperty('--route', (clamp(progress, 0, 3) / 3).toFixed(4));
    // The caption beside the altimeter changes only when the displayed altitude passes a milestone.
    const shown = Math.round(altitude / 10) * 10;
    let index = 0;
    while (index < milestones.length - 1 && milestones[index + 1].metres <= shown) index++;
    if (index !== milestone.current && caption.current) {
      milestone.current = index;
      caption.current.textContent = milestones[index].text;
    }
  }, []);

  useEffect(() => () => clearTimeout(copyTimeout.current), []);
  // The mobile browser bar matches the header, which turns dark in the space chapter.
  useEffect(() => { document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColors[active as keyof typeof themeColors] ?? themeColors.ground); }, [active]);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setPaused(preference.matches);
    preference.addEventListener('change', sync);
    return () => preference.removeEventListener('change', sync);
  }, []);
  async function copyEmail() {
    try {
      await navigator.clipboard.writeText('bananammm0001@gmail.com');
      setCopied(true);
      ping('contact');
      clearTimeout(copyTimeout.current);
      copyTimeout.current = setTimeout(() => setCopied(false), 2500);
    } catch { window.location.href = 'mailto:bananammm0001@gmail.com'; }
  }
  function chooseFilter(value: string) { setFilter(value); setExpanded(false); }

  return <div className={`app ${paused ? 'motion-paused' : ''}`} data-chapter={active}>
    <a className="skip-link" href="#main">ข้ามไปเนื้อหา</a>
    {/* The air of each chapter, behind the 3D scene: Journey fades and shifts these layers with the scroll position. */}
    <div className="journey-backdrop" aria-hidden="true">
      <div className="atmo atmo-ground"><i className="hills" /></div>
      <div className="atmo atmo-mountain"><i className="ridge" /><i className="mist" /></div>
      <div className="atmo atmo-sky"><i className="cirrus" /><i className="cloud-sea" /></div>
      <div className="atmo atmo-space"><i className="twinkle" /></div>
    </div>
    <Suspense fallback={<div className="journey-stage scene-loading" aria-hidden="true">กำลังสร้างโลกเล็ก ๆ ...</div>}><Journey paused={paused} spot={spot} pulse={pulse} onChapter={onChapter} onProgress={onProgress} onFallback={onFallback} /></Suspense>
    {/* What the traveller passes through between chapters, in front of the scene and behind the page content:
        a band of mist on the climb, a cloud bank on the way to the sky, the edge of the atmosphere before space. */}
    <div className="journey-veil" aria-hidden="true"><i className="veil-mist" /><i className="veil-cloud" /><i className="veil-limb" /><i className="veil-flash" /></div>

    <header className="site-header"><a className="brand" href="#ground" aria-label="Suthep กลับจุดเริ่มต้น"><span className="brand-icon"><Mountain size={21} strokeWidth={1.7} /></span>suthep<span className="brand-period">.</span></a><nav className={menuOpen ? 'main-nav open' : 'main-nav'} aria-label="เมนูหลัก">{navLinks.map(([id, label]) => <a key={id} href={`#${id}`} className={active === id ? 'active' : undefined} aria-current={active === id ? 'location' : undefined} onClick={() => setMenuOpen(false)}>{label}{id === 'sky' && <> <span>{projects.length.toString().padStart(2, '0')}</span></>}</a>)}</nav><a className="header-contact" href="mailto:bananammm0001@gmail.com">Let’s talk <ArrowUpRight size={16} /></a><button className="menu-toggle icon-button" aria-label={menuOpen ? 'ปิดเมนู' : 'เปิดเมนู'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button></header>

    <aside className="chapter-rail" aria-label="เลือกบทของเรื่อง"><span className="rail-track" ref={route} aria-hidden="true">{routeTicks.map(position => <i key={position} style={{ top: `${(position * 100).toFixed(2)}%` }} />)}</span>{chapters.map((chapter, index) => <a key={chapter.id} href={`#${chapter.id}`} className={active === chapter.id ? 'active' : ''} aria-label={`บท ${index + 1} ${chapter.label}`} aria-current={active === chapter.id ? 'location' : undefined}><span className="rail-label">{chapter.label}</span><span className="rail-dot" /></a>)}</aside>

    <main id="main">
      <section id="ground" className="ground-section chapter">
        <div className="hero-stage">
          <div className="hero-topline"><span className="eyebrow">THE DEVELOPER’S JOURNEY</span><span className="opportunity-pill"><span className="status-dot" /> พร้อมเปิดรับโอกาสร่วมงานใหม่</span></div>
          <div className="hero-layout">
            <div className="hero-copy">
              <p className="chapter-kicker">01 / พื้นดิน · จุดเริ่มต้นของผม</p>
              <h1>จากโค้ดบรรทัดแรก<br /><span>สู่สิ่งที่ใช้งานได้จริง</span></h1>
              <p className="intro-name">สวัสดีครับ ผม <strong>สุเทพ จันทวี</strong> — Full Stack Developer</p>
              <p className="hero-description">ผมเริ่มจากการเรียนวิศวกรรมอิเล็กทรอนิกส์ ก่อนก้าวมาพัฒนาเว็บไซต์ แอปพลิเคชัน และระบบเบื้องหลัง วันนี้ผมสนุกกับการใช้โค้ดแก้ปัญหา และเรียนรู้สิ่งใหม่จากทุกโปรเจกต์ที่ลงมือทำ</p>
              <div className="hero-actions"><a className="button primary" href="#mountain">ออกเดินทางด้วยกัน <ArrowDown size={16} /></a><a className="resume-link" href={resumeUrl} download={resumeFileName}>ดาวน์โหลดเรซูเม่ <Download size={15} /></a></div>
            </div>
            <figure className="hero-portrait">
              <span className="portrait-glow" aria-hidden="true" />
              <img src={photos.portrait} alt="สุเทพ จันทวี ยิ้มขณะถือกล้องถ่ายรูป" width={1054} height={1200} fetchPriority="high" decoding="async" />
              <figcaption className="portrait-badge"><strong>สุเทพ จันทวี</strong><span>Full Stack Developer · iApp Technology</span></figcaption>
              <span className="portrait-tag" aria-hidden="true"><Code2 size={13} /> React · Next.js · Node.js</span>
            </figure>
          </div>
        </div>
        <div className="landscape-window" aria-hidden="true"><span className="landscape-note">ทุกก้าวเริ่มต้นจากความอยากรู้</span></div>
        <div className="hero-bottom">
          <p className="journey-intro">พื้นดิน <span>↗</span> ภูเขา <span>↗</span> ท้องฟ้า <span>↗</span> อวกาศ</p>
          <p className="journey-summary">เลื่อนลงเพื่อรู้จักผม ผ่านประสบการณ์ทำงาน ผลงานที่ทดลองสร้าง และเป้าหมายในก้าวต่อไป</p>
          <div className="hero-facts"><div className="hero-stat"><strong>4+</strong><span>ปีของประสบการณ์<br />พัฒนาซอฟต์แวร์</span></div><div className="hero-stat"><strong>{projects.length}</strong><span>โปรเจกต์ส่วนตัว<br />ที่ได้ลงมือสร้าง</span></div><div className="hero-social"><a href="https://github.com/unikonkon" target="_blank" rel="noreferrer" aria-label="GitHub"><Github size={18} /> GitHub</a><a href="https://www.linkedin.com/in/suthep-jantawee" target="_blank" rel="noreferrer" aria-label="LinkedIn"><Linkedin size={18} /> LinkedIn</a></div></div>
          <SceneLegend chapter={chapters[0]} point={setPointed} />
        </div>
        <ClimbNote />
      </section>

      <Climb fallback={fallback} />

      <section id="mountain" className="mountain-section chapter section-padding"><div className="chapter-intro"><div className="chapter-heading"><span className="eyebrow">02 / ภูเขา · ประสบการณ์ทำงาน</span><span className="altitude">เรียนรู้จากความท้าทาย</span></div><h2>เติบโตจากการแก้ปัญหา<br /><span className="chapter-subtitle">ทีละโปรเจกต์ ทีละก้าว</span></h2><p className="section-description">เหมือนการเดินขึ้นภูเขา งานแต่ละชิ้นทำให้ผมได้ฝึกทักษะใหม่ จากการสร้างหน้าจอที่ใช้งานง่าย ไปจนถึงการออกแบบ API ฐานข้อมูล และระบบที่ทำงานร่วมกันได้</p></div><div className="chapter-content"><div className="story-layout"><div><div className="timeline"><article {...point('flag-0')}><span className="timeline-year"><span className="flag-mark" style={{ background: '#e8c46a' }} aria-hidden="true" />2015 — 2020</span><h3>เริ่มต้นจากความเข้าใจระบบ</h3><p>วิศวกรรมอิเล็กทรอนิกส์ · มหาวิทยาลัยเทคโนโลยีสุรนารี</p><p className="muted">เรียนรู้ IoT, Arduino และ ESP8266 พร้อมลงมือทำโครงงานวิศวกรรมเพื่อแก้ปัญหาให้เกษตรกร</p></article><article {...point('flag-1')}><span className="timeline-year"><span className="flag-mark" style={{ background: '#e2a27a' }} aria-hidden="true" />MAR — DEC 2022</span><h3>Frontend Developer</h3><p>Vertobase Company</p><p className="muted">สร้างประสบการณ์บน React, Next.js และ Flutter ตั้งแต่ responsive UI จนถึง PIN login บน Zignway App</p></article><article {...point('current')}><span className="timeline-year"><span className="flag-mark" style={{ background: '#c7ed91' }} aria-hidden="true" />FEB 2023 — PRESENT <span className="current-pill">ปัจจุบัน</span></span><h3>Full Stack Developer</h3><p>iApp Technology</p><p className="muted">รับผิดชอบตั้งแต่ frontend, API และฐานข้อมูล ไปจนถึง data pipeline, CI/CD และแอป desktop พร้อมส่งมอบงานให้ลูกค้า</p></article></div></div><div className="mountain-visual"><figure className="story-photo"><img src={photos.presenting} alt="สุเทพกำลังถือไมโครโฟนนำเสนอระบบผ่านโน้ตบุ๊กในห้องประชุม" width={1600} height={1200} loading="lazy" decoding="async" /><figcaption><span>ON THE JOB</span>นำเสนอสถาปัตยกรรม API และเดโมระบบให้ลูกค้าโดยตรง ตั้งแต่ออกแบบจนถึงส่งมอบ</figcaption></figure><div className="field-note"><span>สิ่งที่ยึดถือในการทำงาน</span><p>“เข้าใจปัญหาให้ลึก<br />แล้วค่อยสร้างสิ่งที่เรียบง่าย”</p><small>เข้าใจผู้ใช้ · ออกแบบให้ชัดเจน · ทดสอบก่อนส่งมอบ</small></div></div></div>
        <div className="work-panel"><div className="work-heading"><div><span className="eyebrow">โปรเจกต์จากการทำงาน</span><h3>สิ่งที่ผมได้มีส่วนพัฒนา</h3><p className="work-employer"><strong>{workExperience.role}</strong> · {workExperience.company} · {workExperience.period}</p></div><span>{professionalProjects.length.toString().padStart(2, '0')} โปรเจกต์</span></div><div className="work-list">{(allWork ? professionalProjects : professionalProjects.slice(0, 4)).map((project, index) => <button className="work-row" key={project.title} {...point(`work-${index}`)} onFocus={() => setPointed(`work-${index}`)} onBlur={() => setPointed(null)} onClick={() => setDetail(project)}><span className="work-index">0{index + 1}</span><div><h4>{project.title}<span className={`work-kind kind-${project.kind.toLowerCase()}`}>{project.kind}</span></h4><span>{project.role}</span><p className="work-summary">{project.summary}</p></div><span className="work-tech">{project.technologies.slice(0, 3).join(' / ')}</span><ArrowUpRight size={21} /></button>)}</div><button className="text-button all-work" onClick={() => setAllWork(!allWork)}>{allWork ? 'แสดงน้อยลง' : `ดูงานทั้งหมด ${professionalProjects.length} โปรเจกต์`} <ChevronDown size={16} className={allWork ? 'rotate' : ''} /></button></div><SceneLegend chapter={chapters[1]} point={setPointed} /></div>
      </section>

      <Travel to={chapters[2]} />

      <section id="sky" className="sky-section chapter section-padding"><div className="chapter-intro"><div className="chapter-heading"><span className="eyebrow">03 / ท้องฟ้า · พื้นที่ทดลอง</span><span className="altitude">ต่อยอดสิ่งที่ได้เรียนรู้</span></div><h2>ลองสิ่งใหม่<br /><span className="chapter-subtitle">ให้ไอเดียได้ออกบิน</span></h2><p className="section-description">เมื่อมีพื้นฐานที่มั่นคง ผมก็อยากลองไปให้ไกลขึ้น โปรเจกต์เหล่านี้คือพื้นที่ทดลองของผม ตั้งแต่เว็บและแอป ไปจนถึง AI เพื่อเปลี่ยนสิ่งที่สงสัยให้เป็นผลงานที่เปิดใช้งานได้</p></div><div className="chapter-content">
        <div className="project-panel"><div className="project-controls"><div className="project-filters" aria-label="หมวดหมู่โปรเจกต์">{filters.map(item => <button key={item} className={filter === item ? 'selected' : ''} aria-label={item === filters[0] ? `${item} ${projects.length}` : item} aria-pressed={filter === item} onClick={() => chooseFilter(item)}>{item}<span>{filterCounts[item]}</span></button>)}</div><label className="search-field"><Search size={16} /><input aria-label="ค้นหาโปรเจกต์" placeholder="ค้นหาโปรเจกต์..." value={query} onChange={event => { setQuery(event.target.value); setExpanded(false); }} /></label></div><div className="result-count" aria-live="polite">พบ {filtered.length} โปรเจกต์ · เลือกเพื่ออ่านรายละเอียด</div><div className="project-grid">{(expanded ? filtered : filtered.slice(0, 6)).map(project => <button className="project-card" key={project.id} onClick={() => setDetail(project)}>{hasScreenshot(project) ? <ProjectCover project={project} /> : <ProjectArt index={3} />}<div className="project-card-body"><div className="project-meta"><span>{project.type}</span><span>{project.index.padStart(2, '0')} /</span></div><h3>{project.title.replace(/^[^A-Za-z]+/, '')}<ArrowUpRight size={20} /></h3><p>{project.description}</p><div className="tags">{project.technologies.slice(0, 3).map(tech => <span key={tech}>{tech}</span>)}{project.technologies.length > 3 && <span>+{project.technologies.length - 3}</span>}</div></div></button>)}</div>{filtered.length === 0 && <div className="empty-state"><Search size={28} /><h3>ยังไม่พบโปรเจกต์ที่ค้นหา</h3><p>ลองชื่อเทคโนโลยี เช่น React, Next.js หรือ AI</p><button className="button secondary" onClick={() => { setQuery(''); chooseFilter(filters[0]); }}>ล้างการค้นหา</button></div>}{filtered.length > 6 && <div className="load-more"><button className="button secondary" onClick={() => { if (!expanded) ping('balloons'); setExpanded(!expanded); }}>{expanded ? 'แสดงน้อยลง' : `สำรวจทั้งหมด ${filtered.length} โปรเจกต์`} {expanded ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}</button><span>แสดง {expanded ? filtered.length : 6} จาก {filtered.length} โปรเจกต์</span></div>}</div><SceneLegend chapter={chapters[2]} point={setPointed} /></div>
      </section>

      <Travel to={chapters[3]} />

      <section id="space" className="space-section chapter section-padding"><div className="chapter-intro"><div className="chapter-heading"><span className="eyebrow">04 / อวกาศ · ก้าวต่อไป</span><span className="altitude">ยังมีสิ่งใหม่ให้เรียนรู้เสมอ</span></div><div className="availability"><span className="status-dot" /> พร้อมร่วมงานในโปรเจกต์ถัดไป</div><h2>มาสร้างสิ่งที่มีประโยชน์<br /><span className="chapter-subtitle">ไปด้วยกันครับ</span></h2></div><div className="chapter-content"><div className="space-layout"><div className="space-copy"><p>การเดินทางของผมยังไม่จบ ผมกำลังเรียนรู้ AI, RAG และการออกแบบระบบ พร้อมเปิดรับโอกาสในสาย Frontend, Backend และ Full Stack หากทีมของคุณมีโจทย์ที่อยากแก้ หรือโปรเจกต์ที่อยากพัฒนาต่อ ผมยินดีคุยและเรียนรู้ไปด้วยกันครับ</p><a className="button lime" href="mailto:bananammm0001@gmail.com" onClick={() => ping('contact')}>เริ่มต้นบทสนทนา <ArrowUpRight size={17} /></a><div className="email-row"><a href="mailto:bananammm0001@gmail.com"><Mail size={13} /> bananammm0001@gmail.com</a><button className="icon-button" aria-label={copied ? 'คัดลอกอีเมลแล้ว' : 'คัดลอกอีเมล'} onClick={copyEmail}>{copied ? <Check size={16} /> : <Copy size={16} />}</button><span className="copy-feedback" role="status">{copied ? 'คัดลอกแล้ว' : ''}</span></div></div><figure className="space-portrait"><span className="planet-ring" aria-hidden="true" /><img src={photos.outdoor} alt="สุเทพ จันทวี สวมหมวกและสะพายเป้ พร้อมออกเดินทางครั้งต่อไป" width={936} height={1100} loading="lazy" decoding="async" /><figcaption><strong>พร้อมออกเดินทางบทถัดไป</strong><span>Frontend · Backend · Full Stack</span></figcaption></figure></div><SceneLegend chapter={chapters[3]} point={setPointed} /><div className="skills-footer"><span>สิ่งที่กำลังเรียนรู้ต่อ</span><span {...point('planet')}>AI & CODE</span><span {...point('moon-0')}>System design</span><span {...point('moon-1')}>กระบวนการพัฒนาซอฟต์แวร์</span></div><footer><a className="brand" href="#ground"><span className="brand-icon"><Mountain size={19} /></span>suthep.</a><p>© {new Date().getFullYear()} Suthep Jantawee<br /><span>Crafted with code & curiosity.</span></p><div className="footer-social"><a href="https://github.com/unikonkon" target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={13} /></a><a href="https://www.linkedin.com/in/suthep-jantawee" target="_blank" rel="noreferrer">LinkedIn <ArrowUpRight size={13} /></a><a href={resumeUrl} download={resumeFileName}>Resume <Download size={13} /></a></div><a className="back-top" href="#ground" aria-label="กลับด้านบน"><ArrowDown size={18} /></a></footer></div></section>
    </main>
    <div className={fallback ? 'journey-status' : 'journey-status with-caption'}><span className="status-dot" /><span className="journey-chapter-label">{currentChapter.label}<span className="journey-chapter-en"> · {currentChapter.en}</span>{!fallback && <span className="journey-caption"> · <span ref={caption}>{milestones[0].text}</span></span>}</span><span className="status-separator" /><span className="altimeter"><span ref={altimeter}>{chapters[0].altitude}</span></span><button className="motion-toggle" aria-label={paused ? 'เปิดภาพเคลื่อนไหว' : 'หยุดภาพเคลื่อนไหว'} aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? <Play size={11} /> : <Pause size={11} />}</button></div>
    <ProjectDialog detail={detail} close={() => setDetail(null)} />
  </div>;
}
