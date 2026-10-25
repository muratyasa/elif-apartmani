package com.elifapartmani;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import org.json.JSONObject;

/** Ana ekran kutucuğu: bu ayın ödeme durumu. Veriyi uygulama her açıldığında yazar. */
public class ElifWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, gorunum(c));
    }

    static void guncelle(Context c) {
        try {
            AppWidgetManager m = AppWidgetManager.getInstance(c);
            int[] ids = m.getAppWidgetIds(new ComponentName(c, ElifWidget.class));
            if (ids != null && ids.length > 0) m.updateAppWidget(ids, gorunum(c));
        } catch (Exception ignored) {
        }
    }

    static RemoteViews gorunum(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget);
        String ust = "Elif Apartmanı", buyuk = "Uygulamayı açın", alt = "", saat = "";
        int renk = 0xFF1D5B8F;
        try {
            String s = c.getSharedPreferences("uygulama", Context.MODE_PRIVATE).getString("widget", "");
            if (!s.isEmpty()) {
                JSONObject o = new JSONObject(s);
                ust = o.optString("ust", ust);
                buyuk = o.optString("buyuk", buyuk);
                alt = o.optString("alt", "");
                saat = o.optString("saat", "");
                String r = o.optString("renk", "");
                if (r.startsWith("#")) renk = (int) Long.parseLong("FF" + r.substring(1), 16);
            }
        } catch (Exception ignored) {
        }
        v.setTextViewText(R.id.w_ust, ust);
        v.setTextViewText(R.id.w_buyuk, buyuk);
        v.setTextColor(R.id.w_buyuk, renk);
        v.setTextViewText(R.id.w_alt, alt);
        v.setTextViewText(R.id.w_saat, saat);
        Intent ac = new Intent(c, MainActivity.class);
        ac.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 7000, ac, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        v.setOnClickPendingIntent(R.id.w_kok, pi);
        return v;
    }
}
