package com.elifapartmani;

import android.content.Context;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

/** Verileri telefonun uygulamaya özel klasöründe saklar. */
final class Storage {
    private Storage() {}

    static String read(Context c, String name) {
        File f = new File(c.getFilesDir(), name);
        if (!f.exists()) return "";
        try (FileInputStream in = new FileInputStream(f)) {
            return MainActivity.readAll(in);
        } catch (Exception e) {
            return "";
        }
    }

    static synchronized void write(Context c, String name, String content) {
        File dir = c.getFilesDir();
        File tmp = new File(dir, name + ".tmp");
        File target = new File(dir, name);
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(content.getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        } catch (Exception e) {
            return;
        }
        if (!tmp.renameTo(target)) {
            target.delete();
            tmp.renameTo(target);
        }
    }

    /** Yazmadan önce bir önceki hali .bak olarak saklar. */
    static synchronized void writeWithBackup(Context c, String name, String content) {
        File target = new File(c.getFilesDir(), name);
        if (target.exists() && target.length() > 0) {
            File bak = new File(c.getFilesDir(), name + ".bak");
            bak.delete();
            target.renameTo(bak);
        }
        write(c, name, content);
    }
}
