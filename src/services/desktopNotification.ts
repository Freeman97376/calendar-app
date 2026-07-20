import { isTauri } from '@tauri-apps/api/core'
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification'

let lastNotificationSignature = ''

export async function notifyPendingGoalCheckIns(
  items: Array<{ check_in_id: string; project_title?: string }>,
) {
  if (!isTauri() || !items.length) return
  const signature = items
    .map((item) => item.check_in_id)
    .sort()
    .join('|')
  if (signature === lastNotificationSignature) return
  let granted = await isPermissionGranted()
  if (!granted) granted = (await requestPermission()) === 'granted'
  if (!granted) return
  lastNotificationSignature = signature
  const firstTitle = items[0]?.project_title?.trim()
  sendNotification({
    title: 'Calendar App · Goal Check-in',
    body:
      items.length === 1
        ? `${firstTitle || 'A long-term goal'} is ready for a Check-in.`
        : `${items.length} long-term goals are ready for Check-in.`,
  })
}
