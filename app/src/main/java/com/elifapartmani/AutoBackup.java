package com.elifapartmani;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;

import org.json.JSONObject;

import java.io.File;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * Otomatik yedek:
 *  - Her gün uygulamanın kendi klasörüne bir kopya (son 7 gün saklanır).
 *  - Kullanıcı bir klasör seçtiyse her gün o klasöre de bir dosya (son 30 gün saklanır).
 */
final class AutoBackup {
    private AutoBackup() {}

    private static final String PREF = "otomatik_yedek";
    private static final String PREFIX = "elif-apartmani-otomatik-";

    private static SharedPreferences sp(Context c) {
        return c.getSharedPreferences(PREF, Context.MODE_PRIVATE);
    }

    static void setFolder(Context c, Uri tree) {
        try {
            c.getContentResolver().takePersistableUriPermission(tree,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (Exception ignored) {
        }
        sp(c).edit().putString("klasor", tree.toString()).putString("son", "").putString("hata", "").apply();
    }

    static void clearFolder(Context c) {
        sp(c).edit().remove("klasor").remove("son").remove("hata").apply();
    }

    /** Sayfaya gösterilecek durum: klasör adı, son yedek günü, varsa hata. */
    static String info(Context c) {
        try {
            JSONObject o = new JSONObject();
            String k = sp(c).getString("klasor", null);
            o.put("klasor", k == null ? "" : folderLabel(Uri.parse(k)));
            o.put("son", sp(c).getString("son", ""));
            o.put("hata", sp(c).getString("hata", ""));
            o.put("ic", sp(c).getString("ic_son", ""));
            return o.toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    private static String folderLabel(Uri tree) {
        try {
            String id = DocumentsContract.getTreeDocumentId(tree);
            int i = id.indexOf(':');
            String path = i >= 0 ? id.substring(i + 1) : id;
            return path.isEmpty() ? "Telefon hafızası (ana klasör)" : path;
        } catch (Exception e) {
            return "Seçilen klasör";
        }
    }

    /** Günde bir kez yedek alır; force=true ise bugün alınmış olsa da yeniler. */
    static synchronized void run(Context c, boolean force) {
        String data = Storage.read(c, "data.json");
        if (data.isEmpty()) return;
        String bugun = Reminders.today();

        // 1) Uygulamanın kendi klasörüne günlük kopya
        if (force || !bugun.equals(sp(c).getString("ic_son", ""))) {
            Storage.write(c, "yedek-" + bugun + ".json", data);
            pruneInternal(c, 7);
            sp(c).edit().putString("ic_son", bugun).apply();
        }

        // 2) Kullanıcının seçtiği klasöre günlük dosya
        String k = sp(c).getString("klasor", null);
        if (k == null) return;
        if (!force && bugun.equals(sp(c).getString("son", ""))) return;
        try {
            Uri tree = Uri.parse(k);
            ContentResolver cr = c.getContentResolver();
            String rootId = DocumentsContract.getTreeDocumentId(tree);
            Uri parent = DocumentsContract.buildDocumentUriUsingTree(tree, rootId);
            String name = PREFIX + bugun + ".json";

            List<String[]> files = list(cr, tree, rootId);
            Uri target = null;
            for (String[] f : files) {
                if (name.equals(f[1])) target = DocumentsContract.buildDocumentUriUsingTree(tree, f[0]);
            }
            if (target == null) target = DocumentsContract.createDocument(cr, parent, "application/json", name);
            if (target == null) throw new Exception("Dosya oluşturulamadı");
            try (OutputStream os = cr.openOutputStream(target, "wt")) {
                os.write(data.getBytes(StandardCharsets.UTF_8));
            }

            // En yeni 30 dosyayı tut
            List<String[]> eski = new ArrayList<>();
            for (String[] f : list(cr, tree, rootId)) {
                if (f[1] != null && f[1].startsWith(PREFIX)) eski.add(f);
            }
            Collections.sort(eski, (a, b) -> a[1].compareTo(b[1]));
            for (int i = 0; i < eski.size() - 30; i++) {
                try {
                    DocumentsContract.deleteDocument(cr, DocumentsContract.buildDocumentUriUsingTree(tree, eski.get(i)[0]));
                } catch (Exception ignored) {
                }
            }
            sp(c).edit().putString("son", bugun).putString("hata", "").apply();
        } catch (Exception e) {
            sp(c).edit().putString("hata", "Seçilen klasöre yazılamadı. Klasörü yeniden seçin.").apply();
        }
    }

    private static List<String[]> list(ContentResolver cr, Uri tree, String parentId) {
        List<String[]> out = new ArrayList<>();
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, parentId);
        try (Cursor cur = cr.query(children, new String[]{
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
            if (cur != null) {
                while (cur.moveToNext()) out.add(new String[]{cur.getString(0), cur.getString(1)});
            }
        } catch (Exception ignored) {
        }
        return out;
    }

    private static void pruneInternal(Context c, int keep) {
        File[] fs = c.getFilesDir().listFiles((dir, n) -> n.startsWith("yedek-") && n.endsWith(".json"));
        if (fs == null || fs.length <= keep) return;
        Arrays.sort(fs, (a, b) -> a.getName().compareTo(b.getName()));
        for (int i = 0; i < fs.length - keep; i++) fs[i].delete();
    }
}
