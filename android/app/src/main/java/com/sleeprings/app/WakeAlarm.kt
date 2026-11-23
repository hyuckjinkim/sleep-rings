package com.sleeprings.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat

/**
 * Closed-app wake alarm: AlarmManager.setAlarmClock wakes WakeAlarmReceiver, which starts
 * WakeAlarmService to ring. JS (src/mobile/wakeAlarm.ts) arms and disarms it in step with the
 * in-app alarm. The trigger time is kept in SharedPreferences only to re-arm after a reboot.
 */
object WakeAlarm {
    const val ACTION_FIRE = "com.sleeprings.app.WAKE_ALARM_FIRE"
    private const val TAG = "WakeAlarm"
    private const val PREFS = "wake_alarm"
    private const val KEY_AT = "at"
    private const val KEY_FADE_SEC = "fadeSec"

    /** Android 12+ needs the user-granted "Alarms & reminders" access (SCHEDULE_EXACT_ALARM). */
    fun canScheduleExact(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager(context).canScheduleExactAlarms()

    /** Replaces any pending alarm. Throws SecurityException without exact access — check canScheduleExact(). */
    fun schedule(context: Context, atMs: Long, fadeSec: Int) {
        val show = PendingIntent.getActivity(
            context, 0, Intent(context, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE,
        )
        alarmManager(context).setAlarmClock(AlarmManager.AlarmClockInfo(atMs, show), fireIntent(context))
        prefs(context).edit().putLong(KEY_AT, atMs).putInt(KEY_FADE_SEC, fadeSec).apply()
    }

    /** Drops a pending alarm and silences a ringing one. */
    fun cancel(context: Context) {
        alarmManager(context).cancel(fireIntent(context))
        prefs(context).edit().clear().apply()
        context.stopService(Intent(context, WakeAlarmService::class.java))
    }

    /** Alarms don't survive a reboot. A time that already passed is dropped, never rung late. */
    fun restore(context: Context) {
        val at = prefs(context).getLong(KEY_AT, 0)
        if (at <= System.currentTimeMillis() || !canScheduleExact(context)) {
            prefs(context).edit().clear().apply()
            return
        }
        try {
            schedule(context, at, prefs(context).getInt(KEY_FADE_SEC, 0))
        } catch (e: SecurityException) {
            Log.w(TAG, "exact alarm access revoked", e)
        }
    }

    /** The fired alarm's fade length; it is no longer pending. */
    fun consume(context: Context): Int {
        val fadeSec = prefs(context).getInt(KEY_FADE_SEC, 0)
        prefs(context).edit().clear().apply()
        return fadeSec
    }

    private fun fireIntent(context: Context): PendingIntent =
        PendingIntent.getBroadcast(
            context,
            0,
            Intent(context, WakeAlarmReceiver::class.java).setAction(ACTION_FIRE),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

    private fun alarmManager(context: Context) = context.getSystemService(AlarmManager::class.java)

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}

class WakeAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED -> WakeAlarm.restore(context) // only re-arms; never starts the service
            WakeAlarm.ACTION_FIRE -> {
                val service = Intent(context, WakeAlarmService::class.java)
                    .putExtra(WakeAlarmService.EXTRA_FADE_SEC, WakeAlarm.consume(context))
                try {
                    // Allowed from the background: an exact alarm completing a user-requested action.
                    // https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start#background-start-restriction-exemptions
                    ContextCompat.startForegroundService(context, service)
                } catch (e: IllegalStateException) {
                    Log.w("WakeAlarm", "could not start the ring service", e)
                    WakeAlarmService.notifyFallback(context)
                }
            }
        }
    }
}
