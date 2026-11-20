package com.sleeprings.app

import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/** Quick Settings "Play last mix" tile: opens the app (like the launcher shortcut) and collapses the shade. */
class PlayLastMixTileService : TileService() {
    override fun onStartListening() {
        qsTile?.apply {
            state = Tile.STATE_INACTIVE // a one-shot action, not a toggle
            updateTile()
        }
    }

    override fun onClick() {
        if (isLocked) unlockAndRun(::openApp) else openApp()
    }

    private fun openApp() {
        // API 34 made the Intent overload throw for apps targeting 34+; the PendingIntent one is 34+.
        // https://developer.android.com/reference/android/service/quicksettings/TileService#startActivityAndCollapse(android.app.PendingIntent)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startActivityAndCollapse(playLastMixPendingIntent(this))
        } else {
            @Suppress("DEPRECATION", "StartActivityAndCollapseDeprecated")
            startActivityAndCollapse(playLastMixIntent(this))
        }
    }
}
