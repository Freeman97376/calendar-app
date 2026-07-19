import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

import { initializeApp } from 'firebase/app'
import { collection, getDocs, getFirestore } from 'firebase/firestore'

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required. See .env.legacy.example.`)
  return value
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stable(item)]),
    )
  }
  return value
}

async function main() {
  const userId = required('FIREBASE_LEGACY_USER_ID')
  const app = initializeApp({
    apiKey: required('FIREBASE_LEGACY_API_KEY'),
    appId: required('FIREBASE_LEGACY_APP_ID'),
    authDomain: process.env.FIREBASE_LEGACY_AUTH_DOMAIN,
    messagingSenderId: process.env.FIREBASE_LEGACY_MESSAGING_SENDER_ID,
    projectId: required('FIREBASE_LEGACY_PROJECT_ID'),
    storageBucket: process.env.FIREBASE_LEGACY_STORAGE_BUCKET,
  })
  const snapshot = await getDocs(collection(getFirestore(app), 'users', userId, 'events'))
  const entities = {
    actions: [],
    eventTypes: [],
    events: snapshot.docs.map((document) => ({ id: document.id, ...document.data() })),
    fridgeItems: [],
    goals: [],
    milestones: [],
    planningRuns: [],
    preferences: {},
    progress: [],
    projects: [],
    todos: [],
    toolPresets: [],
    toolRuns: [],
  }
  const checksum = createHash('sha256').update(JSON.stringify(stable(entities))).digest('hex')
  const backup = {
    checksum,
    entities,
    exportedAt: new Date().toISOString(),
    formatVersion: 1,
  }
  const outputPath = resolve(process.argv[2] || `legacy-firebase-${Date.now()}.json`)
  await writeFile(outputPath, `${JSON.stringify(backup, null, 2)}\n`, 'utf8')
  process.stdout.write(`Exported ${entities.events.length} event(s) to ${outputPath}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
