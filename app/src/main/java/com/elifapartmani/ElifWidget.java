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

    private static int renk(String r, int vars) {
        try {
            if (r != null && r.startsWith("#") && r.length() == 7) return (int) Long.parseLong("FF" + r.substring(1), 16);
        } catch (Exception ignored) {
        }
        return vars;
    }

    static RemoteViews gorunum(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget);
        JSONObject o = new JSONObject();
        try {
            String s = c.getSharedPreferences("uygulama", Context.MODE_PRIVATE).getString("widget", "");
            if (!s.isEmpty()) o = new JSONObject(s);
        } catch (Exception ignored) {
        }
        v.setTextViewText(R.id.w_ay, o.optString("ay", ""));
        v.setTextViewText(R.id.w_saat, o.optString("saat", ""));
        v.setTextViewText(R.id.w_buyuk, o.optString("buyuk", "Uygulamayı açın"));
        v.setTextColor(R.id.w_buyuk, renk(o.optString("renk"), 0xFF1D5B8F));
        String ik = o.optString("ikon", "ok");
        v.setImageViewResource(R.id.w_durum_ik, "uyari".equals(ik) ? R.drawable.ic_w_uyari : "saat".equals(ik) ? R.drawable.ic_w_saat : R.drawable.ic_w_ok);
        int yuzde = Math.max(0, Math.min(100, o.optInt("yuzde", 0)));
        v.setProgressBar(R.id.w_bar, 100, yuzde, false);
        v.setTextViewText(R.id.w_yuzde, o.has("yuzde") ? "%" + yuzde : "");
        v.setTextViewText(R.id.w_bar_yazi, o.optString("bar", ""));
        v.setTextViewText(R.id.w_k1_deger, o.optString("kira", "–"));
        v.setTextViewText(R.id.w_k1_etiket, o.optString("kiraEtiket", "Kira"));
        v.setTextViewText(R.id.w_k2_deger, o.optString("kalan", "–"));
        v.setTextColor(R.id.w_k2_deger, renk(o.optString("kalanRenk"), 0xFF15202D));
        v.setTextViewText(R.id.w_k3_deger, o.optString("komur", "–"));
        v.setTextViewText(R.id.w_k3_etiket, o.optString("komurEtiket", "Kömür"));
        String alt = o.optString("alt", "");
        v.setTextViewText(R.id.w_alt, alt);
        v.setViewVisibility(R.id.w_alt_satir, alt.isEmpty() ? android.view.View.GONE : android.view.View.VISIBLE);
        Intent ac = new Intent(c, MainActivity.class);
        ac.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 7000, ac, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        v.setOnClickPendingIntent(R.id.w_kok, pi);
        return v;
    }
}
