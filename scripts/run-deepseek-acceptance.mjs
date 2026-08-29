#!/usr/bin/env node

const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_MODEL = 'deepseek-chat'
const LIVE_CONFIRMATION_ENV = 'DEEPSEEK_ACCEPTANCE_LIVE'
const MAX_CASES_PER_RUN = 3
const REQUEST_TIMEOUT_MS = 45_000

const sharedSystemPrompt = [
  'You are responding to a low-cost Calendar App acceptance test.',
  'Return exactly one compact JSON object with the requested keys.',
  'Do not use Markdown or add commentary outside the JSON.',
  'Preserve confirmed facts exactly and do not create or apply calendar events.',
].join(' ')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertObject(value, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
}

function assertString(value, label) {
  assert(
    typeof value === 'string' && value.trim().length > 0,
    `${label} must be a non-empty string`,
  )
}

function assertArray(value, label, minimum = 0, maximum = Number.POSITIVE_INFINITY) {
  assert(Array.isArray(value), `${label} must be an array`)
  assert(value.length >= minimum, `${label} must contain at least ${minimum} item(s)`)
  assert(value.length <= maximum, `${label} must contain at most ${maximum} item(s)`)
}

function assertTitledItems(value, label, minimum, maximum) {
  assertArray(value, label, minimum, maximum)
  value.forEach((item, index) => {
    assertObject(item, `${label}[${index}]`)
    assertString(item.title, `${label}[${index}].title`)
  })
}

function assertNoCalendarWrites(value) {
  assertArray(value.calendar_actions, 'calendar_actions', 0, 0)
}

function parseJsonObject(content) {
  assertString(content, 'response content')
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  const candidate = fenced ?? (start >= 0 && end > start ? content.slice(start, end + 1) : content)
  const parsed = JSON.parse(candidate)
  assertObject(parsed, 'response JSON')
  return parsed
}

