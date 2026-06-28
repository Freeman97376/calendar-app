import MemoryBackedAIDemoTool from './MemoryBackedAIDemoTool'

const fields = [
  { id: 'goal', label: 'Learning goal', defaultValue: 'Learn AI agent skills', type: 'text' as const },
  {
    id: 'level',
    label: 'Current level',
    type: 'select' as const,
    defaultValue: 'beginner',
    options: [
      { label: 'Beginner', value: 'beginner' },
      { label: 'Some coding experience', value: 'some-coding' },
      { label: 'Experienced engineer', value: 'experienced' },
    ],
  },
  { id: 'weeklyTime', label: 'Weekly time', defaultValue: '3 hours per week', type: 'text' as const },
  { id: 'outcome', label: 'Target outcome', defaultValue: 'ship a small AI agent demo', type: 'text' as const },
  { id: 'preferredTime', label: 'Preferred study time', defaultValue: '19:00', type: 'time' as const },
]

export default function AgentLearningTool() {
  return (
    <MemoryBackedAIDemoTool
      defaultProjectDescription="Memory-backed AI agent learning route."
      defaultProjectTitle="AI Agent Learning Demo"
      fields={fields}
      sourceToolId="agent-learning"
      toolKind="agent-learning"
      toolName="Agent Learning"
    />
  )
}
