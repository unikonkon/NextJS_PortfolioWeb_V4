import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, Code2, Copy, Download, ExternalLink, Github, Linkedin, Mail, Menu, Mountain, Pause, Play, Search, Sparkles, X } from 'lucide-react';
import { projects, type Project } from '../data/personalProjects';
import { workProjects, type WorkProject } from '../data/workProject';
import resumeUrl from '../text Resume.txt?url';

const World = lazy(() => import('./World'));
type Detail = Project | WorkProject;
const chapters = [
  { id: 'ground', label: 'พื้นดิน', en: 'THE BEGINNING', altitude: '000' },
  { id: 'mountain', label: 'ภูเขา', en: 'THE CLIMB', altitude: '2,400' },
  { id: 'sky', label: 'ท้องฟ้า', en: 'THE EXPLORATION', altitude: '12,000' },
  { id: 'space', label: 'อวกาศ', en: 'THE NEXT FRONTIER', altitude: '∞' },
];
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
    <div className="dialog-inner"><button className="dialog-close icon-button" onClick={close} aria-label="ปิดรายละเอียด"><X /></button><span className="eyebrow">{personal ? detail.type : 'PROFESSIONAL WORK'}</span><h2 id="dialog-title">{detail.title}</h2><span className="role-label">{detail.role}</span><p className="detail-description">{detail.description}</p>{!personal && <><h3>สิ่งที่รับผิดชอบ</h3><ul className="feature-list">{detail.features.map(feature => <li key={feature}>{feature}</li>)}</ul></>}<h3>Tools & technologies</h3><div className="tags">{detail.technologies.map(tech => <span key={tech}>{tech}</span>)}</div><div className="dialog-links">{detail.demoUrl && <a className="button primary" href={detail.demoUrl} target="_blank" rel="noreferrer">เปิดเว็บไซต์ <ExternalLink size={15} /></a>}{repositories.map(([label, url]) => <a key={label} className="button secondary" href={url} target="_blank" rel="noreferrer"><Github size={15} />{label}</a>)}</div>{!detail.demoUrl && repositories.length === 0 && <p className="private-note">โปรเจกต์สำหรับองค์กร · ไม่มีลิงก์สาธารณะในข้อมูลต้นฉบับ</p>}</div>
  </dialog>;
}

