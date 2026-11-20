package com.sleeprings.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WakeAlarmPlugin.class); // local plugin; must precede super, which builds the bridge
        super.onCreate(savedInstanceState);
    }
}
