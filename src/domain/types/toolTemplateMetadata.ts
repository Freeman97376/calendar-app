import type { AIProgressToolKind, AIToolActivationField } from '../schemas/ai.schema'

export type ToolTemplateCategory = 'system' | 'planning' | 'ai-demo'

export type ToolTemplateMetadata = {
  activationFields?: AIToolActivationField[]
  activationPrompt?: string
  adapterId?: 'ai-progress' | 'generic'
  capabilityTags?: string[]
  category?: ToolTemplateCategory
  description?: string
  id: string
  instantiable?: boolean
  label: string
  routeTags?: string[]
  toolKind?: AIProgressToolKind
  toolName?: string
}

export type ToolTemplateIntentMatch = {
  confidence: number
  matchedTerms: string[]
  reason: string
  template: ToolTemplateMetadata
}

export const fitnessActivationFields: AIToolActivationField[] = [
  {
    id: 'goal',
    label: 'Training goal',
    recommended: false,
    placeholder: 'Build strength, run 5K, improve mobility',
    type: 'text',
  },
  {
    id: 'level',
    label: 'Fitness level',
    recommended: false,
    type: 'select',
    defaultValue: 'beginner',
    options: [
      { label: 'Beginner', value: 'beginner' },
      { label: 'Intermediate', value: 'intermediate' },
      { label: 'Advanced', value: 'advanced' },
    ],
  },
  {
    id: 'equipment',
    label: 'Equipment',
    recommended: false,
    placeholder: 'Dumbbells, treadmill, none',
    type: 'text',
  },
  {
    accuracyImpact: 'Body-size context helps tune intensity and progression conservatively.',
    id: 'heightCm',
    label: 'Height cm',
    placeholder: '178',
    recommended: true,
    type: 'number',
  },
  {
    accuracyImpact: 'Weight context helps estimate workload and progression conservatively.',
    id: 'weightKg',
    label: 'Weight kg',
    placeholder: '76',
    recommended: true,
    type: 'number',
  },
  {
    accuracyImpact: 'Preferences reduce mismatched exercises and scheduling suggestions.',
    id: 'preferences',
    label: 'Preferences',
    placeholder: 'Morning sessions, low impact, no jumping',
    recommended: true,
    type: 'textarea',
  },
  {
    id: 'constraints',
    label: 'Constraints',
    recommended: false,
    placeholder: 'Knee pain, apartment-friendly, low impact',
    type: 'textarea',
  },
  {
    id: 'frequency',
    label: 'Weekly frequency',
    recommended: false,
    defaultValue: '3 times per week',
    type: 'text',
  },
  {
    id: 'sessionLength',
    label: 'Session length minutes',
    recommended: false,
    defaultValue: '45',
    type: 'number',
  },
  {
    id: 'preferredTime',
    label: 'Preferred time',
    recommended: false,
    defaultValue: '07:00',
    type: 'time',
  },
]

const learningActivationFields: AIToolActivationField[] = [
  {
    id: 'goal',
    label: 'Learning goal',
    recommended: false,
    placeholder: 'Ship a small AI agent demo',
    type: 'text',
  },
  {
    id: 'learningTrack',
    label: 'Learning track',
    placeholder: 'AI agents, SEO, retrieval, evaluation',
    recommended: true,
    accuracyImpact: 'A clear track improves milestone and resource selection.',
    type: 'text',
  },
  {
    id: 'level',
    label: 'Current level',
    recommended: false,
    defaultValue: 'beginner',
    type: 'select',
    options: [
      { label: 'Beginner', value: 'beginner' },
      { label: 'Intermediate', value: 'intermediate' },
      { label: 'Advanced', value: 'advanced' },
    ],
  },
  {
    id: 'weeklyTime',
    label: 'Weekly time',
    recommended: false,
    defaultValue: '3 hours per week',
    type: 'text',
  },
  {
    id: 'outcome',
    label: 'Target outcome',
    recommended: false,
    placeholder: 'Build a working portfolio project',
    type: 'textarea',
  },
  {
    id: 'preferredTime',
    label: 'Preferred time',
    recommended: false,
    defaultValue: '19:00',
    type: 'time',
  },
]

const genericPlanningActivationFields: AIToolActivationField[] = [
  {
    id: 'requirement',
    label: 'Requirement',
    placeholder: 'Describe the workflow this active tool should manage',
    recommended: true,
    accuracyImpact: 'The requirement anchors the active tool purpose and routing signals.',
    type: 'textarea',
  },
]

export const fitnessAIToolMetadata: ToolTemplateMetadata = {
  id: 'fitness-ai',
  label: 'Fitness AI',
  category: 'ai-demo',
  description: 'Memory-backed fitness planner with progress and calendar previews.',
  activationPrompt:
    'Describe the training goal, level, equipment, limits, weekly frequency, and session length.',
  activationFields: fitnessActivationFields,
  adapterId: 'ai-progress',
  capabilityTags: ['memory', 'calendar', 'progress'],
  instantiable: true,
  routeTags: [
    'fitness',
    'workout',
    'training',
    'exercise',
    'gym',
    'strength',
    'running',
    '\u5065\u8eab',
    '\u8bad\u7ec3',
    '\u8dd1\u6b65',
    '\u529b\u91cf',
    '\u953b\u70bc',
    '\u8fd0\u52a8',
  ],
  toolKind: 'fitness',
  toolName: 'Fitness AI',
}

