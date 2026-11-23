// Android-only: keeps the process (and the WebView's Web Audio graph) alive while backgrounded
// by running a foreground service with a persistent notification. See docs/android-build.md
// "백그라운드 재생" and audio-engine.md §6 1안. iOS has no equivalent — UIBackgroundModes: audio
// (Info.plist) + the silent <audio> keep-alive in backgroundAudio.ts cover it there.
import { Capacitor } from '@capacitor/core'
import { ForegroundService, Importance } from '@capawesome-team/capacitor-android-foreground-service'

const NOTIFICATION_CHANNEL_ID = 'sleeprings_playback'
const NOTIFICATION_ID = 1

/** Translated by the caller (main.tsx) — this module stays i18n-free. */
export interface KeepAliveNotificationText {
  title: string
  body: string
  channelName: string
  channelDescription: string
}

let channelReady = false

async function ensureChannel(text: KeepAliveNotificationText): Promise<void> {
  if (channelReady) return
  await ForegroundService.createNotificationChannel({
    id: NOTIFICATION_CHANNEL_ID,
    name: text.channelName,
    description: text.channelDescription,
    importance: Importance.Low,
  })
  channelReady = true
}

/** Start the keep-alive foreground service + notification. No-op off Android. */
export async function startAndroidKeepAliveService(text: KeepAliveNotificationText): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return
  await ensureChannel(text)
  await ForegroundService.startForegroundService({
    id: NOTIFICATION_ID,
    title: text.title,
    body: text.body,
    smallIcon: 'ic_stat_sleeprings',
    silent: true,
    notificationChannelId: NOTIFICATION_CHANNEL_ID,
  })
}

/** Stop the keep-alive foreground service. No-op off Android. */
export async function stopAndroidKeepAliveService(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return
  await ForegroundService.stopForegroundService()
}
