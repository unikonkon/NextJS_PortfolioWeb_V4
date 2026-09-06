import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, Check, ChevronDown, ChevronLeft, ChevronRight, Code2, Copy, Download, ExternalLink, Github, Images, Linkedin, Mail, Menu, Mountain, Pause, Play, Search, Sparkles, X } from 'lucide-react';
import { projects, type Project } from '../data/personalProjects';
import { workProjects, type WorkProject } from '../data/workProject';
import { altitudeAt, chapterIds, formatAltitude } from './journeyMath';

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
const chapters = [
  { id: 'ground', label: 'พื้นดิน', en: 'THE BEGINNING', altitude: '000 M', legend: [['#e8d8b4', 'กระท่อม', 'บ้านหลังเล็กที่บรรทัดแรกของโค้ดถูกเขียนขึ้น'], ['#c7ed91', 'โต๊ะทดลอง', 'รากฐานจากวิศวกรรมอิเล็กทรอนิกส์ IoT และ Arduino'], ['#d9c9a2', 'ทางเดิน', 'เส้นทางที่ทอดขึ้นสู่ภูเขาลูกแรกของสายอาชีพ']] },
  { id: 'mountain', label: 'ภูเขา', en: 'THE CLIMB', altitude: '2,400 M', legend: [['#e8c46a', 'ธงตามทาง', 'แต่ละก้าวในสายอาชีพ 2020 · 2022 · 2023'], ['#d99a6c', 'เต็นท์', 'จุดพักเพื่อทบทวน เรียนรู้ แล้วไปต่อ'], ['#c7ed91', 'ยอดเขา', 'ธงสีเขียวคือตำแหน่งปัจจุบันที่ iApp Technology']] },
  { id: 'sky', label: 'ท้องฟ้า', en: 'THE EXPLORATION', altitude: '12,000 M', legend: [['#db9872', 'บอลลูน', 'ไอเดียที่ปล่อยให้ลอยออกไปทดลอง'], ['#a4b780', 'เกาะลอย', 'โปรเจกต์ที่กลายเป็นของจริงใช้งานได้'], ['#fbfbf4', 'เครื่องบินกระดาษ', 'การทดลองเล็ก ๆ ที่ปล่อยออกไปดูว่าอะไรบินได้']] },
  { id: 'space', label: 'อวกาศ', en: 'THE NEXT FRONTIER', altitude: '100 KM', legend: [['#9aab90', 'ดาวเคราะห์', 'AI & RAG โลกใบใหม่ที่กำลังสำรวจ'], ['#d6926d', 'จรวด', 'พร้อมออกเดินทางสู่บทถัดไปของการทำงาน'], ['#5f7fb0', 'ดาวเทียม', 'เปิดรับสัญญาณเสมอ ทักมาคุยกันได้เลย']] },
] as const;
const ekyb: WorkProject = {
  title: 'iApp EKYB', role: 'Backend Developer',
  description: 'พัฒนาระบบตรวจสอบข้อมูลธุรกิจ ตั้งแต่การดึงข้อมูล การออกแบบฐานข้อมูล ไปจนถึง API สำหรับค้นหาและประเมินความเสี่ยง',
  technologies: ['Node.js', 'PostgreSQL', 'Redis', 'Jenkins', 'Docker', 'OpenAPI'],
  features: ['สร้าง data pipeline พร้อมจัดการ rate limit และ cookie อัตโนมัติ', 'พัฒนา REST API สำหรับค้นหา ประเมินความเสี่ยง และ batch lookup สูงสุด 5,000 ราย', 'ออกแบบ schema และทดสอบ load เพื่อหาขีดจำกัดของ source API', 'จัดทำ OpenAPI, tests, CI/CD และเอกสารสถาปัตยกรรมราย endpoint'],
  icon: '⌘', colorScheme: 'green',
};
const professionalProjects = [ekyb, ...workProjects];
const filters = ['ทั้งหมด', 'AI & Full Stack', 'Web & Mobile', 'API', 'Portfolio & Design'];
function category(project: Project) {
  if (project.type === 'AI APP & FULL STACK') return filters[1];
  if (project.type === 'WEB APP' || project.type === 'MOBILE APP') return filters[2];
  if (project.type === 'API') return filters[3];
  return filters[4];
}