const CASES = [
  {
    id: 'goal-planner-initial-plan',
    name: 'Goal Planner reviewable initial plan',
    purpose: 'Validates a compact structured plan without calendar writes.',
    maxOutputTokens: 340,
    prompt: {
      task: 'Create a reviewable initial Goal Planner plan in Simplified Chinese.',
      confirmed_context: {
        current_situation: 'I have only a topic list and no study schedule.',
        outcome: 'Complete a small retrieval-augmented generation demo in six weeks.',
        weekly_capacity: '180 minutes',
        constraints: ['Weekday evenings only', 'Use free learning resources'],
      },
      requirements: {
        assumptions_max: 2,
        missing_information_max: 2,
        milestones_max: 2,
        actions_max: 3,
        no_calendar_writes: true,
      },
      response_json_schema: {
        template_id: 'goal-planner',
        title: 'string',
        summary: 'string',
        assumptions: ['string'],
        missing_information: [{ label: 'string', impact: 'string', blocking: false }],
        milestones: [{ title: 'string', description: 'string' }],
        actions: [{ title: 'string', description: 'string', estimated_minutes: 60 }],
        constraints: ['string'],
        risks: [{ label: 'string', severity: 'low|medium|high', mitigation: 'string' }],
        review_cadence: { frequency: 'weekly' },
        calendar_actions: [],
      },
    },
    validate(value) {
      assert(value.template_id === 'goal-planner', 'template_id must be goal-planner')
      assertString(value.title, 'title')
      assertString(value.summary, 'summary')
      assertArray(value.assumptions, 'assumptions', 0, 2)
      assertArray(value.missing_information, 'missing_information', 0, 2)
      assertTitledItems(value.milestones, 'milestones', 1, 2)
      assertTitledItems(value.actions, 'actions', 1, 3)
      assertArray(value.constraints, 'constraints', 1, 3)
      assertArray(value.risks, 'risks', 0, 2)
      assertObject(value.review_cadence, 'review_cadence')
      assert(value.review_cadence.frequency === 'weekly', 'review cadence must be weekly')
      assertNoCalendarWrites(value)
    },
  },
  {
    id: 'fitness-safety-plan',
    name: 'Fitness plan preserves explicit safety constraints',
    purpose: 'Validates conservative planning, explicit constraint handling, and no diagnosis.',
    maxOutputTokens: 380,
    prompt: {
      task: 'Create a reviewable Fitness AI initial plan in Simplified Chinese.',
      confirmed_context: {
        outcome: 'Build a consistent low-impact beginner routine.',
        current_level: 'Beginner',
        equipment: 'None',
        weekly_frequency: 2,
        session_length_minutes: 20,
        safety_constraint: 'Avoid high-impact jumping due to knee pain.',
        safety_constraint_confirmed: true,
      },
      requirements: {
        milestones_max: 2,
        actions_max: 3,
        conservative_non_medical_guidance: true,
        no_calendar_writes: true,
      },
      response_json_schema: {
        template_id: 'fitness-ai',
        title: 'string',
        summary: 'string',
        safety_confirmation: true,
        confirmed_facts: [
          { id: 'knee_constraint', value: 'Avoid high-impact jumping due to knee pain.' },
        ],
        constraints: ['string'],
        risks: [{ label: 'string', severity: 'low|medium|high', mitigation: 'string' }],
        milestones: [{ title: 'string', description: 'string' }],
        actions: [{ title: 'string', description: 'string' }],
        review_cadence: { frequency: 'weekly' },
        medical_diagnosis: false,
        calendar_actions: [],
      },
    },
    validate(value) {
      assert(value.template_id === 'fitness-ai', 'template_id must be fitness-ai')
      assertString(value.title, 'title')
      assertString(value.summary, 'summary')
      assert(value.safety_confirmation === true, 'safety_confirmation must be true')
      assertArray(value.confirmed_facts, 'confirmed_facts', 1, 3)
      const kneeFact = value.confirmed_facts.find((item) => item?.id === 'knee_constraint')
      assert(kneeFact, 'confirmed_facts must include knee_constraint')
      assert(
        kneeFact.value === 'Avoid high-impact jumping due to knee pain.',
        'the confirmed knee constraint must be preserved exactly',
      )
      assertArray(value.constraints, 'constraints', 1, 4)
      assertArray(value.risks, 'risks', 1, 3)
      assertTitledItems(value.milestones, 'milestones', 1, 2)
      assertTitledItems(value.actions, 'actions', 1, 3)
      assertObject(value.review_cadence, 'review_cadence')
      assert(value.review_cadence.frequency === 'weekly', 'review cadence must be weekly')
      assert(value.medical_diagnosis === false, 'medical_diagnosis must be false')
      assertNoCalendarWrites(value)
    },
  },
  {
    id: 'plan-revision-preserves-facts',
    name: 'AI revision changes only requested plan fields',
    purpose:
      'Validates that revising a draft preserves confirmed facts and avoids calendar writes.',
    maxOutputTokens: 180,
    prompt: {
      task: 'Revise the supplied Fitness AI draft and return the complete compact JSON draft.',
      revision_instruction:
        'Change weekly frequency to 2 and session length to 25 minutes. Preserve every confirmed fact exactly.',
      current_draft: {
        template_id: 'fitness-ai',
        weekly_frequency: 3,
        session_length_minutes: 20,
        confirmed_facts: [
          {
            id: 'knee_constraint',
            value: 'Avoid high-impact jumping due to knee pain.',
          },
        ],
      },
      response_json_schema: {
        template_id: 'fitness-ai',
        weekly_frequency: 2,
        session_length_minutes: 25,
        confirmed_facts: [
          { id: 'knee_constraint', value: 'Avoid high-impact jumping due to knee pain.' },
        ],
        change_summary: 'string',
        calendar_actions: [],
      },
    },
    validate(value) {
      assert(value.template_id === 'fitness-ai', 'template_id must remain fitness-ai')
      assert(value.weekly_frequency === 2, 'weekly_frequency must be 2')
      assert(value.session_length_minutes === 25, 'session_length_minutes must be 25')
      assertArray(value.confirmed_facts, 'confirmed_facts', 1, 1)
      assert(value.confirmed_facts[0]?.id === 'knee_constraint', 'confirmed fact id changed')
      assert(
        value.confirmed_facts[0]?.value === 'Avoid high-impact jumping due to knee pain.',
        'confirmed fact value changed',
      )
      assertString(value.change_summary, 'change_summary')
      assertNoCalendarWrites(value)
    },
  },
]

function parseArguments(argv) {
  const selectedIds = []
  let live = false
  let list = argv.length === 0
  let showOutput = false

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--live') {
      live = true
    } else if (argument === '--list' || argument === '--dry-run') {
      list = true
    } else if (argument === '--show-output') {
      showOutput = true
    } else if (argument === '--case') {
      const id = argv[index + 1]
      assertString(id, '--case value')
      selectedIds.push(id)
      index += 1
    } else if (argument === '--help' || argument === '-h') {
      printUsage()
      process.exit(0)
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }

  assert(!(live && list), 'Choose either --live or --list/--dry-run, not both.')
  return { live, list, selectedIds, showOutput }
}

function selectedCases(selectedIds) {
  if (!selectedIds.length) return CASES
  const uniqueIds = [...new Set(selectedIds)]
  const cases = uniqueIds.map((id) => {
    const testCase = CASES.find((candidate) => candidate.id === id)
    assert(testCase, `Unknown case: ${id}`)
    return testCase
  })
  assert(cases.length <= MAX_CASES_PER_RUN, `At most ${MAX_CASES_PER_RUN} cases may run.`)
  return cases
}

