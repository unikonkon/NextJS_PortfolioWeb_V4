export type ColorScheme = 'orange' | 'orangeLight' | 'blue' | 'yellow' | 'red' | 'green' | 'purple' | 'indigo' | 'cyan' | 'pink';

export interface WorkProject {
    title: string;
    role: string;
    description: string;
    technologies: string[];
    features: string[];
    icon: string;
    colorScheme: ColorScheme;
    demoUrl?: string;
}
  // Work projects data
export const workProjects: WorkProject[] = [
  {
    title: "NBTC - Drone Data Transmission",
    role: "Backend Developer",
    description: "Built and deployed an API for transmitting drone data to mobile and web clients in compliance with NBTC regulations.",
    technologies: ["JavaScript", "TypeScript", "PostgreSQL", "Express", "GitLab", "Jenkins", "Postman"],
    features: [
      "Built and deployed an API for transmitting drone data to mobile and web clients",
      "Presented the API architecture and functionality directly to the client"
    ],
    icon: "🚁",
    colorScheme: "blue" as const
  },
  {
    title: "ACT & ACT Phase 2",
    role: "Full Stack Developer",
    description: "Data-ingestion platform fetching project & company data from 3 government sources, with automated pipelines, risk assessment, and modern web views.",
    technologies: ["JavaScript", "TypeScript", "React", "Next.js", "Python", "PostgreSQL", "Elasticsearch", "Kibana", "Express", "GitLab", "Jenkins", "Postman", "Ant Design"],
    features: [
      "Designed and built the data-ingestion workflow to fetch project & company data from 3 government sources (EGP, DBD, GOV) and store it in the database",
      "Automated data-fetching pipelines with Jenkins, replacing manual execution",
      "Developed Python logic for project risk assessment and Excel export for project/company data",
      "Integrated Kibana and new database sources into the front-end views (MA data)",
      "Built the Phase 2 front-end web views"
    ],
    icon: "📊",
    colorScheme: "yellow" as const,
    demoUrl: "https://actai.co/"
  },
  {
    title: "iApp Speech Flow for Web",
    role: "Full Stack Developer",
    description: "Mobile-to-web migration with Electron desktop app deployment for cross-platform compatibility.",
    technologies: ["JavaScript", "TypeScript", "Next.js", "PostgreSQL", "Express", "GitLab", "Jenkins", "Postman", "NextUI", "TailwindCSS", "Electron"],
    features: [
      "Planned development and designed the code/workflow architecture for the web version",
      "Ported the mobile codebase to a Next.js web application",
      "Packaged the app as an Electron desktop build for macOS and Windows"
    ],
    icon: "💬",
    colorScheme: "green" as const
  },
  {
    title: "iisi · Hub of Talent",
    role: "Front-End Developer",
    description: "Talent recruitment platform with profile management system and role-based signup process. Features interactive profile browsing",
    technologies: ["JavaScript", "TypeScript", "React", "GitLab", "Jenkins", "Postman"],
    features: [
      "Integrated role-data APIs from signup into editable views per design",
      "Built the profile-like and profile-view flows connected to backend data"
    ],
    icon: "👥",
    colorScheme: "orange" as const
  },
  {
    title: "career-companion",
    role: "Front-End Developer",
    description: "Front-end maintenance and quality assurance for the career-companion application.",
    technologies: ["JavaScript", "TypeScript", "React", "GitLab", "Postman"],
    features: [
      "Fixed front-end bugs and corrected faulty application behavior",
      "Authored test-case documentation"
    ],
    icon: "🧭",
    colorScheme: "cyan" as const
  },
  {
    title: "digitaltouchpoint · Wellness Chatbot",
    role: "Full Stack Developer",
    description: "Wellness chatbot platform with signup flow, JWT authentication, and package pricing dashboard. Built with Next.js.",
    technologies: ["Next.js", "TypeScript", "JWT", "GitLab", "Jenkins", "Postman", "PostgreSQL"],
    features: [
      "Built Next.js APIs for the signup flow and package-pricing CRUD",
      "Implemented JWT authentication to secure user login and the signup process",
      "Created a dashboard to display package and user information",
      "Authored project documentation: user manual, security, performance, and test-case documents"
    ],
    icon: "🤖",
    colorScheme: "indigo" as const
  }
];
