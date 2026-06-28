import { getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app'
import { getFirestore, type Firestore } from 'firebase/firestore'

import { RuntimeConfigService } from '../config/runtimeConfigService'

function getRuntimeConfig() {
  try {
    return new RuntimeConfigService().getConfig()
  } catch {
    return null
  }
}

const runtimeConfig = getRuntimeConfig()

export const firebaseConfig: FirebaseOptions = {
  apiKey: runtimeConfig?.firebaseApiKey ?? import.meta.env.VITE_FIREBASE_API_KEY,
  appId: runtimeConfig?.firebaseAppId ?? import.meta.env.VITE_FIREBASE_APP_ID,
  authDomain: runtimeConfig?.firebaseAuthDomain ?? import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  messagingSenderId:
    runtimeConfig?.firebaseMessagingSenderId ?? import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  projectId: runtimeConfig?.firebaseProjectId ?? import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: runtimeConfig?.firebaseStorageBucket ?? import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
}

export function hasFirebaseConfig(config: FirebaseOptions = firebaseConfig): boolean {
  return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId)
}

export const isFirebaseConfigured = hasFirebaseConfig()
export const app: FirebaseApp | null = isFirebaseConfigured
  ? (getApps()[0] ?? initializeApp(firebaseConfig))
  : null
export const db: Firestore | null = app ? getFirestore(app) : null
