package com.sleeprings.app

import android.content.Intent
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/** JS bridge for the closed-app wake alarm — src/mobile/wake-alarm.ts. */
@CapacitorPlugin(name = "WakeAlarm")
class WakeAlarmPlugin : Plugin() {
    /** { at: epoch ms, soundId, fadeSec }. soundId is unused natively: see WakeAlarmService.startPlayer. */
    @PluginMethod
    fun schedule(call: PluginCall) {
        val at = call.getLong("at") ?: return call.reject("at is required")
        if (!WakeAlarm.canScheduleExact(context)) return call.reject("exact alarms are not allowed")
        WakeAlarm.schedule(context, at, call.getInt("fadeSec") ?: 0)
        call.resolve()
    }

    @PluginMethod
    fun cancel(call: PluginCall) {
        WakeAlarm.cancel(context)
        call.resolve()
    }

    @PluginMethod
    fun canScheduleExact(call: PluginCall) {
        call.resolve(JSObject().put("value", WakeAlarm.canScheduleExact(context)))
    }

    // Opening the app means the user is up: silence a native alarm that is ringing (no-op otherwise).
    override fun handleOnResume() {
        context.stopService(Intent(context, WakeAlarmService::class.java))
    }
}
