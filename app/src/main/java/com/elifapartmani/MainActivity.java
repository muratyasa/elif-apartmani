package com.elifapartmani;

import android.app.Activity;
import android.app.KeyguardManager;
import android.app.NotificationManager;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.SharedPreferences;
import android.view.View;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {

    private static final int REQ_EXPORT = 11;
    private static final int REQ_IMPORT = 12;
    private static final int REQ_NOTIF = 13;
    private static final int REQ_CALL = 14;
    private static final int REQ_TREE = 15;
    private static final int REQ_LOCK = 16;
    private static final int REQ_FOTO = 17;
    private ValueCallback<Uri[]> fotoGeri;
    private Uri kameraUri;
    private String bekleyenEylem;
    private boolean kilitAcik = false, kilitSoruluyor = false, disariGitti = false;
    private long arkaPlanZamani = 0;
    private String pendingCall;


    private WebView web;
    private String pendingExport;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(0xFF1D5B8F);

        web = new WebView(this);
        setContentView(web);
        if (kilitGerekli()) web.setVisibility(View.INVISIBLE);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setTextZoom(100);

        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                String scheme = u.getScheme();
                if ("file".equals(scheme)) return false;
                openExternal(u);
                return true;
            }
        });
        // Fotoğraf ekleme: kamera ya da galeri
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView w, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fotoGeri != null) fotoGeri.onReceiveValue(null);
                fotoGeri = cb;
                try {
                    Intent galeri = new Intent(Intent.ACTION_GET_CONTENT);
                    galeri.addCategory(Intent.CATEGORY_OPENABLE);
                    galeri.setType("image/*");
                    galeri.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    kameraUri = PaylasProvider.uriFor("k_" + System.currentTimeMillis() + ".jpg");
                    Intent kamera = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
                    kamera.putExtra(android.provider.MediaStore.EXTRA_OUTPUT, kameraUri);
                    kamera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    Intent secici = Intent.createChooser(galeri, "Fotoğraf ekle");
                    if (kamera.resolveActivity(getPackageManager()) != null) {
                        secici.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{kamera});
                    }
                    startActivityForResult(secici, REQ_FOTO);
                    return true;
                } catch (Exception e) {
                    fotoGeri = null;
                    return false;
                }
            }
        });
        web.loadUrl(Updater.startUrl(this));
        eylemAl(getIntent());

        Reminders.ensureChannel(this);
        Reminders.scheduleDaily(this);
        new Thread(() -> {
            Reminders.runIfDue(getApplicationContext());
            AutoBackup.run(getApplicationContext(), false);
        }).start();

        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, REQ_NOTIF);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        eylemAl(intent);
        callJs("window.bildirimEylemiKontrol && window.bildirimEylemiKontrol()");
    }

    /** Bildirimdeki "Ödendi işaretle" düğmesinden gelen istek */
    private void eylemAl(Intent i) {
        if (i == null || !"odendi".equals(i.getStringExtra("eylem"))) return;
        bekleyenEylem = i.getStringExtra("daireler");
        int nid = i.getIntExtra("bildirimId", -1);
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null && nid >= 0) nm.cancel(nid);
        i.removeExtra("eylem");
    }

    private void temizleKamera() {
        java.io.File[] l = new java.io.File(getCacheDir(), "kamera").listFiles();
        if (l == null) return;
        long sinir = System.currentTimeMillis() - 3600000;
        for (java.io.File f : l) if (f.lastModified() < sinir) f.delete();
    }

    private SharedPreferences ayar() { return getSharedPreferences("uygulama", Context.MODE_PRIVATE); }

    private boolean kilitGerekli() {
        if (!ayar().getBoolean("kilit", false)) return false;
        KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
        return km != null && km.isDeviceSecure();
    }

    /** Uygulama kilidi: açılışta ve 1 dakikadan uzun arka planda kaldıktan sonra telefonun kilidi sorulur */
    private void kilitKontrol() {
        if (kilitSoruluyor) return;
        if (!kilitGerekli()) { kilitAcik = true; web.setVisibility(View.VISIBLE); return; }
        boolean sure = arkaPlanZamani > 0 && System.currentTimeMillis() - arkaPlanZamani > 60000;
        if (kilitAcik && !sure) { web.setVisibility(View.VISIBLE); return; }
        KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
        Intent i = km.createConfirmDeviceCredentialIntent("Elif Apartmanı", "Devam etmek için telefonunuzun kilidini açın");
        if (i == null) { kilitAcik = true; web.setVisibility(View.VISIBLE); return; }
        web.setVisibility(View.INVISIBLE);
        kilitSoruluyor = true;
        startActivityForResult(i, REQ_LOCK);
    }

    @Override
    public void startActivityForResult(Intent intent, int requestCode, Bundle options) {
        if (requestCode != REQ_LOCK) disariGitti = true;
        super.startActivityForResult(intent, requestCode, options);
    }

    @Override
    protected void onStop() {
        super.onStop();
        if (!kilitSoruluyor && !disariGitti) arkaPlanZamani = System.currentTimeMillis();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (disariGitti) { disariGitti = false; arkaPlanZamani = 0; }
        kilitKontrol();
        if (web != null) web.evaluateJavascript("window.onAppResume && window.onAppResume()", null);
    }

    @Override
    protected void onPause() {
        super.onPause();
        // Uygulamadan çıkarken günün yedeğini en son haliyle yenile
        Context app = getApplicationContext();
        new Thread(() -> AutoBackup.run(app, true)).start();
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(window.onBack && window.onBack()) ? 'yes' : 'no'", value -> {
            if (value == null || !value.contains("yes")) finish();
        });
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_NOTIF) callJs("window.onAppResume && window.onAppResume()");
        if (requestCode == REQ_CALL && pendingCall != null) {
            String n = pendingCall;
            pendingCall = null;
            boolean ok = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            startCall(n, ok);
        }
    }

    /** İzin varsa doğrudan arar, yoksa numarayı tuşlanmış halde telefon uygulamasını açar. */
    private void startCall(String phone, boolean direct) {
        String n = phone.replaceAll("[^0-9+]", "");
        try {
            Intent i = new Intent(direct ? Intent.ACTION_CALL : Intent.ACTION_DIAL, Uri.parse("tel:" + n));
            startActivity(i);
        } catch (Exception e) {
            try {
                startActivity(new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + n)));
            } catch (Exception ignored) {
            }
        }
    }

    private void openExternal(Uri u) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, u);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception ignored) {
        }
    }

    private void callJs(String code) {
        runOnUiThread(() -> {
            if (web != null) web.evaluateJavascript(code, null);
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FOTO) {
            Uri[] sonuc = null;
            if (resultCode == RESULT_OK) {
                if (data != null && data.getClipData() != null) {
                    int n = data.getClipData().getItemCount();
                    sonuc = new Uri[n];
                    for (int i = 0; i < n; i++) sonuc[i] = data.getClipData().getItemAt(i).getUri();
                } else if (data != null && data.getData() != null) {
                    sonuc = new Uri[]{data.getData()};
                } else if (kameraUri != null) {
                    java.io.File f = new java.io.File(new java.io.File(getCacheDir(), "kamera"), kameraUri.getLastPathSegment());
                    if (f.exists() && f.length() > 0) sonuc = new Uri[]{kameraUri};
                }
            }
            if (fotoGeri != null) fotoGeri.onReceiveValue(sonuc);
            fotoGeri = null;
            return;
        }
        if (requestCode == REQ_LOCK) {
            kilitSoruluyor = false;
            if (resultCode == RESULT_OK) { kilitAcik = true; arkaPlanZamani = 0; web.setVisibility(View.VISIBLE); }
            else finish();
            return;
        }
        if (requestCode == REQ_EXPORT) {
            boolean ok = false;
            if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingExport != null) {
                try (OutputStream os = getContentResolver().openOutputStream(data.getData(), "wt")) {
                    os.write(pendingExport.getBytes(StandardCharsets.UTF_8));
                    ok = true;
                } catch (Exception e) {
                    ok = false;
                }
            }
            pendingExport = null;
            callJs("window.onExportDone && window.onExportDone(" + ok + ")");
        } else if (requestCode == REQ_TREE) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                Uri tree = data.getData();
                Context app = getApplicationContext();
                new Thread(() -> {
                    AutoBackup.setFolder(app, tree);
                    AutoBackup.run(app, true);
                    callJs("window.onBackupFolder && window.onBackupFolder()");
                }).start();
            }
        } else if (requestCode == REQ_IMPORT) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                try (InputStream is = getContentResolver().openInputStream(data.getData())) {
                    String text = readAll(is);
                    callJs("window.onImport && window.onImport(" + JSONObject.quote(text) + ")");
                } catch (Exception e) {
                    callJs("window.onImport && window.onImport(null)");
                }
            }
        }
    }

    static String readAll(InputStream is) throws Exception {
        BufferedReader r = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        char[] buf = new char[8192];
        int n;
        while ((n = r.read(buf)) > 0) sb.append(buf, 0, n);
        return sb.toString();
    }

    /** Sayfadaki JavaScript'in çağırdığı köprü. */
    class Bridge {

        @JavascriptInterface
        public String load() {
            return Storage.read(MainActivity.this, "data.json");
        }

        @JavascriptInterface
        public void save(String json) {
            Storage.writeWithBackup(MainActivity.this, "data.json", json);
        }

        @JavascriptInterface
        public void setReminders(String json) {
            Storage.write(MainActivity.this, "reminders.json", json);
            Reminders.scheduleDaily(MainActivity.this);
        }

        @JavascriptInterface
        public int versionCode() {
            try {
                PackageInfo p = getPackageManager().getPackageInfo(getPackageName(), 0);
                return p.versionCode;
            } catch (Exception e) {
                return 0;
            }
        }

        @JavascriptInterface
        public String versionName() {
            try {
                PackageInfo p = getPackageManager().getPackageInfo(getPackageName(), 0);
                return p.versionName;
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public void checkUpdate() {
            Context app = getApplicationContext();
            new Thread(() -> {
                JSONObject r = Updater.check(app);
                callJs("window.onUpdateState ? window.onUpdateState(" + JSONObject.quote(r.toString()) + ") : 0");
            }).start();
        }

        @JavascriptInterface
        public void shareFile(String content, String fileName, String mime) {
            runOnUiThread(() -> {
                try {
                    java.io.File dir = new java.io.File(getCacheDir(), "paylas");
                    dir.mkdirs();
                    java.io.File[] eski = dir.listFiles();
                    if (eski != null) for (java.io.File f : eski) f.delete();
                    try (OutputStream os = new java.io.FileOutputStream(new java.io.File(dir, fileName))) {
                        os.write(content.getBytes(StandardCharsets.UTF_8));
                    }
                    Intent i = new Intent(Intent.ACTION_SEND);
                    i.setType(mime);
                    i.putExtra(Intent.EXTRA_STREAM, PaylasProvider.uriFor(fileName));
                    i.putExtra(Intent.EXTRA_SUBJECT, fileName);
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(Intent.createChooser(i, "Yedeği gönder / kaydet"));
                    callJs("window.onShareStarted && window.onShareStarted()");
                } catch (Exception e) {
                    callJs("window.onExportDone && window.onExportDone(false)");
                }
            });
        }

        /** Eşitleme için genel HTTP isteği (sayfa yerine telefon yapar, CORS sorunu olmaz). */
        @JavascriptInterface
        public void http(String id, String method, String url, String body, String headersJson) {
            new Thread(() -> {
                int code = 0;
                String resp = "";
                HttpURLConnection c = null;
                try {
                    c = (HttpURLConnection) new URL(url).openConnection();
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(30000);
                    c.setRequestMethod(method);
                    JSONObject h = new JSONObject(headersJson == null || headersJson.isEmpty() ? "{}" : headersJson);
                    java.util.Iterator<String> it = h.keys();
                    while (it.hasNext()) {
                        String k = it.next();
                        c.setRequestProperty(k, h.getString(k));
                    }
                    if (body != null && !body.isEmpty()) {
                        c.setDoOutput(true);
                        try (OutputStream os = c.getOutputStream()) {
                            os.write(body.getBytes(StandardCharsets.UTF_8));
                        }
                    }
                    code = c.getResponseCode();
                    InputStream is = code >= 400 ? c.getErrorStream() : c.getInputStream();
                    if (is != null) try (InputStream in = is) {
                        resp = readAll(in);
                    }
                } catch (Exception e) {
                    code = 0;
                    resp = String.valueOf(e.getMessage());
                } finally {
                    if (c != null) c.disconnect();
                }
                callJs("window.onHttp && window.onHttp(" + JSONObject.quote(id) + "," + code + "," + JSONObject.quote(resp) + ")");
            }).start();
        }

        @JavascriptInterface
        public int nativeApi() {
            return BuildConfig.NATIVE_API;
        }

        @JavascriptInterface
        public int webVersion() {
            return Updater.currentWeb(MainActivity.this);
        }

        @JavascriptInterface
        public void reloadApp() {
            runOnUiThread(() -> web.loadUrl(Updater.startUrl(MainActivity.this)));
        }

        @JavascriptInterface
        public boolean canInstall() {
            return Build.VERSION.SDK_INT < 26 || getPackageManager().canRequestPackageInstalls();
        }

        @JavascriptInterface
        public void openInstallPermission() {
            runOnUiThread(() -> {
                try {
                    Intent i = new Intent("android.settings.MANAGE_UNKNOWN_APP_SOURCES", Uri.parse("package:" + getPackageName()));
                    startActivity(i);
                } catch (Exception ignored) {
                }
            });
        }

        @JavascriptInterface
        public void installApk(String url) {
            Context app = getApplicationContext();
            new Thread(() -> {
                try {
                    Updater.installApk(app, url, y -> callJs("window.onApkProgress && window.onApkProgress(" + y + ")"));
                    callJs("window.onApkProgress && window.onApkProgress(-1)");
                } catch (Exception e) {
                    callJs("window.onApkProgress && window.onApkProgress(-2, " + JSONObject.quote(String.valueOf(e.getMessage())) + ")");
                }
            }).start();
        }

        @JavascriptInterface
        public void copy(String label, String text) {
            runOnUiThread(() -> {
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm != null) cm.setPrimaryClip(ClipData.newPlainText(label, text));
            });
        }

        @JavascriptInterface
        public void openUrl(String url) {
            openExternal(Uri.parse(url));
        }

        @JavascriptInterface
        public void call(String phone) {
            runOnUiThread(() -> {
                if (checkSelfPermission("android.permission.CALL_PHONE") == PackageManager.PERMISSION_GRANTED) {
                    startCall(phone, true);
                } else {
                    pendingCall = phone;
                    requestPermissions(new String[]{"android.permission.CALL_PHONE"}, REQ_CALL);
                }
            });
        }

        @JavascriptInterface
        public String notificationLog() {
            String s = Storage.read(MainActivity.this, "bildirim_log.json");
            return s.isEmpty() ? "[]" : s;
        }

        @JavascriptInterface
        public void dial(String phone) {
            try {
                Intent i = new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + phone));
                startActivity(i);
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public void exportData(String content, String fileName, String mime) {
            pendingExport = content;
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(mime);
                i.putExtra(Intent.EXTRA_TITLE, fileName);
                try {
                    startActivityForResult(i, REQ_EXPORT);
                } catch (Exception e) {
                    pendingExport = null;
                    callJs("window.onExportDone && window.onExportDone(false)");
                }
            });
        }

        @JavascriptInterface
        public void importData() {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try {
                    startActivityForResult(i, REQ_IMPORT);
                } catch (Exception ignored) {
                }
            });
        }

        @JavascriptInterface
        public boolean notificationsAllowed() {
            return Reminders.allowed(MainActivity.this);
        }

        @JavascriptInterface
        public void requestNotifications() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 33) {
                    requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, REQ_NOTIF);
                } else {
                    openAppNotificationSettings();
                }
            });
        }

        @JavascriptInterface
        public void openNotificationSettings() {
            runOnUiThread(MainActivity.this::openAppNotificationSettings);
        }

        @JavascriptInterface
        public void chooseBackupFolder() {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                        | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                try {
                    startActivityForResult(i, REQ_TREE);
                } catch (Exception ignored) {
                }
            });
        }

        @JavascriptInterface
        public String backupInfo() {
            return AutoBackup.info(MainActivity.this);
        }

        @JavascriptInterface
        public void backupNow() {
            Context app = getApplicationContext();
            new Thread(() -> {
                AutoBackup.run(app, true);
                callJs("window.onBackupFolder && window.onBackupFolder()");
            }).start();
        }

        /** Fotoğraflar telefonun uygulama klasöründe saklanır (files/foto) */
        @JavascriptInterface
        public boolean fotoKaydet(String ad, String base64) {
            if (ad == null || ad.contains("/") || ad.contains("..")) return false;
            try {
                java.io.File dir = new java.io.File(getFilesDir(), "foto");
                dir.mkdirs();
                byte[] b = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
                try (OutputStream os = new java.io.FileOutputStream(new java.io.File(dir, ad))) { os.write(b); }
                temizleKamera();
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public String fotoKlasor() {
            return "file://" + new java.io.File(getFilesDir(), "foto").getAbsolutePath() + "/";
        }

        @JavascriptInterface
        public boolean fotoVar(String ad) {
            if (ad == null || ad.contains("/")) return false;
            return new java.io.File(new java.io.File(getFilesDir(), "foto"), ad).exists();
        }

        @JavascriptInterface
        public void fotoSil(String ad) {
            if (ad == null || ad.contains("/") || ad.contains("..")) return;
            new java.io.File(new java.io.File(getFilesDir(), "foto"), ad).delete();
        }

        /** Fotoğrafları (ve açıklama metnini) WhatsApp vb. ile paylaşır */
        @JavascriptInterface
        public void fotoPaylas(String adlarJson, String metin) {
            runOnUiThread(() -> {
                try {
                    org.json.JSONArray a = new org.json.JSONArray(adlarJson);
                    java.io.File dir = new java.io.File(getCacheDir(), "paylas");
                    dir.mkdirs();
                    java.io.File[] eski = dir.listFiles();
                    if (eski != null) for (java.io.File f : eski) f.delete();
                    java.util.ArrayList<Uri> uris = new java.util.ArrayList<>();
                    java.io.File kaynak = new java.io.File(getFilesDir(), "foto");
                    for (int i = 0; i < a.length(); i++) {
                        String ad = a.getString(i);
                        java.io.File f = new java.io.File(kaynak, ad);
                        if (ad.contains("/") || !f.exists()) continue;
                        java.io.File h = new java.io.File(dir, ad);
                        try (java.io.InputStream in = new java.io.FileInputStream(f); OutputStream out = new java.io.FileOutputStream(h)) {
                            byte[] buf = new byte[16384]; int n;
                            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                        }
                        uris.add(PaylasProvider.uriFor(ad));
                    }
                    Intent i;
                    if (uris.isEmpty()) {
                        i = new Intent(Intent.ACTION_SEND); i.setType("text/plain");
                    } else if (uris.size() == 1) {
                        i = new Intent(Intent.ACTION_SEND); i.setType("image/jpeg"); i.putExtra(Intent.EXTRA_STREAM, uris.get(0));
                    } else {
                        i = new Intent(Intent.ACTION_SEND_MULTIPLE); i.setType("image/jpeg"); i.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris);
                    }
                    if (metin != null && !metin.isEmpty()) i.putExtra(Intent.EXTRA_TEXT, metin);
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(Intent.createChooser(i, "Paylaş"));
                } catch (Exception ignored) {
                }
            });
        }

        @JavascriptInterface
        public String bekleyenEylem() {
            String s = bekleyenEylem;
            bekleyenEylem = null;
            return s == null ? "" : s;
        }

        @JavascriptInterface
        public void setWidget(String json) {
            ayar().edit().putString("widget", json).apply();
            ElifWidget.guncelle(MainActivity.this);
        }

        @JavascriptInterface
        public boolean lockAvailable() {
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            return km != null && km.isDeviceSecure();
        }

        @JavascriptInterface
        public boolean getLock() { return ayar().getBoolean("kilit", false); }

        @JavascriptInterface
        public void setLock(boolean acik) {
            ayar().edit().putBoolean("kilit", acik).apply();
            if (acik) kilitAcik = true;
        }

        @JavascriptInterface
        public void clearBackupFolder() {
            AutoBackup.clearFolder(MainActivity.this);
        }

        @JavascriptInterface
        public void testNotification() {
            String t = "Deneme bildirimi";
            String m = "Bildirimler çalışıyor. Ödeme günleri yaklaşınca böyle bir uyarı göreceksiniz.";
            Reminders.post(MainActivity.this, 999, t, m);
            Reminders.log(MainActivity.this, "deneme", t, m, null);
        }
    }

    private void openAppNotificationSettings() {
        try {
            Intent i;
            if (Build.VERSION.SDK_INT >= 26) {
                i = new Intent("android.settings.APP_NOTIFICATION_SETTINGS");
                i.putExtra("android.provider.extra.APP_PACKAGE", getPackageName());
            } else {
                i = new Intent("android.settings.APPLICATION_DETAILS_SETTINGS", Uri.parse("package:" + getPackageName()));
            }
            startActivity(i);
        } catch (Exception ignored) {
        }
    }
}
