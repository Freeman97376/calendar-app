import { FirestoreAdapter } from '../storage/firestoreAdapter'
import { LocalStorageAdapter } from '../storage/localStorageAdapter'
import { SyncManager } from './syncManager'

export function createDefaultSyncManager(): SyncManager {
  const manager = new SyncManager(new LocalStorageAdapter(), new FirestoreAdapter())

  if (typeof window !== 'undefined') {
    manager.attachOnlineListener(window)
  }

  return manager
}
