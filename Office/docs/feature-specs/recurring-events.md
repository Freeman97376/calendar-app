# Feature Spec: Recurring Events

> Status: Implemented (Phase 3) | Last updated: 2026-05-26

---

## User Story

> As a user, I want to create events that repeat on a schedule (daily standup, weekly review, monthly billing) so I don't have to re-enter them manually.

---

## Recurrence Rule Schema

Inspired by RFC 5545 (iCalendar RRULE) but simplified. Defined in `src/domain/schemas/recurrence.schema.ts`:

```typescript
const RecurrenceRuleSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'monthly', 'custom']),
  interval: z.number().int().min(1).default(1), // every N days/weeks/months
  daysOfWeek: z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  endCondition: z.discriminatedUnion('type', [
    z.object({ type: z.literal('never') }),
    z.object({ type: z.literal('date'), until: z.string().datetime() }),
    z.object({ type: z.literal('count'), occurrences: z.number().int().min(1) }),
  ]),
})
```

---

## Expansion Logic

`src/domain/logic/recurrence.ts` exports:

```typescript
function expandRecurrence(baseEvent: Event, rule: RecurrenceRule, viewRange: DateRange): Event[]
```

- Returns **only the instances that fall within `viewRange`** (never all instances)
- Each instance gets a unique `id` derived from `${baseEvent.id}_${isoDate}`
- The `masterId` field on each instance points back to `baseEvent.id`

**Why range-bounded?** A "forever" daily event could generate millions of instances. We only materialise what the current view needs.

---

## Editing Recurring Events

When a user edits a recurring event instance, a modal prompts:

| Choice                 | Behaviour                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| **This event**         | Create an exception record for this date; master rule unchanged                                           |
| **This and following** | Truncate master rule's end date to the day before; create a new master from this date with the new values |
| **All events**         | Update the master event record; all instances regenerate from the updated rule                            |

Exception records are stored with `exceptionFor: masterId` and `exceptionDate: isoDate`.

---

## Deletion Behaviour

Same three choices. "This event" adds the date to a `deletedOccurrences: string[]` array on the master record.

---

## Edge Cases to Test

| Case                                   | Expected                                                 |
| -------------------------------------- | -------------------------------------------------------- |
| Monthly event on Jan 31                | February occurrence moves to Feb 28 (or 29 in leap year) |
| Weekly event spanning a DST transition | Time stays the same clock time (not UTC-shifted)         |
| Recurring event with `count: 1`        | Only one instance ever created                           |
| Editing "all" changes the start time   | All instances regenerate with new time                   |
| Delete "this" on the first occurrence  | Instance hidden; master still has future instances       |

---

## UI: RecurrenceSelector Component

Located at `src/components/event/RecurrenceSelector.tsx`

Renders inside `EventForm`. Provides:

- Frequency dropdown (Does not repeat / Daily / Weekly / Monthly / Custom)
- Interval spinner ("Every N weeks")
- Days-of-week checkboxes (for weekly)
- End condition selector (Never / On date / After N occurrences)

Implementation status:

- Recurring creation is wired through `EventForm` and `eventStore`.
- Range-bounded expansion is wired into `useEvents`.
- Edit/delete scopes support this event, this and following, and all events.
- Count-limited following splits preserve only remaining occurrences when the rule itself is unchanged.
