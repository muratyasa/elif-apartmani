package com.elifapartmani;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInstaller;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * İki katmanlı güncelleme:
 *  1) Ekran güncellemesi: index.html, app.js, app.css GitHub sürümünden indirilir ve
 *     bir sonraki açılışta (ya da "Yenile" ile) kullanılır. APK kurmaya gerek yok.
 *  2) Uygulama (APK) güncellemesi: sadece Android tarafı değiştiğinde gerekir; uygulama
 *     içinden indirilir ve sistem kurulum ekranı açılır.
 */
final class Updater {
    private Updater() {}

    static final String RELEASE_API = "https://api.github.com/repos/muratyasa/elif-apartmani/releases/latest";
    private static final String[] WEB_FILES = {"index.html", "app.js", "app.css"};

    private static SharedPreferences sp(Context c) {
        return c.getSharedPreferences("guncelleme", Context.MODE_PRIVATE);
    }

    static File webDir(Context c) {
        return new File(c.getFilesDir(), "web");
    }

    /** APK içine gömülü ekranların sürümü. */
    static int bundledWeb(Context c) {
        try (InputStream is = c.getAssets().open("web.json")) {
            return new JSONObject(MainActivity.readAll(is)).optInt("surum", 0);
        } catch (Exception e) {
            return 0;
        }
    }

    static int currentWeb(Context c) {
        int indirilen = sp(c).getInt("web_surum", 0);
        boolean var = new File(webDir(c), "index.html").exists();
        return Math.max(bundledWeb(c), var ? indirilen : 0);
    }

    /** Açılışta yüklenecek adres: indirilen ekranlar APK'dakilerden yeniyse onlar. */
    static String startUrl(Context c) {
        File idx = new File(webDir(c), "index.html");
        int indirilen = sp(c).getInt("web_surum", 0);
        if (idx.exists() && indirilen > bundledWeb(c)) return "file://" + idx.getAbsolutePath();
        return "file:///android_asset/index.html";
    }

    private static String get(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(20000);
        c.setInstanceFollowRedirects(true);
        c.setRequestProperty("Accept", url.contains("api.github.com") ? "application/vnd.github+json" : "*/*");
        try {
            int code = c.getResponseCode();
            if (code != 200) throw new Exception("HTTP " + code);
            try (InputStream is = c.getInputStream()) {
                return MainActivity.readAll(is);
            }
        } finally {
            c.disconnect();
        }
    }

    /**
     * Sürümü kontrol eder, gerekiyorsa ekranları indirir.
     * Dönen JSON: {durum: "guncel"|"ekran"|"apk"|"hata", surum, notlar, apkUrl}
     */
    static JSONObject check(Context c) {
        JSONObject out = new JSONObject();
        try {
            JSONObject rel = new JSONObject(get(RELEASE_API));
            JSONArray assets = rel.optJSONArray("assets");
            JSONObject urls = new JSONObject();
            if (assets != null) {
                for (int i = 0; i < assets.length(); i++) {
                    JSONObject a = assets.getJSONObject(i);
                    urls.put(a.optString("name"), a.optString("browser_download_url"));
                }
            }
            out.put("notlar", rel.optString("body", ""));
            out.put("apkUrl", urls.optString("ElifApartmani.apk", ""));
            if (!urls.has("web.json")) {
                out.put("durum", "guncel");
                return out;
            }
            JSONObject w = new JSONObject(get(urls.getString("web.json")));
            int surum = w.optInt("surum", 0), gerekli = w.optInt("native", 1);
            out.put("surum", surum);
            if (gerekli > BuildConfig.NATIVE_API) {
                out.put("durum", "apk");
                return out;
            }
            if (surum <= currentWeb(c)) {
                out.put("durum", "guncel");
                return out;
            }
            // Ekranları indir: önce geçici klasöre, hepsi inince yer değiştir
            File tmp = new File(c.getFilesDir(), "web_yeni");
            deleteDir(tmp);
            tmp.mkdirs();
            for (String f : WEB_FILES) {
                if (!urls.has(f)) throw new Exception(f + " yok");
                String body = get(urls.getString(f));
                if (body.length() < 200) throw new Exception(f + " eksik");
                try (OutputStream os = new FileOutputStream(new File(tmp, f))) {
                    os.write(body.getBytes(StandardCharsets.UTF_8));
                }
            }
            String idx = readFile(new File(tmp, "index.html"));
            if (!idx.contains("app.js") || !idx.contains("main")) throw new Exception("index.html geçersiz");
            File dir = webDir(c);
            deleteDir(dir);
            if (!tmp.renameTo(dir)) throw new Exception("taşınamadı");
            sp(c).edit().putInt("web_surum", surum).apply();
            out.put("durum", "ekran");
        } catch (Exception e) {
            try {
                out.put("durum", "hata");
                out.put("hata", String.valueOf(e.getMessage()));
            } catch (Exception ignored) {
            }
        }
        return out;
    }

    private static String readFile(File f) throws Exception {
        try (InputStream is = new FileInputStream(f)) {
            return MainActivity.readAll(is);
        }
    }

    private static void deleteDir(File d) {
        File[] fs = d.listFiles();
        if (fs != null) for (File f : fs) {
            if (f.isDirectory()) deleteDir(f);
            else f.delete();
        }
        d.delete();
    }

    interface Progress {
        void on(int yuzde);
    }

    /** APK'yı indirir ve sistemin kurulum onay ekranını açar. */
    static void installApk(Context c, String url, Progress p) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        con.setConnectTimeout(15000);
        con.setReadTimeout(30000);
        con.setInstanceFollowRedirects(true);
        int code = con.getResponseCode();
        if (code != 200) throw new Exception("İndirilemedi (" + code + ")");
        long toplam = con.getContentLengthLong();
        PackageInstaller pi = c.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(c.getPackageName());
        int sid = pi.createSession(params);
        try (PackageInstaller.Session s = pi.openSession(sid);
             InputStream in = con.getInputStream()) {
            OutputStream out = s.openWrite("ElifApartmani.apk", 0, toplam > 0 ? toplam : -1);
            byte[] buf = new byte[64 * 1024];
            long okunan = 0;
            int n, son = -1;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                okunan += n;
                if (toplam > 0) {
                    int y = (int) (okunan * 100 / toplam);
                    if (y != son) {
                        son = y;
                        p.on(y);
                    }
                }
            }
            s.fsync(out);
            out.close();
            Intent i = new Intent(c, InstallReceiver.class);
            int fl = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            PendingIntent pend = PendingIntent.getBroadcast(c, 7, i, fl);
            s.commit(pend.getIntentSender());
        } finally {
            con.disconnect();
        }
    }
}