function endpointFor(baseUrl) {
  const url = new URL(baseUrl)
  assert(url.protocol === 'https:', 'DEEPSEEK_BASE_URL must use HTTPS.')
  const path = url.pathname.replace(/\/+$/, '')
  url.pathname = path.endsWith('/chat/completions') ? path : `${path}/chat/completions`
  return url.toString()
}

function promptCharacters(testCase) {
  return sharedSystemPrompt.length + JSON.stringify(testCase.prompt).length
}

function printUsage() {
  console.log(`Usage:
  node scripts/run-deepseek-acceptance.mjs --list
  node scripts/run-deepseek-acceptance.mjs --live [--case <id>] [--show-output]

Live calls require:
  DEEPSEEK_ACCEPTANCE_LIVE=1
  DEEPSEEK_API_KEY=<backend-only key>

Optional:
  DEEPSEEK_BASE_URL=${DEFAULT_BASE_URL}
  DEEPSEEK_MODEL=${DEFAULT_MODEL}`)
}

function printCases(cases) {
  const totalMaxOutputTokens = cases.reduce(
    (total, testCase) => total + testCase.maxOutputTokens,
    0,
  )
  console.log('DeepSeek live acceptance cases (no network call):')
  for (const testCase of cases) {
    console.log(
      `- ${testCase.id}: ${testCase.name}; 1 request; max output ${testCase.maxOutputTokens} tokens; prompt ${promptCharacters(testCase)} chars`,
    )
    console.log(`  ${testCase.purpose}`)
  }
  console.log(
    `Maximum for this selection: ${cases.length} sequential request(s), ${totalMaxOutputTokens} output tokens, zero retries.`,
  )
}

function safeProviderError(raw) {
  try {
    const payload = JSON.parse(raw)
    const message = payload?.error?.message
    if (typeof message === 'string' && message.trim()) return message.trim().slice(0, 400)
  } catch {
    // Fall back to a short provider response below.
  }
  return raw.trim().slice(0, 400) || 'Provider returned an empty error response.'
}

async function runCase(testCase, config) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const startedAt = performance.now()

  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: sharedSystemPrompt },
          { role: 'user', content: JSON.stringify(testCase.prompt) },
        ],
        max_tokens: testCase.maxOutputTokens,
        response_format: { type: 'json_object' },
        stream: false,
        temperature: 0,
      }),
      signal: controller.signal,
    })
    const raw = await response.text()
    if (!response.ok) {
      throw new Error(`DeepSeek HTTP ${response.status}: ${safeProviderError(raw)}`)
    }

    const payload = JSON.parse(raw)
    const content = payload?.choices?.[0]?.message?.content
    const value = parseJsonObject(content)
    testCase.validate(value)

    return {
      durationMs: Math.round(performance.now() - startedAt),
      output: value,
      usage: payload.usage ?? null,
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  const cases = selectedCases(options.selectedIds)

  if (options.list || !options.live) {
    printCases(cases)
    return
  }

  assert(
    process.env[LIVE_CONFIRMATION_ENV] === '1',
    `Refusing live calls unless ${LIVE_CONFIRMATION_ENV}=1 is set explicitly.`,
  )
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  assert(apiKey, 'DEEPSEEK_API_KEY is required for live acceptance.')
  const endpoint = endpointFor(process.env.DEEPSEEK_BASE_URL?.trim() || DEFAULT_BASE_URL)
  const model = process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL

  printCases(cases)
  console.log(`Live target: ${new URL(endpoint).origin}; model: ${model}`)
  console.log('Starting sequential, fail-fast execution...')

  let promptTokens = 0
  let completionTokens = 0
  let totalTokens = 0

  for (const testCase of cases) {
    const result = await runCase(testCase, { apiKey, endpoint, model })
    const usage = result.usage
    if (usage) {
      promptTokens += Number(usage.prompt_tokens || 0)
      completionTokens += Number(usage.completion_tokens || 0)
      totalTokens += Number(usage.total_tokens || 0)
    }
    console.log(
      `[PASS] ${testCase.id} (${result.durationMs} ms)${
        usage
          ? `; tokens prompt=${usage.prompt_tokens ?? '?'} completion=${usage.completion_tokens ?? '?'} total=${usage.total_tokens ?? '?'}`
          : '; provider usage unavailable'
      }`,
    )
    if (options.showOutput) console.log(JSON.stringify(result.output, null, 2))
  }

  console.log(
    `[PASS] ${cases.length}/${cases.length} case(s); reported tokens prompt=${promptTokens} completion=${completionTokens} total=${totalTokens}`,
  )
}

main().catch((error) => {
  const message =
    error?.name === 'AbortError'
      ? `DeepSeek request exceeded ${REQUEST_TIMEOUT_MS} ms.`
      : error instanceof Error
        ? error.message
        : String(error)
  console.error(`[FAIL] ${message}`)
  process.exitCode = 1
})
