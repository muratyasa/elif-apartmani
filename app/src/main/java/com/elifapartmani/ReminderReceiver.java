package com.elifapartmani;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Günlük alarm geldiğinde ve telefon yeniden açıldığında çalışır. */
public class ReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String a = intent == null ? null : intent.getAction();
        if (Reminders.ACTION_DAILY.equals(a)) {
            Reminders.runCheck(context);
            Reminders.scheduleDaily(context);
            AutoBackup.run(context, false);
        } else {
            Reminders.scheduleDaily(context);
            Reminders.runCheck(context);
        }
    }
}
