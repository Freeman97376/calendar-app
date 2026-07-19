import { getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app'
import { getFirestore, type Firestore } from 'firebase/firestore'

// Legacy-only adapter retained for migration tests. The production application
// does not import this module; use scripts/export-legacy-firebase.mjs instead.
export const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
}

export function hasFirebaseConfig(config: FirebaseOptions = firebaseConfig): boolean {
  return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId)
}

export const isFirebaseConfigured = hasFirebaseConfig()
export const app: FirebaseApp | null = isFirebaseConfigured
  ? (getApps()[0] ?? initializeApp(firebaseConfig))
  : null
export const db: Firestore | null = app ? getFirestore(app) : null
