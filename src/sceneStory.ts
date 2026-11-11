/** What the 3D scene says in words: the labels of its objects and the milestones of the journey. Kept free of
 *  three.js so App can use it without loading the 3D bundle. A label stays hidden until the page points at it (a
 *  hovered timeline entry, work row or legend item, or the chosen project filter); its `id` is what App sends to the
 *  scene for that. */
import { projects, type Project } from '../data/personalProjects';
import { workProjects } from '../data/workProject';

export const filters = ['ทั้งหมด', 'AI & Full Stack', 'Web & Mobile', 'API', 'Portfolio & Design'];
export function category(project: Project) {
  if (project.type === 'AI APP & FULL STACK') return filters[1];
  if (project.type === 'WEB APP' || project.type === 'MOBILE APP') return filters[2];
  if (project.type === 'API') return filters[3];
  return filters[4];
}
export const filterCounts = Object.fromEntries(filters.map(item => [item, item === filters[0] ? projects.length : projects.filter(project => category(project) === item).length]));
/** The four project categories, one floating island each in the sky chapter. */
export const projectCategories = filters.slice(1);

export interface SceneLabel {
  id: string;
  /** Raw journey progress (chapter index + fraction of its scroll) between which the label can show. */
  from: number;
  until: number;
  title: string;
  note: string;
  /** Which way the text runs from the point it marks. */
  side: 'left' | 'right';
}

// Raw progress: a chapter's own section covers the first 0.7 of its number, the flight to the next one the rest.
// A label can still be pointed at a little into the flight; it follows its object out of view.
const ground = { from: -1, until: 0.62 };
const mountain = { from: 0.94, until: 1.9 };
const sky = { from: 1.93, until: 2.9 };
const space = { from: 2.93, until: 5 };

export const sceneLabels: SceneLabel[] = [
  { id: 'bench', ...ground, title: 'โต๊ะทดลอง', note: 'IoT และ Arduino', side: 'left' },
  { id: 'farm', ...ground, title: 'แปลงผัก', note: 'โครงงาน IoT เพื่อเกษตรกร', side: 'right' },
  { id: 'path', ...ground, title: 'ทางเดิน', note: 'ขึ้นสู่ภูเขาลูกแรก', side: 'left' },
  { id: 'flag-0', ...mountain, title: '2020', note: 'จบวิศวกรรมอิเล็กทรอนิกส์', side: 'right' },
  { id: 'flag-1', ...mountain, title: '2022', note: 'Frontend Developer · Vertobase', side: 'right' },
  { id: 'flag-2', ...mountain, title: '2023', note: 'Full Stack Developer · iApp', side: 'right' },
  { id: 'summit', ...mountain, title: 'ยอดเขา', note: 'ตำแหน่งปัจจุบัน', side: 'left' },
  ...workProjects.map((project, index): SceneLabel => ({ id: `work-${index}`, ...mountain, title: `0${index + 1}`, note: project.title, side: 'right' })),
  ...projectCategories.map((name, index): SceneLabel => ({ id: `island-${index}`, ...sky, title: name, note: `${filterCounts[name]} โปรเจกต์`, side: index % 2 ? 'right' : 'left' })),
  { id: 'balloon', ...sky, title: 'บอลลูน', note: 'ไอเดียที่ปล่อยให้ลอย', side: 'right' },
  { id: 'planes', ...sky, title: 'เครื่องบินกระดาษ', note: 'การทดลองเล็ก ๆ', side: 'left' },
  { id: 'planet', ...space, title: 'AI & Code', note: 'โลกใบใหม่ที่กำลังสำรวจ', side: 'right' },
  { id: 'moon-0', ...space, title: 'System design', note: 'กำลังเรียนรู้', side: 'right' },
  { id: 'moon-1', ...space, title: 'กระบวนการพัฒนา', note: 'กำลังเรียนรู้', side: 'left' },
  { id: 'satellite', ...space, title: 'ดาวเทียม', note: 'ทักมาได้เสมอ', side: 'right' },
  { id: 'rocket', ...space, title: 'ยานอวกาศ', note: 'ออกเดินทางสู่บทถัดไป', side: 'left' },
];

/** Moments of the journey by the altitude the altimeter shows, for the caption beside it and the ticks on the route.
 *  The caption follows the chapter's name in the status bar, so a text never repeats that name. */
export const milestones = [
  { metres: 0, text: 'เขียนโค้ดบรรทัดแรก' },
  { metres: 470, text: 'เก็บเครื่องมือตามจุดพัก' },
  { metres: 1120, text: 'เริ่มงานแรก' },
  { metres: 2400, text: 'เล่าประสบการณ์ทำงาน' },
  { metres: 5510, text: 'ก้าวสู่มืออาชีพ' },
  { metres: 10000, text: 'ขึ้นเครื่องบิน' },
  { metres: 12000, text: `ทดลอง ${projects.length} โปรเจกต์` },
  { metres: 42800, text: 'ขึ้นยานอวกาศ' },
  { metres: 100000, text: 'ก้าวต่อไปเริ่มที่นี่' },
];