export default function App() {
  const [active, setActive] = useState('ground');
  const [paused, setPaused] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filter, setFilter] = useState(filters[0]);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [allWork, setAllWork] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const currentChapter = chapters.find(chapter => chapter.id === active)!;
  const filtered = projects.filter(project => (filter === filters[0] || category(project) === filter) && `${project.title} ${project.description} ${project.technologies.join(' ')}`.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) setActive(entry.target.id); });
    }, { rootMargin: '-15% 0px -65% 0px', threshold: 0 });
    chapters.forEach(chapter => { const section = document.getElementById(chapter.id); if (section) observer.observe(section); });
    return () => { observer.disconnect(); clearTimeout(copyTimeout.current); };
  }, []);
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

  return <div className={`app ${paused ? 'motion-paused' : ''}`}>
    <a className="skip-link" href="#main">ข้ามไปเนื้อหา</a>
    <header className="site-header"><a className="brand" href="#ground" aria-label="Suthep กลับจุดเริ่มต้น"><span className="brand-icon"><Mountain size={21} strokeWidth={1.7} /></span>suthep<span className="brand-period">.</span></a><nav className={menuOpen ? 'main-nav open' : 'main-nav'} aria-label="เมนูหลัก"><a href="#ground" onClick={() => setMenuOpen(false)}>จุดเริ่มต้น</a><a href="#mountain" onClick={() => setMenuOpen(false)}>เส้นทางของผม</a><a href="#sky" onClick={() => setMenuOpen(false)}>ผลงาน <span>{projects.length.toString().padStart(2, '0')}</span></a><a href="#space" onClick={() => setMenuOpen(false)}>ติดต่อ</a></nav><a className="header-contact" href="mailto:bananammm0001@gmail.com">Let’s talk <ArrowUpRight size={16} /></a><button className="menu-toggle icon-button" aria-label={menuOpen ? 'ปิดเมนู' : 'เปิดเมนู'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button></header>

    <aside className={`chapter-rail ${active === 'space' ? 'rail-light' : ''}`} aria-label="เลือกบทของเรื่อง">{chapters.map((chapter, index) => <a key={chapter.id} href={`#${chapter.id}`} className={active === chapter.id ? 'active' : ''} aria-label={`บท ${index + 1} ${chapter.label}`} aria-current={active === chapter.id ? 'location' : undefined}><span className="rail-label">{chapter.label}</span><span className="rail-dot" /></a>)}<span className="rail-axis">THE JOURNEY</span></aside>

    <main id="main">
      <section id="ground" className="ground-section chapter">
        <div className="hero-topline"><span><span className="status-dot" /> OPEN TO NEW OPPORTUNITIES</span><span className="location">BASED IN THAILAND · UTC +7</span></div>
        <div className="hero-layout"><div className="hero-copy"><div className="eyebrow"><span className="tiny-line" /> A DEVELOPER’S WORLD</div><h1>Every great<br />journey starts<br />with <span className="serif-word">curiosity.</span><span className="heading-star">✳</span></h1><p className="intro-name">สวัสดีครับ ผม <strong>สุเทพ จันทวี</strong> <span className="wave">↗</span></p><p className="hero-description">Full Stack Developer ที่เปลี่ยนความสงสัยให้เป็นสิ่งที่ใช้งานได้จริง<br className="desktop-break" /> จากบรรทัดแรกของโค้ด สู่โลกของเว็บ แอป และ AI</p><div className="hero-actions"><a className="button primary" href="#mountain">ออกเดินทางด้วยกัน <ArrowDown size={16} /></a><a className="resume-link" href={resumeUrl} download="Suthep-Jantawee-Resume.txt">ดาวน์โหลดเรซูเม่ <Download size={15} /></a></div><div className="hero-social"><a href="https://github.com/unikonkon" target="_blank" rel="noreferrer" aria-label="GitHub"><Github size={17} /></a><a href="https://www.linkedin.com/in/suthep-jantawee" target="_blank" rel="noreferrer" aria-label="LinkedIn"><Linkedin size={17} /></a><span className="social-divider" /><span>DESIGN. DEVELOP. KEEP EXPLORING.</span></div></div>
        <div className="hero-world"><div className="world-orbit orbit-a" /><div className="world-orbit orbit-b" /><span className="scene-coordinate">13° N / 100° E <span>IMAGINATION IS THE LIMIT</span></span><Suspense fallback={<div className="scene-loading">กำลังสร้างโลกเล็ก ๆ ...</div>}><World kind="ground" paused={paused} /></Suspense><div className="scene-tag tag-top"><span>✦</span> A little world. Endless possibilities.</div><div className="scene-tag tag-bottom"><span className="status-dot" /> BUILT WITH CURIOSITY</div><span className="world-hint">ขยับเมาส์เพื่อสำรวจมุมมอง <span>↔</span></span></div></div>
        <div className="hero-bottom"><a href="#mountain" className="scroll-cue"><span className="scroll-icon"><ArrowDown size={16} /></span><span>SCROLL TO EXPLORE<small>ทุกการเดินทาง มีเรื่องราวระหว่างทาง</small></span></a><div className="hero-stat"><strong>4+</strong><span>YEARS OF<br />BUILDING THINGS</span></div><div className="hero-stat"><strong>{projects.length}+</strong><span>PERSONAL<br />EXPERIMENTS</span></div><div className="hero-chapter"><span>01 / 04</span><strong>THE BEGINNING</strong><small>เริ่มต้นจากพื้นดิน แล้วค่อย ๆ เติบโต</small></div></div>
        <div className="tech-strip"><span>MY EVERYDAY TOOLKIT</span>{['React', 'Next.js', 'TypeScript', 'Node.js', 'PostgreSQL', 'Prisma', 'Docker'].map(tech => <span className="tech-name" key={tech}>{tech}</span>)}<Code2 size={20} /></div>
      </section>

      <section id="mountain" className="mountain-section chapter section-padding"><div className="chapter-heading"><span className="eyebrow">01 — THE CLIMB</span><span className="altitude">ALTITUDE / 2,400 M</span></div><div className="story-layout"><div><h2>เติบโตทีละก้าว<br /><span className="serif-word">Build. Learn. Repeat.</span></h2><p className="section-description">จากวงจรอิเล็กทรอนิกส์ สู่การเชื่อมต่อทั้งระบบ<br />แต่ละโปรเจกต์คือภูเขาลูกใหม่ที่สอนให้ผมมองได้ไกลกว่าเดิม</p><div className="timeline"><article><span className="timeline-year">2015 — 2020</span><h3>เริ่มต้นจากความเข้าใจระบบ</h3><p>วิศวกรรมอิเล็กทรอนิกส์ · มหาวิทยาลัยเทคโนโลยีสุรนารี</p><p className="muted">เรียนรู้ IoT, Arduino และ ESP8266 พร้อมลงมือทำโครงงานวิศวกรรมเพื่อแก้ปัญหาให้เกษตรกร</p></article><article><span className="timeline-year">MAR — DEC 2022</span><h3>Frontend Developer <span>↗</span></h3><p>Vertobase Company</p><p className="muted">สร้างประสบการณ์บน React, Next.js และ Flutter ตั้งแต่ responsive UI จนถึง PIN login บน Zignway App</p></article><article><span className="timeline-year">FEB 2023 — PRESENT <span className="current-pill">ปัจจุบัน</span></span><h3>Full Stack Developer <span>↗</span></h3><p>iApp Technology</p><p className="muted">รับผิดชอบตั้งแต่ frontend, API และฐานข้อมูล ไปจนถึง data pipeline, CI/CD และแอป desktop พร้อมส่งมอบงานให้ลูกค้า</p></article></div></div><div className="mountain-visual"><Suspense fallback={null}><World kind="mountain" paused={paused} /></Suspense><div className="field-note"><span>FIELD NOTE / 001</span><p>“เข้าใจปัญหาให้ลึก<br />แล้วค่อยสร้างสิ่งที่เรียบง่าย”</p><small>MY APPROACH TO ENGINEERING</small></div></div></div>
        <div className="work-heading"><div><span className="eyebrow">BUILT IN THE REAL WORLD</span><h3>งานจริง · ความท้าทายจริง</h3></div><span>{professionalProjects.length.toString().padStart(2, '0')} SELECTED ENGAGEMENTS</span></div><div className="work-list">{(allWork ? professionalProjects : professionalProjects.slice(0, 4)).map((project, index) => <button className="work-row" key={project.title} onClick={() => setDetail(project)}><span className="work-index">0{index + 1}</span><div><h4>{project.title}</h4><span>{project.role}</span></div><span className="work-tech">{project.technologies.slice(0, 3).join(' / ')}</span><ArrowUpRight size={21} /></button>)}</div><button className="text-button all-work" onClick={() => setAllWork(!allWork)}>{allWork ? 'แสดงน้อยลง' : `ดูงานทั้งหมด ${professionalProjects.length} โปรเจกต์`} <ChevronDown size={16} className={allWork ? 'rotate' : ''} /></button>
      </section>

      <section id="sky" className="sky-section chapter section-padding"><div className="chapter-heading"><span className="eyebrow">02 — THE EXPLORATION</span><span className="altitude">ALTITUDE / 12,000 M</span></div><div className="sky-intro"><div><h2>ให้ไอเดียได้ออกบิน<br /><span className="serif-word">A space to experiment.</span></h2><p className="section-description">นอกเวลางานคือพื้นที่ของความอยากรู้<br />ทดลองเทคโนโลยีใหม่ สร้างเครื่องมือที่อยากใช้ และเรียนรู้จากการลงมือทำ</p></div><div className="sky-visual"><Suspense fallback={null}><World kind="sky" paused={paused} /></Suspense><span className="sky-note">made of code & a little curiosity ↗</span></div></div>
        <div className="project-controls"><div className="project-filters" aria-label="หมวดหมู่โปรเจกต์">{filters.map(item => <button key={item} className={filter === item ? 'selected' : ''} aria-pressed={filter === item} onClick={() => chooseFilter(item)}>{item}{item === filters[0] && <span>{projects.length}</span>}</button>)}</div><label className="search-field"><Search size={16} /><input aria-label="ค้นหาโปรเจกต์" placeholder="ค้นหาโปรเจกต์..." value={query} onChange={event => { setQuery(event.target.value); setExpanded(false); }} /></label></div><div className="result-count" aria-live="polite">{filtered.length} PROJECTS TO EXPLORE</div><div className="project-grid">{(expanded ? filtered : filtered.slice(0, 6)).map(project => <button className="project-card" key={project.id} onClick={() => setDetail(project)}><ProjectArt index={projects.indexOf(project)} /><div className="project-card-body"><div className="project-meta"><span>{project.type}</span><span>{project.index.padStart(2, '0')} /</span></div><h3>{project.title.replace(/^[^A-Za-z]+/, '')}<ArrowUpRight size={20} /></h3><p>{project.description}</p><div className="tags">{project.technologies.slice(0, 3).map(tech => <span key={tech}>{tech}</span>)}{project.technologies.length > 3 && <span>+{project.technologies.length - 3}</span>}</div></div></button>)}</div>{filtered.length === 0 && <div className="empty-state"><Search size={28} /><h3>ยังไม่พบโปรเจกต์ที่ค้นหา</h3><p>ลองชื่อเทคโนโลยี เช่น React, Next.js หรือ AI</p><button className="button secondary" onClick={() => { setQuery(''); chooseFilter(filters[0]); }}>ล้างการค้นหา</button></div>}{filtered.length > 6 && <div className="load-more"><button className="button secondary" onClick={() => setExpanded(!expanded)}>{expanded ? 'แสดงน้อยลง' : `สำรวจทั้งหมด ${filtered.length} โปรเจกต์`} {expanded ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}</button><span>{expanded ? filtered.length : 6} OF {filtered.length} EXPLORATIONS</span></div>}
      </section>

      <section id="space" className="space-section chapter section-padding"><div className="space-stars" /><div className="chapter-heading"><span className="eyebrow">03 — THE NEXT FRONTIER</span><span className="altitude">ALTITUDE / LIMITLESS</span></div><div className="space-layout"><div className="space-copy"><div className="availability"><span className="status-dot" /> READY FOR THE NEXT CHAPTER</div><h2>โลกใบต่อไป<br />เราอาจสร้างมัน<span className="serif-word">ด้วยกัน.</span></h2><p>ผมมองหาโอกาสในสาย Frontend, Backend และ Full Stack<br />ถ้าคุณมีปัญหาที่น่าสนใจ หรือไอเดียที่อยากทำให้เป็นจริง<br />มาเริ่มบทสนทนากันครับ</p><a className="button lime" href="mailto:bananammm0001@gmail.com">เริ่มต้นบทสนทนา <ArrowUpRight size={17} /></a><div className="email-row"><a href="mailto:bananammm0001@gmail.com">bananammm0001@gmail.com</a><button className="icon-button" aria-label={copied ? 'คัดลอกอีเมลแล้ว' : 'คัดลอกอีเมล'} onClick={copyEmail}>{copied ? <Check size={16} /> : <Copy size={16} />}</button><span className="copy-feedback" role="status">{copied ? 'คัดลอกแล้ว' : ''}</span></div></div><div className="space-visual"><Suspense fallback={null}><World kind="space" paused={paused} /></Suspense><span>STAY CURIOUS. KEEP BUILDING.</span></div></div><div className="skills-footer"><span>ALWAYS LEARNING</span><span>AI & RAG</span><span>System design</span><span>Better developer workflows</span><Sparkles size={18} /></div><footer><a className="brand" href="#ground"><span className="brand-icon"><Mountain size={19} /></span>suthep.</a><p>© {new Date().getFullYear()} Suthep Jantawee<br /><span>Crafted with code & curiosity.</span></p><div className="footer-social"><a href="https://github.com/unikonkon" target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={13} /></a><a href="https://www.linkedin.com/in/suthep-jantawee" target="_blank" rel="noreferrer">LinkedIn <ArrowUpRight size={13} /></a><a href={resumeUrl} download="Suthep-Jantawee-Resume.txt">Resume <Download size={13} /></a></div><a className="back-top" href="#ground" aria-label="กลับด้านบน"><ArrowDown size={18} /></a></footer></section>
    </main>
    <div className={`journey-status ${active === 'space' ? 'status-dark' : ''}`}><span className="status-dot" /><span>{currentChapter.en}</span><span className="status-separator" /><span>{currentChapter.altitude} M</span><button className="motion-toggle" aria-label={paused ? 'เปิดภาพเคลื่อนไหว' : 'หยุดภาพเคลื่อนไหว'} aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? <Play size={12} /> : <Pause size={12} />}</button></div>
    <ProjectDialog detail={detail} close={() => setDetail(null)} />
  </div>;
}
