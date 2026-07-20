import type { ToolPreset } from '../../../types'
import { TOOL_SESSION_OUTPUT_SCHEMA_KEY } from '../shared/outputSchema'

export const diningPlannerPreset: ToolPreset = {
  id: 'dining-planner',
  label: 'Dining Planner',
  description: 'Plan a dining flow as individual calendar items.',
  isBuiltIn: true,
  outputSchemaKey: TOOL_SESSION_OUTPUT_SCHEMA_KEY,
  defaultLlmOptions: { provider: 'global' },
  prompt: [
    'Create an individual calendar breakdown for a dining plan.',
    'Use the supplied inputs to create separate events such as shopping, prep, reservation follow-up, dining, cleanup, or travel when relevant.',
    'Every event must be useful on its own and include displayDetails that can be shown in the calendar.',
    'Use ISO datetimes and keep the event count practical.',
  ].join('\n'),
  fields: [
    { id: 'date', label: 'Date', required: true, type: 'date' },
    { id: 'time', label: 'Dining time', defaultValue: '19:00', required: true, type: 'time' },
    {
      id: 'mealType',
      label: 'Meal type',
      defaultValue: 'dinner',
      required: true,
      type: 'select',
      options: [
        { label: 'Breakfast', value: 'breakfast' },
        { label: 'Brunch', value: 'brunch' },
        { label: 'Lunch', value: 'lunch' },
        { label: 'Dinner', value: 'dinner' },
      ],
    },
    {
      id: 'cuisine',
      label: 'Cuisine',
      placeholder: 'Italian, hot pot, sushi',
      required: false,
      type: 'text',
    },
    {
      id: 'guests',
      label: 'Guests',
      placeholder: '2 friends, family of 4',
      required: false,
      type: 'text',
    },
    { id: 'dietaryNotes', label: 'Dietary notes', required: false, type: 'textarea' },
    { id: 'budget', label: 'Budget', placeholder: '$80 total', required: false, type: 'text' },
    {
      id: 'locationPreference',
      label: 'Location / prep',
      defaultValue: 'restaurant',
      required: false,
      type: 'select',
      options: [
        { label: 'Restaurant', value: 'restaurant' },
        { label: 'Cook at home', value: 'cook-at-home' },
        { label: 'Takeout', value: 'takeout' },
      ],
    },
  ],
}
