package com.elifapartmani;

import android.app.Activity;
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

    static final String RELEASE_API = "https://api.github.com/repos/muratyasa/elif-apartmani/releases/latest";

    private WebView web;
    private String pendingExport;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(0xFF1D5B8F);

        web = new WebView(this);
        setContentView(web);

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
        web.loadUrl("file:///android_asset/index.html");

        Reminders.ensureChannel(this);
        Reminders.scheduleDaily(this);

        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, REQ_NOTIF);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.evaluateJavascript("window.onAppResume && window.onAppResume()", null);
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
            new Thread(() -> {
                String body = null;
                try {
                    HttpURLConnection c = (HttpURLConnection) new URL(RELEASE_API).openConnection();
                    c.setConnectTimeout(10000);
                    c.setReadTimeout(10000);
                    c.setRequestProperty("Accept", "application/vnd.github+json");
                    if (c.getResponseCode() == 200) {
                        try (InputStream is = c.getInputStream()) {
                            body = readAll(is);
                        }
                    }
                    c.disconnect();
                } catch (Exception ignored) {
                }
                String arg = body == null ? "null" : JSONObject.quote(body);
                callJs("window.onUpdateInfo && window.onUpdateInfo(" + arg + ")");
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
        public void testNotification() {
            Reminders.post(MainActivity.this, 999, "Deneme bildirimi",
                    "Bildirimler çalışıyor. Ödeme günleri yaklaşınca böyle bir uyarı göreceksiniz.");
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
