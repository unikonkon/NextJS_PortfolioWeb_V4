export type ColorScheme = 'orange' | 'orangeLight' | 'blue' | 'yellow' | 'red' | 'green' | 'purple' | 'indigo' | 'cyan' | 'pink';

export interface WorkExperience {
  role: string;
  company: string;
  period: string;
}

export interface WorkProject {
  title: string;
  /** "Project" = งานส่งมอบให้ลูกค้า, "Product" = ผลิตภัณฑ์ของบริษัทเอง */
  kind: 'Project' | 'Product';
  role: string;
  /** สรุปสั้น ๆ ว่าโปรเจกต์นี้คืออะไร และทำอะไร (แสดงในรายการและหัวรายละเอียด) */
  summary: string;
  description: string;
  technologies: string[];
  /** สิ่งที่รับผิดชอบ ตามข้อความในเรซูเม่ */
  features: string[];
  icon: string;
  colorScheme: ColorScheme;
  demoUrl?: string;
}

// Employment context shown above the work-project list.
export const workExperience: WorkExperience = {
  role: "Full Stack Developer",
  company: "iApp Technology",
  period: "Feb 2023 - Present",
};

// Work projects data (order follows the resume)
export const workProjects: WorkProject[] = [
  {
    title: "NBTC - Drone Data Transmission",
    kind: "Project",
    role: "Backend Developer",
    summary: "ระบบรับส่งข้อมูลโดรนสำหรับ กสทช. (NBTC) เป็น API กลางที่รับข้อมูลการบินจากโดรน แล้วส่งต่อให้แอปมือถือและเว็บนำไปแสดงผลตามข้อกำหนดของ กสทช.",
    description: "Built and deployed an API for transmitting drone data to mobile and web clients in compliance with NBTC regulations.",
    technologies: ["JavaScript", "TypeScript", "PostgreSQL", "Express", "GitLab", "Jenkins", "Postman"],
    features: [
      "Built and deployed an API for transmitting drone data to mobile and web clients.",
      "Presented the API architecture and functionality directly to the client."
    ],
    icon: "🚁",
    colorScheme: "blue" as const
  },
  {
    title: "ACT & ACT Phase 2",
    kind: "Project",
    role: "Full Stack Developer",
    summary: "แพลตฟอร์มฐานข้อมูลโครงการจัดซื้อจัดจ้างภาครัฐ (ACT Ai) ดึงข้อมูลโครงการและบริษัทจาก 3 แหล่งของภาครัฐ (EGP, DBD, GOV) มาจัดเก็บ ประเมินความเสี่ยง ส่งออกเป็น Excel และแสดงผลบนหน้าเว็บ",
    description: "Data-ingestion platform fetching project & company data from 3 government sources, with automated pipelines, risk assessment, and modern web views.",
    technologies: ["JavaScript", "TypeScript", "React", "Next.js", "Python", "PostgreSQL", "Elasticsearch", "Kibana", "Express", "GitLab", "Jenkins", "Postman", "Ant Design"],
    features: [
      "Designed and built the data-ingestion workflow to fetch project & company data from 3 government sources (EGP, DBD, GOV) and store it in the database.",
      "Automated data-fetching pipelines with Jenkins, replacing manual execution.",
      "Developed Python logic for project risk assessment and Excel export for project/company data.",
      "Integrated Kibana and new database sources into the front-end views (MA data) and built the Phase 2 front-end web views."
    ],
    icon: "📊",
    colorScheme: "yellow" as const,
    demoUrl: "https://actai.co/"
  },
  {
    title: "iApp Speech Flow for Web",
    kind: "Product",
    role: "Full Stack Developer",
    summary: "ผลิตภัณฑ์แปลงเสียงพูดเป็นข้อความของ iApp ในเวอร์ชันเว็บ ย้ายจากแอปมือถือมาเป็นเว็บแอป Next.js และแพ็กเป็นแอป desktop สำหรับ macOS และ Windows",
    description: "Mobile-to-web migration with Electron desktop app deployment for cross-platform compatibility.",
    technologies: ["JavaScript", "TypeScript", "Next.js", "PostgreSQL", "Express", "GitLab", "Jenkins", "Postman", "NextUI", "TailwindCSS", "Electron"],
    features: [
      "Planned development and designed the code/workflow architecture for the web version.",
      "Ported the mobile codebase to a Next.js web application.",
      "Packaged the app as an Electron desktop build for macOS and Windows."
    ],
    icon: "💬",
    colorScheme: "green" as const
  },
  {
    title: "iisi · Hub of Talent",
    kind: "Project",
    role: "Front-End Developer",
    summary: "แพลตฟอร์มรวมโปรไฟล์และค้นหาบุคลากร (Hub of Talent) ผู้ใช้สมัครตามบทบาท สร้างและแก้ไขโปรไฟล์ของตนเอง แล้วเปิดดูโปรไฟล์ของผู้อื่นได้",
    description: "Talent recruitment platform with profile management system and role-based signup process. Features interactive profile browsing.",
    technologies: ["JavaScript", "TypeScript", "React", "GitLab", "Jenkins", "Postman"],
    features: [
      "Integrated role-data APIs from signup into editable views per design.",
      "Built the profile-like and profile-view flows connected to backend data."
    ],
    icon: "👥",
    colorScheme: "orange" as const
  },
  {
    title: "career-companion",
    kind: "Project",
    role: "Front-End Developer",
    summary: "แอปผู้ช่วยด้านอาชีพ งานที่รับผิดชอบคือดูแลฝั่งหน้าเว็บ แก้บั๊ก ปรับพฤติกรรมที่ทำงานผิดพลาด และจัดทำเอกสาร test case",
    description: "Front-end maintenance and quality assurance for the career-companion application.",
    technologies: ["JavaScript", "TypeScript", "React", "GitLab", "Postman"],
    features: [
      "Fixed front-end bugs and corrected faulty application behavior and authored test-case documentation."
    ],
    icon: "🧭",
    colorScheme: "cyan" as const
  },
  {
    title: "digitaltouchpoint · Wellness Chatbot",
    kind: "Project",
    role: "Full Stack Developer",
    summary: "แชตบอตด้านสุขภาพ (Wellness Chatbot) พร้อมระบบสมัครสมาชิก ล็อกอินด้วย JWT จัดการแพ็กเกจราคา และแดชบอร์ดแสดงข้อมูลแพ็กเกจกับผู้ใช้",
    description: "Wellness chatbot platform with signup flow, JWT authentication, and package pricing dashboard. Built with Next.js.",
    technologies: ["Next.js", "TypeScript", "JWT", "GitLab", "Jenkins", "Postman", "PostgreSQL"],
    features: [
      "Built Next.js APIs for the signup flow and package-pricing CRUD.",
      "Implemented JWT authentication to secure user login and the signup process.",
      "Created a dashboard to display package and user information.",
      "Authored project documentation: user manual, security, performance, and test-case documents."
    ],
    icon: "🤖",
    colorScheme: "indigo" as const
  },
  {
    title: "iApp EKYB",
    kind: "Product",
    role: "Backend Developer",
    summary: "ผลิตภัณฑ์ตรวจสอบข้อมูลนิติบุคคล (electronic Know Your Business) ดึงข้อมูลจากแหล่งที่กำหนดมาเก็บใน PostgreSQL แล้วเปิด REST API สำหรับค้นหา ให้คะแนนความเสี่ยง และตรวจสอบเป็นชุดสูงสุด 5,000 รายการต่อครั้ง",
    description: "Business-verification product with a Node.js data pipeline and an eKYB REST API for search, risk scoring, and batch lookup, delivered with OpenAPI spec, tests, and CI/CD.",
    technologies: ["Node.js", "PostgreSQL", "Redis", "OpenAPI", "Jenkins", "Docker", "GitLab", "Postman"],
    features: [
      "Built a Node.js data pipeline to extract records from designated sources with rate-limit handling and automated cookie management, designed the PostgreSQL schema to requirements, and ran load tests to determine source API limits.",
      "Developed the eKYB REST API (Node.js, PostgreSQL, Redis) for search, risk scoring, and 5,000-ID batch lookup, with OpenAPI spec, tests, Jenkins + Docker CI/CD, and per-endpoint architecture documentation."
    ],
    icon: "⌘",
    colorScheme: "green" as const
  }
];
