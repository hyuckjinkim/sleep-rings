package com.sleeprings.app

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import io.capawesome.capacitorjs.plugins.appshortcuts.AppShortcutsPlugin

// The widget and the Quick Settings tile open the app exactly like the "Play last mix" launcher
// shortcut (src/mobile/appShortcuts.ts): an ACTION_VIEW intent carrying the shortcut id, which
// AppShortcutsPlugin turns into its "click" event, so JS reuses playLastMix(). No data URI — the
// App plugin would report that as a link open.
private const val PLAY_LAST_MIX_SHORTCUT_ID = "play-last-mix" // = PLAY_LAST_MIX_SHORTCUT_ID in appShortcuts.ts

fun playLastMixIntent(context: Context): Intent =
    Intent(Intent.ACTION_VIEW, null, context, MainActivity::class.java)
        .putExtra(AppShortcutsPlugin.INTENT_EXTRA_ITEM_NAME, PLAY_LAST_MIX_SHORTCUT_ID)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

fun playLastMixPendingIntent(context: Context): PendingIntent =
    PendingIntent.getActivity(
        context,
        0,
        playLastMixIntent(context),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
