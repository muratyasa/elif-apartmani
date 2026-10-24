package com.elifapartmani;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.widget.Toast;

/** Kurulum oturumunun sonucunu alır; onay gerekiyorsa sistemin kurulum ekranını açar. */
public class InstallReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        int durum = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (durum == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent onay = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (onay != null) {
                onay.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    context.startActivity(onay);
                } catch (Exception ignored) {
                }
            }
        } else if (durum != PackageInstaller.STATUS_SUCCESS) {
            String m = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
            Toast.makeText(context, "Güncelleme kurulamadı" + (m != null ? ": " + m : ""), Toast.LENGTH_LONG).show();
        }
    }
}
