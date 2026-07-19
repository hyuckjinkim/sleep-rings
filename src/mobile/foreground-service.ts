// Android-only: keeps the process (and the WebView's Web Audio graph) alive while backgrounded
// by running a foreground service with a persistent notification. See docs/android-build.md
// "백그라운드 재생" and audio-engine.md §6 1안. iOS has no equivalent — UIBackgroundModes: audio
// (Info.plist) + the silent <audio> keep-alive in background-audio.ts cover it there.
import { Capacitor } from '@capacitor/core'
import { ForegroundService, Importance } from '@capawesome-team/capacitor-android-foreground-service'

const NOTIFICATION_CHANNEL_ID = 'sleeprings_playback'
const NOTIFICATION_ID = 1

let channelReady = false

async function ensureChannel(): Promise<void> {
  if (channelReady) return
  await ForegroundService.createNotificationChannel({
    id: NOTIFICATION_CHANNEL_ID,
    name: 'Sleep sound playback',
    description: 'Shown while a sleep mix is playing in the background',
    importance: Importance.Low,
  })
  channelReady = true
}

/** Start the keep-alive foreground service + notification. No-op off Android. */
export async function startAndroidKeepAliveService(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return
  await ensureChannel()
  await ForegroundService.startForegroundService({
    id: NOTIFICATION_ID,
    title: 'SleepRings',
    body: 'Playing your sleep mix',
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