function SceneLegend({ chapter }: { chapter: typeof chapters[number] }) {
  return <ul className="scene-legend" aria-label={`สิ่งที่อยู่ในฉาก${chapter.label}`}>{chapter.legend.map(([color, name, meaning]) => <li key={name}><span className="legend-swatch" style={{ background: color }} aria-hidden="true" /><strong>{name}</strong><span>{meaning}</span></li>)}</ul>;
}

function Travel({ to }: { to: typeof chapters[number] }) {
  const index = chapters.indexOf(to);
  return <div className="travel" aria-hidden="true"><span className="travel-line" /><span className="travel-label"><ArrowUp size={12} /> บทที่ {index + 1} · เดินทางสู่{to.label}</span><small>{['', 'ออกจากพื้นดิน มุ่งหน้าขึ้นภูเขา', 'ข้ามยอดเขา ปล่อยไอเดียให้ลอยขึ้นฟ้า', 'พ้นชั้นบรรยากาศ สู่โลกใบต่อไป'][index]}</small></div>;
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
  const go = (delta: number) => setIndex((index + delta + images.length) % images.length);
  return <figure className="dialog-gallery" onKeyDown={event => { if (event.key === 'ArrowLeft') go(-1); if (event.key === 'ArrowRight') go(1); }}>
    <div className="gallery-stage">
      <img key={images[index]} src={webImage(images[index])} alt={`${project.title} — ภาพหน้าจอที่ ${index + 1} จาก ${images.length}`} decoding="async" />
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
    <div className="dialog-inner"><button className="dialog-close icon-button" onClick={close} aria-label="ปิดรายละเอียด"><X /></button><span className="eyebrow">{personal ? detail.type : 'PROFESSIONAL WORK'}</span><h2 id="dialog-title">{detail.title}</h2><span className="role-label">{detail.role}</span>{personal && hasScreenshot(detail) && <Gallery key={detail.id} project={detail} />}<p className="detail-description">{detail.description}</p>{!personal && <><h3>สิ่งที่รับผิดชอบ</h3><ul className="feature-list">{detail.features.map(feature => <li key={feature}>{feature}</li>)}</ul></>}<h3>Tools & technologies</h3><div className="tags">{detail.technologies.map(tech => <span key={tech}>{tech}</span>)}</div><div className="dialog-links">{detail.demoUrl && <a className="button primary" href={detail.demoUrl} target="_blank" rel="noreferrer">เปิดเว็บไซต์ <ExternalLink size={15} /></a>}{repositories.map(([label, url]) => <a key={label} className="button secondary" href={url} target="_blank" rel="noreferrer"><Github size={15} />{label}</a>)}</div>{!detail.demoUrl && repositories.length === 0 && <p className="private-note">โปรเจกต์สำหรับองค์กร · ไม่มีลิงก์สาธารณะในข้อมูลต้นฉบับ</p>}</div>
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
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const altimeter = useRef<HTMLSpanElement>(null);
  const currentChapter = chapters.find(chapter => chapter.id === active)!;
  const filtered = projects.filter(project => (filter === filters[0] || category(project) === filter) && `${project.title} ${project.description} ${project.technologies.join(' ')}`.toLowerCase().includes(query.toLowerCase()));

  // The 3D journey reports which chapter the camera is in; the altimeter is written straight to the DOM so scrolling never re-renders the app.
  const onChapter = useCallback((index: number) => setActive(chapterIds[index]), []);
  const onProgress = useCallback((progress: number) => {
    if (altimeter.current) altimeter.current.textContent = formatAltitude(altitudeAt(progress));
  }, []);

  useEffect(() => () => clearTimeout(copyTimeout.current), []);
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
      clearTimeout(copyTimeout.current);
      copyTimeout.current = setTimeout(() => setCopied(false), 2500);
    } catch { window.location.href = 'mailto:bananammm0001@gmail.com'; }
  }
  function chooseFilter(value: string) { setFilter(value); setExpanded(false); }

  return <div className={`app ${paused ? 'motion-paused' : ''}`} data-chapter={active}>
    <a className="skip-link" href="#main">ข้ามไปเนื้อหา</a>
    <div className="journey-backdrop" aria-hidden="true" />
    <Suspense fallback={<div className="journey-stage scene-loading" aria-hidden="true">กำลังสร้างโลกเล็ก ๆ ...</div>}><Journey paused={paused} onChapter={onChapter} onProgress={onProgress} /></Suspense>

    <header className="site-header"><a className="brand" href="#ground" aria-label="Suthep กลับจุดเริ่มต้น"><span className="brand-icon"><Mountain size={21} strokeWidth={1.7} /></span>suthep<span className="brand-period">.</span></a><nav className={menuOpen ? 'main-nav open' : 'main-nav'} aria-label="เมนูหลัก"><a href="#ground" onClick={() => setMenuOpen(false)}>จุดเริ่มต้น</a><a href="#mountain" onClick={() => setMenuOpen(false)}>เส้นทางของผม</a><a href="#sky" onClick={() => setMenuOpen(false)}>ผลงาน <span>{projects.length.toString().padStart(2, '0')}</span></a><a href="#space" onClick={() => setMenuOpen(false)}>ติดต่อ</a></nav><a className="header-contact" href="mailto:bananammm0001@gmail.com">Let’s talk <ArrowUpRight size={16} /></a><button className="menu-toggle icon-button" aria-label={menuOpen ? 'ปิดเมนู' : 'เปิดเมนู'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button></header>

    <aside className="chapter-rail" aria-label="เลือกบทของเรื่อง">{chapters.map((chapter, index) => <a key={chapter.id} href={`#${chapter.id}`} className={active === chapter.id ? 'active' : ''} aria-label={`บท ${index + 1} ${chapter.label}`} aria-current={active === chapter.id ? 'location' : undefined}><span className="rail-label">{chapter.label}</span><span className="rail-dot" /></a>)}<span className="rail-axis">THE JOURNEY</span></aside>

    <main id="main">
      <section id="ground" className="ground-section chapter">
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
        <div className="landscape-window" aria-hidden="true"><span className="landscape-note">ทุกก้าวเริ่มต้นจากความอยากรู้</span></div>
        <div className="hero-bottom">
          <p className="journey-intro">พื้นดิน <span>↗</span> ภูเขา <span>↗</span> ท้องฟ้า <span>↗</span> อวกาศ</p>
          <p className="journey-summary">เลื่อนลงเพื่อรู้จักผม ผ่านประสบการณ์ทำงาน ผลงานที่ทดลองสร้าง และเป้าหมายในก้าวต่อไป</p>
          <div className="hero-facts"><div className="hero-stat"><strong>4+</strong><span>ปีของประสบการณ์<br />พัฒนาซอฟต์แวร์</span></div><div className="hero-stat"><strong>{projects.length}</strong><span>โปรเจกต์ส่วนตัว<br />ที่ได้ลงมือสร้าง</span></div><div className="hero-social"><a href="https://github.com/unikonkon" target="_blank" rel="noreferrer" aria-label="GitHub"><Github size={18} /> GitHub</a><a href="https://www.linkedin.com/in/suthep-jantawee" target="_blank" rel="noreferrer" aria-label="LinkedIn"><Linkedin size={18} /> LinkedIn</a></div></div>
        </div>
        <div className="tech-strip"><span>เครื่องมือที่ใช้ทำงาน</span>{['React', 'Next.js', 'TypeScript', 'Node.js', 'PostgreSQL', 'Prisma', 'Docker'].map(tech => <span className="tech-name" key={tech}>{tech}</span>)}<Code2 size={20} /></div>
      </section>

      <Travel to={chapters[1]} />

      <section id="mountain" className="mountain-section chapter section-padding"><div className="chapter-content"><div className="chapter-heading"><span className="eyebrow">02 / ภูเขา · ประสบการณ์ทำงาน</span><span className="altitude">เรียนรู้จากความท้าทาย</span></div><div className="story-layout"><div><h2>เติบโตจากการแก้ปัญหา<br /><span className="chapter-subtitle">ทีละโปรเจกต์ ทีละก้าว</span></h2><p className="section-description">เหมือนการเดินขึ้นภูเขา งานแต่ละชิ้นทำให้ผมได้ฝึกทักษะใหม่ จากการสร้างหน้าจอที่ใช้งานง่าย ไปจนถึงการออกแบบ API ฐานข้อมูล และระบบที่ทำงานร่วมกันได้</p><div className="timeline"><article><span className="timeline-year"><span className="flag-mark" style={{ background: '#e8c46a' }} aria-hidden="true" />2015 — 2020</span><h3>เริ่มต้นจากความเข้าใจระบบ</h3><p>วิศวกรรมอิเล็กทรอนิกส์ · มหาวิทยาลัยเทคโนโลยีสุรนารี</p><p className="muted">เรียนรู้ IoT, Arduino และ ESP8266 พร้อมลงมือทำโครงงานวิศวกรรมเพื่อแก้ปัญหาให้เกษตรกร</p></article><article><span className="timeline-year"><span className="flag-mark" style={{ background: '#e2a27a' }} aria-hidden="true" />MAR — DEC 2022</span><h3>Frontend Developer <span>↗</span></h3><p>Vertobase Company</p><p className="muted">สร้างประสบการณ์บน React, Next.js และ Flutter ตั้งแต่ responsive UI จนถึง PIN login บน Zignway App</p></article><article><span className="timeline-year"><span className="flag-mark" style={{ background: '#c7ed91' }} aria-hidden="true" />FEB 2023 — PRESENT <span className="current-pill">ปัจจุบัน</span></span><h3>Full Stack Developer <span>↗</span></h3><p>iApp Technology</p><p className="muted">รับผิดชอบตั้งแต่ frontend, API และฐานข้อมูล ไปจนถึง data pipeline, CI/CD และแอป desktop พร้อมส่งมอบงานให้ลูกค้า</p></article></div><SceneLegend chapter={chapters[1]} /></div><div className="mountain-visual"><figure className="story-photo"><img src={photos.presenting} alt="สุเทพกำลังถือไมโครโฟนนำเสนอระบบผ่านโน้ตบุ๊กในห้องประชุม" width={1600} height={1200} loading="lazy" decoding="async" /><figcaption><span>ON THE JOB</span>นำเสนอสถาปัตยกรรม API และเดโมระบบให้ลูกค้าโดยตรง ตั้งแต่ออกแบบจนถึงส่งมอบ</figcaption></figure><div className="field-note"><span>สิ่งที่ยึดถือในการทำงาน</span><p>“เข้าใจปัญหาให้ลึก<br />แล้วค่อยสร้างสิ่งที่เรียบง่าย”</p><small>เข้าใจผู้ใช้ · ออกแบบให้ชัดเจน · ทดสอบก่อนส่งมอบ</small></div></div></div>
        <div className="work-panel"><div className="work-heading"><div><span className="eyebrow">โปรเจกต์จากการทำงาน</span><h3>สิ่งที่ผมได้มีส่วนพัฒนา</h3></div><span>{professionalProjects.length.toString().padStart(2, '0')} โปรเจกต์</span></div><div className="work-list">{(allWork ? professionalProjects : professionalProjects.slice(0, 4)).map((project, index) => <button className="work-row" key={project.title} onClick={() => setDetail(project)}><span className="work-index">0{index + 1}</span><div><h4>{project.title}</h4><span>{project.role}</span></div><span className="work-tech">{project.technologies.slice(0, 3).join(' / ')}</span><ArrowUpRight size={21} /></button>)}</div><button className="text-button all-work" onClick={() => setAllWork(!allWork)}>{allWork ? 'แสดงน้อยลง' : `ดูงานทั้งหมด ${professionalProjects.length} โปรเจกต์`} <ChevronDown size={16} className={allWork ? 'rotate' : ''} /></button></div></div>
      </section>

      <Travel to={chapters[2]} />

      <section id="sky" className="sky-section chapter section-padding"><div className="chapter-content"><div className="chapter-heading"><span className="eyebrow">03 / ท้องฟ้า · พื้นที่ทดลอง</span><span className="altitude">ต่อยอดสิ่งที่ได้เรียนรู้</span></div><div className="sky-intro"><div><h2>ลองสิ่งใหม่<br /><span className="chapter-subtitle">ให้ไอเดียได้ออกบิน</span></h2><p className="section-description">เมื่อมีพื้นฐานที่มั่นคง ผมก็อยากลองไปให้ไกลขึ้น โปรเจกต์เหล่านี้คือพื้นที่ทดลองของผม ตั้งแต่เว็บและแอป ไปจนถึง AI เพื่อเปลี่ยนสิ่งที่สงสัยให้เป็นผลงานที่เปิดใช้งานได้</p><SceneLegend chapter={chapters[2]} /></div></div>
        <div className="project-panel"><div className="project-controls"><div className="project-filters" aria-label="หมวดหมู่โปรเจกต์">{filters.map(item => <button key={item} className={filter === item ? 'selected' : ''} aria-label={item === filters[0] ? `${item} ${projects.length}` : item} aria-pressed={filter === item} onClick={() => chooseFilter(item)}>{item}{item === filters[0] && <span>{projects.length}</span>}</button>)}</div><label className="search-field"><Search size={16} /><input aria-label="ค้นหาโปรเจกต์" placeholder="ค้นหาโปรเจกต์..." value={query} onChange={event => { setQuery(event.target.value); setExpanded(false); }} /></label></div><div className="result-count" aria-live="polite">พบ {filtered.length} โปรเจกต์ · เลือกเพื่ออ่านรายละเอียด</div><div className="project-grid">{(expanded ? filtered : filtered.slice(0, 6)).map(project => <button className="project-card" key={project.id} onClick={() => setDetail(project)}>{hasScreenshot(project) ? <ProjectCover project={project} /> : <ProjectArt index={3} />}<div className="project-card-body"><div className="project-meta"><span>{project.type}</span><span>{project.index.padStart(2, '0')} /</span></div><h3>{project.title.replace(/^[^A-Za-z]+/, '')}<ArrowUpRight size={20} /></h3><p>{project.description}</p><div className="tags">{project.technologies.slice(0, 3).map(tech => <span key={tech}>{tech}</span>)}{project.technologies.length > 3 && <span>+{project.technologies.length - 3}</span>}</div></div></button>)}</div>{filtered.length === 0 && <div className="empty-state"><Search size={28} /><h3>ยังไม่พบโปรเจกต์ที่ค้นหา</h3><p>ลองชื่อเทคโนโลยี เช่น React, Next.js หรือ AI</p><button className="button secondary" onClick={() => { setQuery(''); chooseFilter(filters[0]); }}>ล้างการค้นหา</button></div>}{filtered.length > 6 && <div className="load-more"><button className="button secondary" onClick={() => setExpanded(!expanded)}>{expanded ? 'แสดงน้อยลง' : `สำรวจทั้งหมด ${filtered.length} โปรเจกต์`} {expanded ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}</button><span>แสดง {expanded ? filtered.length : 6} จาก {filtered.length} โปรเจกต์</span></div>}</div></div>
      </section>

      <Travel to={chapters[3]} />

      <section id="space" className="space-section chapter section-padding"><div className="chapter-content"><div className="chapter-heading"><span className="eyebrow">04 / อวกาศ · ก้าวต่อไป</span><span className="altitude">ยังมีสิ่งใหม่ให้เรียนรู้เสมอ</span></div><div className="space-layout"><div className="space-copy"><div className="availability"><span className="status-dot" /> พร้อมร่วมงานในโปรเจกต์ถัดไป</div><h2>มาสร้างสิ่งที่มีประโยชน์<br /><span className="chapter-subtitle">ไปด้วยกันครับ</span></h2><p>การเดินทางของผมยังไม่จบ ผมกำลังเรียนรู้ AI, RAG และการออกแบบระบบ พร้อมเปิดรับโอกาสในสาย Frontend, Backend และ Full Stack หากทีมของคุณมีโจทย์ที่อยากแก้ หรือโปรเจกต์ที่อยากพัฒนาต่อ ผมยินดีคุยและเรียนรู้ไปด้วยกันครับ</p><a className="button lime" href="mailto:bananammm0001@gmail.com">เริ่มต้นบทสนทนา <ArrowUpRight size={17} /></a><div className="email-row"><a href="mailto:bananammm0001@gmail.com"><Mail size={13} /> bananammm0001@gmail.com</a><button className="icon-button" aria-label={copied ? 'คัดลอกอีเมลแล้ว' : 'คัดลอกอีเมล'} onClick={copyEmail}>{copied ? <Check size={16} /> : <Copy size={16} />}</button><span className="copy-feedback" role="status">{copied ? 'คัดลอกแล้ว' : ''}</span></div><SceneLegend chapter={chapters[3]} /></div><figure className="space-portrait"><span className="planet-ring" aria-hidden="true" /><img src={photos.outdoor} alt="สุเทพ จันทวี สวมหมวกและสะพายเป้ พร้อมออกเดินทางครั้งต่อไป" width={936} height={1100} loading="lazy" decoding="async" /><figcaption><strong>พร้อมออกเดินทางบทถัดไป</strong><span>Frontend · Backend · Full Stack</span></figcaption></figure></div><div className="skills-footer"><span>สิ่งที่กำลังเรียนรู้ต่อ</span><span>AI & RAG</span><span>System design</span><span>กระบวนการพัฒนาซอฟต์แวร์</span><Sparkles size={18} /></div><footer><a className="brand" href="#ground"><span className="brand-icon"><Mountain size={19} /></span>suthep.</a><p>© {new Date().getFullYear()} Suthep Jantawee<br /><span>Crafted with code & curiosity.</span></p><div className="footer-social"><a href="https://github.com/unikonkon" target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={13} /></a><a href="https://www.linkedin.com/in/suthep-jantawee" target="_blank" rel="noreferrer">LinkedIn <ArrowUpRight size={13} /></a><a href={resumeUrl} download={resumeFileName}>Resume <Download size={13} /></a></div><a className="back-top" href="#ground" aria-label="กลับด้านบน"><ArrowDown size={18} /></a></footer></div></section>
    </main>
    <div className="journey-status"><span className="status-dot" /><span>{currentChapter.label} · {currentChapter.en}</span><span className="status-separator" /><span className="altimeter"><span ref={altimeter}>{currentChapter.altitude}</span></span><button className="motion-toggle" aria-label={paused ? 'เปิดภาพเคลื่อนไหว' : 'หยุดภาพเคลื่อนไหว'} aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? <Play size={12} /> : <Pause size={12} />}</button></div>
    <ProjectDialog detail={detail} close={() => setDetail(null)} />
  </div>;
}
