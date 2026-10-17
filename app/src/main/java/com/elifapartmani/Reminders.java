package com.elifapartmani;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.Locale;

/** Günlük kontrol alarmı ve bildirim gösterme. */
final class Reminders {
    private Reminders() {}

    static final String CHANNEL = "odeme_hatirlatma";
    static final String ACTION_DAILY = "com.elifapartmani.GUNLUK_KONTROL";

    static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = c.getSystemService(NotificationManager.class);
            if (nm != null && nm.getNotificationChannel(CHANNEL) == null) {
                NotificationChannel ch = new NotificationChannel(CHANNEL, "Ödeme hatırlatmaları",
                        NotificationManager.IMPORTANCE_HIGH);
                ch.setDescription("Kira ve kömür ödeme günü yaklaşınca veya geciktiğinde uyarır");
                nm.createNotificationChannel(ch);
            }
        }
    }

    static boolean allowed(Context c) {
        if (Build.VERSION.SDK_INT >= 33
                && c.checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        return nm == null || nm.areNotificationsEnabled();
    }

    private static int hour(Context c) {
        try {
            String s = Storage.read(c, "reminders.json");
            if (s.isEmpty()) return 10;
            int h = new JSONObject(s).optInt("saat", 10);
            return (h < 0 || h > 23) ? 10 : h;
        } catch (Exception e) {
            return 10;
        }
    }

    static void scheduleDaily(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Intent i = new Intent(c, ReminderReceiver.class).setAction(ACTION_DAILY);
        PendingIntent pi = PendingIntent.getBroadcast(c, 1, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.HOUR_OF_DAY, hour(c));
        cal.set(Calendar.MINUTE, 0);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        if (cal.getTimeInMillis() <= System.currentTimeMillis()) cal.add(Calendar.DAY_OF_MONTH, 1);
        am.cancel(pi);
        am.setInexactRepeating(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(), AlarmManager.INTERVAL_DAY, pi);
    }

    static String today() {
        Calendar cal = Calendar.getInstance();
        return String.format(Locale.US, "%04d-%02d-%02d",
                cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.DAY_OF_MONTH));
    }

    /** Bugüne ait (ve telefon kapalıyken kaçırılan son günlere ait) hatırlatmaları gösterir. */
    static void runCheck(Context c) {
        SharedPreferences sp = c.getSharedPreferences("hatirlatma", Context.MODE_PRIVATE);
        String bugun = today();
        String son = sp.getString("son_kontrol", "");
        if (bugun.equals(son)) return;
        try {
            String s = Storage.read(c, "reminders.json");
            if (!s.isEmpty()) {
                JSONArray items = new JSONObject(s).optJSONArray("items");
                int shown = 0;
                if (items != null) {
                    for (int k = 0; k < items.length() && shown < 6; k++) {
                        JSONObject it = items.getJSONObject(k);
                        String tarih = it.optString("tarih");
                        boolean bugunku = tarih.equals(bugun);
                        boolean kacirilan = !son.isEmpty() && tarih.compareTo(son) > 0 && tarih.compareTo(bugun) < 0;
                        if (bugunku || kacirilan) {
                            post(c, 100 + k, it.optString("baslik"), it.optString("metin"));
                            shown++;
                        }
                    }
                }
            }
        } catch (Exception ignored) {
        }
        sp.edit().putString("son_kontrol", bugun).apply();
    }

    static void post(Context c, int id, String title, String text) {
        ensureChannel(c);
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        Intent open = new Intent(c, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, id, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(c, CHANNEL)
                : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_notify)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setColor(0xFF1D5B8F)
                .setAutoCancel(true)
                .setContentIntent(pi);
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_HIGH);
        try {
            nm.notify(id, b.build());
        } catch (SecurityException ignored) {
        }
    }
}
