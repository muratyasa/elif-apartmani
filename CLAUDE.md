# Elif Apartmanı – bakım notu

33 daireli apartmanın kira, aidat, kömür, depozito, abonelik ve arıza takibi. Kullanıcılar Türkçe konuşur; arayüz metinleri Türkçe.
Kiracı verisi bu depoda YOKTUR ve konmamalıdır (depo herkese açık). Veri gerekiyorsa kullanıcıdan yedek dosyası istenir.

## Yapı
- Android WebView uygulaması. Arayüz: `app/src/main/assets/` → `index.html`, `app.js` (tüm mantık), `app.css`, `senk.js` (Firebase eşitleme).
- Java köprüsü `window.Android` (`MainActivity.java`): load/save, hatırlatmalar (`Reminders`, `ReminderReceiver`), `http` (CORS'suz istek), otomatik yedek (`AutoBackup`, `_` ile başlayan anahtarları/oturum bilgisini yazmaz), paylaşım (`PaylasProvider`), uygulama içi APK kurulumu (`Updater`, `InstallReceiver`).
- `app.js` sonunda `module.exports` var; `node` ile birim denemesi yapılabilir.

## Sürüm çıkarma
- `main`'e her push → GitHub Actions (`.github/workflows/build.yml`) imzalı APK'yı derler, `v<run_number>` sürümünü açar; APK + web dosyaları + `web.json` yüklenir.
- Commit mesajında `[skip ci]` derlemeyi atlar (yalnız belge değişikliklerinde).
- Anahtar: `keystore/elif.jks` (alias `elif`). Değiştirilirse eski kurulumların üstüne kurulamaz.
- Sıcak güncelleme: uygulama `web.json`'a bakar; `native <= NATIVE_API` ise yalnız web dosyalarını indirir ("Yenile" bandı). Java/manifest değişirse ya da yeni web dosyası eklenirse `native_api.txt` artırılır → kullanıcıya APK güncellemesi önerilir. Bu yüzden yeni kod mümkünse `app.js` içine eklenir.
- APK bağlantısı: https://github.com/muratyasa/elif-apartmani/releases/latest/download/ElifApartmani.apk

## Firebase (proje `elif-apartmani`, Spark planı)
- Firestore REST + Identity Toolkit REST, `Android.http` üzerinden.
- Yol: `apartman/elif/{daireler, odemeler, notlar, silinenler, genel}`; belge alanları `json`, `kim`, `silindi`, `zaman` (REQUEST_TIME).
- Eşitleme: yereldeki fark gönderilir, sonra `zaman > son` sorgusuyla çekilir; 30 sn'de bir, açılışta ve kayıttan 1,5 sn sonra.
- Kurallar e-posta izin listesiyle korunur; kayıt (sign-up) kapalı; App Check zorunlu DEĞİL (açılırsa eşitleme durur).

## Veri kuralları
- Kira ve aidat ayın 15'inde; aylık borç = kira + aidat. Aidat yaz 300, kış 1300 (Ekim–Nisan).
- Kömür: petek başı 600 kg × ton fiyatı; boş ve kiraya verilmeyen daireler "Ev sahibi payı".
- Depozito toplam borca sayılmaz. Kira artışları `kiraArtislari` geçmişiyle tutulur (eski aylar eski tutarda).
- Hatırlatmalar: vade günü, sonra ödenmezse 3 günde bir; alınmamış depozito 10 günde bir.

## Kullanıcı tercihleri
- Kopyalanacak her şey (bağlantı, metin, numara) mesajda kod bloğu içinde verilir.
- Elektrik abone no zorunlu değil; telefonun yanında kopyalama düğmesi yok; toplu onay yok.
- Daire listesinde arama/WhatsApp düğmesi yok (daire sayfasında var); kira ve aidat ayrı satırlarda, petek sağda.
- Tasarım sade, ikonlar tutarlı ve az.
