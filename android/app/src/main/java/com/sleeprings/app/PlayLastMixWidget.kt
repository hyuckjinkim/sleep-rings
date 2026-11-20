package com.sleeprings.app

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews

/** Home-screen "Play last mix" button. Static layout — nothing to refresh, so no update period. */
class PlayLastMixWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
        val views = RemoteViews(context.packageName, R.layout.widget_play_last_mix)
        views.setOnClickPendingIntent(R.id.widget_root, playLastMixPendingIntent(context))
        manager.updateAppWidget(appWidgetIds, views)
    }
}
