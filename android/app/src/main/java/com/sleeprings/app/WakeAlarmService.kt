package com.sleeprings.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat

/**
 * Rings the closed-app wake alarm: the device's alarm tone on the alarm stream, faded in, with a
 * Stop notification. Stops on Stop, on opening the app (WakeAlarmPlugin), on a JS cancel, or after
 * RING_AFTER_FADE_MS at full volume.
 *
 * ponytail: a mediaPlayback foreground service, the type this app already declares (and justifies
 * to Play) for the keep-alive service. Starting it from an exact alarm is a listed background-start
 * exemption, and Android 17's background-audio rule waives while-in-use for apps with exact-alarm
 * access playing USAGE_ALARM — https://developer.android.com/about/versions/17/changes/bg-audio.
 * Rejected: shortService (Android 17 excludes it from background audio at any target), systemExempted
 * (legal with SCHEDULE_EXACT_ALARM but a new permission + Play declaration for the same result),
 * playing inside the receiver's goAsync() window (~10 s), and a full-screen-intent alarm activity
 * (USE_FULL_SCREEN_INTENT is Play-restricted to alarm-clock/calling apps).
 * https://developer.android.com/develop/background-work/services/fgs/service-types
 */
class WakeAlarmService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private var player: MediaPlayer? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (player != null) return START_NOT_STICKY // already ringing
        try {
            ServiceCompat.startForeground(
                this, NOTIFICATION_ID, notification(this, fallback = false),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
            )
        } catch (e: Exception) { // e.g. ForegroundServiceStartNotAllowedException
            Log.w(TAG, "foreground start refused", e)
            notifyFallback(this)
            stopSelf()
            return START_NOT_STICKY
        }
        val fadeMs = (intent?.getIntExtra(EXTRA_FADE_SEC, 0) ?: 0).coerceAtLeast(0) * 1000L
        player = startPlayer()
        rampVolume(fadeMs)
        handler.postDelayed(::stopSelf, fadeMs + RING_AFTER_FADE_MS)
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        player?.release()
        player = null
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }

    // The wake sounds are Web Audio synths with no file to bundle, so the native alarm uses the
    // device's alarm tone (then ringtone, then notification sound if that isn't set).
    private fun startPlayer(): MediaPlayer? {
        for (type in intArrayOf(RingtoneManager.TYPE_ALARM, RingtoneManager.TYPE_RINGTONE, RingtoneManager.TYPE_NOTIFICATION)) {
            val uri = RingtoneManager.getActualDefaultRingtoneUri(this, type) ?: continue
            val p = MediaPlayer()
            try {
                // Attributes before setDataSource/prepare, or the player keeps media usage.
                p.setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build(),
                )
                p.setDataSource(this, uri)
                p.isLooping = true
                p.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK)
                p.setVolume(0f, 0f)
                p.prepare()
                p.start()
                return p
            } catch (e: Exception) {
                Log.w(TAG, "alarm tone $uri failed", e)
                p.release()
            }
        }
        return null
    }

    // ponytail: hand-rolled ramp; VolumeShaper is API 26 and minSdk is 24. Squared ≈ perceived loudness.
    private fun rampVolume(fadeMs: Long) {
        val start = SystemClock.elapsedRealtime()
        handler.post(object : Runnable {
            override fun run() {
                val p = player ?: return
                val f = if (fadeMs == 0L) 1f else ((SystemClock.elapsedRealtime() - start).toFloat() / fadeMs).coerceIn(0f, 1f)
                p.setVolume(f * f, f * f)
                if (f < 1f) handler.postDelayed(this, RAMP_STEP_MS)
            }
        })
    }

    companion object {
        const val EXTRA_FADE_SEC = "fadeSec"
        private const val ACTION_STOP = "com.sleeprings.app.WAKE_ALARM_STOP"
        private const val TAG = "WakeAlarmService"
        private const val CHANNEL_ID = "wake_alarm"
        private const val NOTIFICATION_ID = 1003 // 1 = keep-alive service, 1001/1002 = JS reminders
        private const val RAMP_STEP_MS = 1_000L
        private const val RING_AFTER_FADE_MS = 10 * 60_000L

        /** No ringing possible (foreground start refused): at least alert with the channel's sound. */
        fun notifyFallback(context: Context) {
            try {
                NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification(context, fallback = true))
            } catch (e: SecurityException) { // notifications not allowed
                Log.w(TAG, "fallback notification refused", e)
            }
        }

        private fun notification(context: Context, fallback: Boolean): Notification {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    CHANNEL_ID, context.getString(R.string.wake_alarm_title), NotificationManager.IMPORTANCE_HIGH,
                )
                context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
            }
            val stop = PendingIntent.getService(
                context, 0, Intent(context, WakeAlarmService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE,
            )
            // Opening the app stops the ring too (WakeAlarmPlugin.handleOnResume).
            val open = PendingIntent.getActivity(
                context, 0, Intent(context, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE,
            )
            return NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_sleeprings)
                .setContentTitle(context.getString(R.string.wake_alarm_title))
                .setContentText(context.getString(R.string.wake_alarm_text))
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setContentIntent(open)
                .setAutoCancel(fallback)
                .setOngoing(!fallback)
                .setSilent(!fallback) // the player is the sound; the fallback has only the channel's
                .apply { if (!fallback) setDeleteIntent(stop).addAction(0, context.getString(R.string.wake_alarm_stop), stop) }
                .build()
        }
    }
}
