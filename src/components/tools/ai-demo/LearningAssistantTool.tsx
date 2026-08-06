import MemoryBackedAIDemoTool, { type AIDemoToolModule, type Field } from './MemoryBackedAIDemoTool'

const levelOptions = [
  { label: 'Beginner', value: 'beginner' },
  { label: 'Some experience', value: 'some-experience' },
  { label: 'Experienced', value: 'experienced' },
]

function learningFields({
  goal,
  outcome,
  track,
}: {
  goal: string
  outcome: string
  track: string
}): Field[] {
  return [
    { id: 'goal', label: 'Learning goal', defaultValue: goal, type: 'text' },
    { id: 'learningTrack', label: 'Learning track', defaultValue: track, type: 'text' },
    {
      id: 'level',
      label: 'Current level',
      type: 'select',
      defaultValue: 'beginner',
      options: levelOptions,
    },
    { id: 'weeklyTime', label: 'Weekly time', defaultValue: '3 hours per week', type: 'text' },
    { id: 'outcome', label: 'Target outcome', defaultValue: outcome, type: 'text' },
    { id: 'preferredTime', label: 'Preferred study time', defaultValue: '19:00', type: 'time' },
  ]
}

const agentLearningModule: AIDemoToolModule = {
  alias: 'Agent Learning',
  defaultProjectDescription: 'Memory-backed AI agent learning route.',
  defaultProjectTitle: 'AI Agent Learning Demo',
  fields: learningFields({
    goal: 'Learn AI agent skills',
    outcome: 'ship a small AI agent demo',
    track: 'AI agent skills',
  }),
  id: 'agent-learning',
  routeKeywords: [
    'agent',
    'ai agent',
    'agent learning',
    'tool use',
    'prompt',
    'retrieval',
    'memory',
    'eval',
    '智能体',
    '代理',
    '工具调用',
  ],
  sourceToolId: 'agent-learning',
  toolKind: 'agent-learning',
  toolName: 'Learning Assistant',
}

const seoLearningModule: AIDemoToolModule = {
  alias: 'SEO Learning',
  defaultProjectDescription: 'Memory-backed SEO learning route.',
  defaultProjectTitle: 'SEO Learning Demo',
  fields: learningFields({
    goal: 'Learn SEO skills',
    outcome: 'build a repeatable SEO audit and content plan',
    track: 'SEO skills',
  }),
  id: 'seo-learning',
  routeKeywords: [
    'seo',
    'search engine',
    'keyword',
    'keywords',
    'on-page',
    'technical seo',
    'content',
    'ranking',
    '搜索',
    '搜索引擎',
    '关键词',
    '排名',
    '内容优化',
  ],
  sourceToolId: 'seo-learning',
  toolKind: 'agent-learning',
  toolName: 'Learning Assistant',
}

const learningAssistantModules = [agentLearningModule, seoLearningModule]

function withInitialModule(module: AIDemoToolModule): AIDemoToolModule[] {
  return [module, ...learningAssistantModules.filter((candidate) => candidate.id !== module.id)]
}

function LearningAssistantTool({ module }: { module: AIDemoToolModule }) {
  return <MemoryBackedAIDemoTool {...module} modules={withInitialModule(module)} />
}

export function AgentLearningTool() {
  return <LearningAssistantTool module={agentLearningModule} />
}

export function SeoLearningTool() {
  return <LearningAssistantTool module={seoLearningModule} />
}
