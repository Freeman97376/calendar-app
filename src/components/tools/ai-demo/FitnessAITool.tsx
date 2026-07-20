import MemoryBackedAIDemoTool from './MemoryBackedAIDemoTool'

const fields = [
  {
    id: 'goal',
    label: 'Training goal',
    placeholder: 'Build strength, run 5K, improve mobility',
    type: 'text' as const,
  },
  {
    id: 'level',
    label: 'Fitness level',
    type: 'select' as const,
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
    placeholder: 'Dumbbells, treadmill, none',
    type: 'text' as const,
  },
  {
    id: 'constraints',
    label: 'Constraints',
    placeholder: 'Knee pain, apartment-friendly, low impact',
    type: 'textarea' as const,
  },
  {
    id: 'frequency',
    label: 'Weekly frequency',
    defaultValue: '3 times per week',
    type: 'text' as const,
  },
  {
    id: 'sessionLength',
    label: 'Session length minutes',
    defaultValue: '45',
    type: 'number' as const,
  },
  { id: 'preferredTime', label: 'Preferred time', defaultValue: '07:00', type: 'time' as const },
]

export default function FitnessAITool() {
  return (
    <MemoryBackedAIDemoTool
      defaultProjectDescription="Memory-backed fitness AI demo plan."
      defaultProjectTitle="Fitness AI Demo"
      fields={fields}
      sourceToolId="fitness-ai"
      toolKind="fitness"
      toolName="Fitness AI"
    />
  )
}
