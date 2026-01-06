/**
 * 学习项目配置
 * 支持多个学习项目（MiniMind, MiniMind2 等）
 */

export interface StudyStepConfig {
  id: string;            // "quick_start" | "theory" | "code" | "quiz"
  name: string;
  duration: number;      // 分钟
  description: string;
}

export interface StudyModuleConfig {
  id: string;              // "01-foundation/01-normalization"
  title: string;           // "01. Normalization（归一化）"
  category: string;        // "foundation" | "architecture"
  order: number;
  estimatedTime: number;   // 分钟
  url: string;
  objectives: string[];
  steps: StudyStepConfig[];
}

export interface StudyProjectConfig {
  projectKey: string;
  name: string;
  description: string;
  resources: {
    website: string;
    github: string;
  };
  modules: StudyModuleConfig[];
  defaults: {
    startModule: string;
    studyStyle: string;
    reminderTime: string;
  };
}

export const STUDY_PROJECTS: Record<string, StudyProjectConfig> = {
  minimind: {
    projectKey: "minimind",
    name: "MiniMind 学习计划",
    description: "从零实现 LLM，深入理解每个设计选择",
    resources: {
      website: "https://minimind-notes.vercel.app/",
      github: "https://github.com/joyehuang/minimind-notes",
    },
    modules: [
      {
        id: "01-foundation/01-normalization",
        title: "01. Normalization（归一化）",
        category: "foundation",
        order: 1,
        estimatedTime: 60,
        url: "https://minimind-notes.vercel.app/modules/01-foundation/01-normalization/",
        objectives: [
          "理解梯度消失/爆炸问题的本质",
          "理解归一化如何稳定激活分布",
          "理解 RMSNorm vs LayerNorm 的区别",
          "理解 Pre-LN vs Post-LN 的优劣",
          "从零实现 RMSNorm"
        ],
        steps: [
          {
            id: "quick_start",
            name: "快速体验",
            duration: 10,
            description: "运行实验建立直觉"
          },
          {
            id: "theory",
            name: "理论学习",
            duration: 30,
            description: "阅读 teaching.md"
          },
          {
            id: "code",
            name: "代码实现",
            duration: 15,
            description: "查看 code_guide.md"
          },
          {
            id: "quiz",
            name: "自测巩固",
            duration: 5,
            description: "完成 quiz.md"
          }
        ]
      },
      // 更多模块将在管理员更新时同步
    ],
    defaults: {
      startModule: "01-foundation/01-normalization",
      studyStyle: "teacher",
      reminderTime: "19:00",
    },
  },
  // 未来可添加更多项目
  // minimind2: {
  //   projectKey: "minimind2",
  //   name: "MiniMind 2 进阶计划",
  //   description: "深入理解 LLM 训练优化",
  //   resources: {
  //     website: "https://minimind2-notes.vercel.app/",
  //     github: "https://github.com/joyehuang/minimind2-notes",
  //   },
  //   modules: [],
  //   defaults: {
  //     startModule: "01-optimization/01-adam",
  //     studyStyle: "teacher",
  //     reminderTime: "19:00",
  //   },
  // },
};

/**
 * 获取项目配置
 */
export function getProjectConfig(projectKey: string): StudyProjectConfig | undefined {
  return STUDY_PROJECTS[projectKey];
}

/**
 * 获取所有活跃项目
 */
export function getActiveProjects(): StudyProjectConfig[] {
  return Object.values(STUDY_PROJECTS);
}

/**
 * 验证项目是否存在
 */
export function isValidProject(projectKey: string): boolean {
  return projectKey in STUDY_PROJECTS;
}

/**
 * 获取特定模块配置
 */
export function getModuleConfig(projectKey: string, moduleId: string): StudyModuleConfig | undefined {
  const project = STUDY_PROJECTS[projectKey];
  if (!project) return undefined;

  return project.modules.find(m => m.id === moduleId);
}