export const agentLearningToolMetadata: ToolTemplateMetadata = {
  id: 'agent-learning',
  label: 'Agent Learning',
  category: 'ai-demo',
  description: 'Learning Assistant alias for AI agent learning milestones.',
  activationPrompt:
    'Describe the agent skill goal, current level, weekly time, and target learning outcome.',
  activationFields: learningActivationFields,
  adapterId: 'ai-progress',
  capabilityTags: ['memory', 'learning', 'progress'],
  instantiable: true,
  routeTags: [
    'agent',
    'learning',
    'prompt',
    'tool use',
    'retrieval',
    'memory',
    'evaluation',
    '\u667a\u80fd\u4f53',
    '\u5b66\u4e60',
    '\u63d0\u793a\u8bcd',
    '\u68c0\u7d22',
    '\u8bc4\u4f30',
  ],
  toolKind: 'agent-learning',
  toolName: 'Learning Assistant',
}

export const seoLearningToolMetadata: ToolTemplateMetadata = {
  id: 'seo-learning',
  label: 'SEO Learning',
  category: 'ai-demo',
  description: 'Learning Assistant alias for SEO learning milestones.',
  activationPrompt:
    'Describe the SEO learning goal, current level, weekly time, and target outcome.',
  activationFields: learningActivationFields,
  adapterId: 'ai-progress',
  capabilityTags: ['memory', 'learning', 'progress', 'seo'],
  instantiable: true,
  routeTags: [
    'seo',
    'keyword',
    'search engine',
    'ranking',
    'content',
    'technical seo',
    'analytics',
    '\u641c\u7d22\u4f18\u5316',
    '\u5173\u952e\u8bcd',
    '\u6392\u540d',
    '\u5185\u5bb9',
    '\u6d41\u91cf',
  ],
  toolKind: 'agent-learning',
  toolName: 'Learning Assistant',
}

export const fridgeToolMetadata: ToolTemplateMetadata = {
  id: 'fridge',
  label: 'Fridge',
  category: 'planning',
  description: 'Receipt and fridge planning helper.',
  activationPrompt:
    'Describe the fridge, receipt, meal planning, or inventory workflow this active tool should manage.',
  activationFields: genericPlanningActivationFields,
  adapterId: 'generic',
  capabilityTags: ['receipt', 'inventory'],
  instantiable: true,
  routeTags: [
    'fridge',
    'receipt',
    'inventory',
    'meal planning',
    'grocery',
    'food',
    '\u51b0\u7bb1',
    '\u98df\u6750',
    '\u6536\u636e',
    '\u5c0f\u7968',
    '\u83dc\u8c31',
    '\u505a\u996d',
    '\u5e93\u5b58',
  ],
  toolName: 'Fridge',
}

export const goalPlannerToolMetadata: ToolTemplateMetadata = {
  id: 'goal-planner',
  label: 'Goal Planner',
  category: 'planning',
  description: 'SQLite-backed goals, projects, milestones, and actions.',
  activationPrompt:
    'Describe the long-running goal or project workflow this active tool should manage.',
  activationFields: genericPlanningActivationFields,
  adapterId: 'generic',
  capabilityTags: ['memory', 'progress'],
  instantiable: true,
  routeTags: [
    'goal',
    'project',
    'milestone',
    'progress',
    'action item',
    '\u76ee\u6807',
    '\u9879\u76ee',
    '\u957f\u671f\u8ba1\u5212',
    '\u91cc\u7a0b\u7891',
    '\u8fdb\u5ea6',
  ],
  toolName: 'Goal Planner',
}

export const toolSessionsToolMetadata: ToolTemplateMetadata = {
  id: 'tool-sessions',
  label: 'Tool Sessions',
  category: 'planning',
  description: 'Reusable prompt presets that create calendar event drafts.',
  activationPrompt: 'Describe the recurring planning workflow this active tool should manage.',
  activationFields: genericPlanningActivationFields,
  adapterId: 'generic',
  capabilityTags: ['llm', 'calendar'],
  instantiable: true,
  routeTags: [
    'tool session',
    'preset',
    'calendar draft',
    'planning session',
    '\u5de5\u5177\u4f1a\u8bdd',
    '\u9884\u8bbe',
    '\u65e5\u5386\u8349\u7a3f',
    '\u89c4\u5212\u4f1a\u8bdd',
  ],
  toolName: 'Tool Sessions',
}

export const TOOL_TEMPLATE_METADATA: ToolTemplateMetadata[] = [
  toolSessionsToolMetadata,
  fitnessAIToolMetadata,
  agentLearningToolMetadata,
  seoLearningToolMetadata,
  fridgeToolMetadata,
  goalPlannerToolMetadata,
]
