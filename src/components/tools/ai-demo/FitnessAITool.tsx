import { fitnessActivationFields } from '../../../domain/types/toolTemplateMetadata'
import MemoryBackedAIDemoTool, { type Field } from './MemoryBackedAIDemoTool'

function demoField(field: (typeof fitnessActivationFields)[number]): Field {
  if (field.type === 'select') {
    return {
      defaultValue: field.defaultValue,
      id: field.id,
      label: field.label,
      options: field.options ?? [],
      type: 'select',
    }
  }

  return {
    defaultValue: field.defaultValue,
    id: field.id,
    label: field.label,
    placeholder: field.placeholder,
    type: field.type,
  }
}

const fields = fitnessActivationFields.map(demoField)

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
