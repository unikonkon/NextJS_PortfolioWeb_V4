export interface SkillCategory {
  name: string;
  path: string;
  icon: string;
  skills: string[];
}

export const skillCategories: SkillCategory[] = [
  {
    name: "Languages",
    path: "~/languages",
    icon: "{ }",
    skills: ["HTML", "CSS", "JavaScript", "TypeScript", "Dart", "SQL"],
  },
  {
    name: "Frameworks & Libraries",
    path: "~/frameworks",
    icon: "< />",
    skills: ["React", "React Native", "Next.js", "NestJS", "Flutter", "Express.js", "Electron", "Tailwind CSS", "Ant Design", "DaisyUI"],
  },
  {
    name: "Databases & Data Tools",
    path: "~/databases",
    icon: "DB",
    skills: ["PostgreSQL", "Kibana", "Firebase", "Prisma", "Supabase"],
  },
  {
    name: "DevOps & CI/CD Tools",
    path: "~/devops",
    icon: ">>",
    skills: ["Git Version Control", "Jenkins", "Vercel", "Docker"],
  },
  {
    name: "Testing & API Tools",
    path: "~/testing",
    icon: "QA",
    skills: ["Postman", "Jest", "SonarQube", "Playwright"],
  },
  {
    name: "Design & Collaboration Tools",
    path: "~/design",
    icon: "UI",
    skills: ["Figma", "Draw.io (Diagrams.net)", "ExpoGo", "Slack", "Lark", "Discord"],
  },
  {
    name: "AI Tools",
    path: "~/ai-tools",
    icon: "AI",
    skills: ["Claude Code", "Cursor", "Gemini", "Google Gemini API", "Z.ai", "ChatGPT", "Codex", "lovable.dev", "Antigravity", "Stitch AI"],
  },
  {
    name: "Soft Skills",
    path: "~/soft-skills",
    icon: "✦",
    skills: ["Creativity", "Critical thinking", "Responsibility", "Problem solving", "Communication", "Teamwork"],
  },
];
