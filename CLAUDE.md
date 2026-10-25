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
- Giderler (`DB.giderler`) ortak `genel` belgesinde eşitlenir (yeni Firestore koleksiyonu açmamak için); eski sürüm gidersiz yazarsa yereldekiler korunur.
- Ay sonu özeti: her ayın 20'sinde `ayOzetiBildirimi` (tür `ozet`).
- native_api 6 (zengin kutucuk: üst bant, durum, ilerleme çubuğu, 3 kutu, uyarılar renkli baloncuklarda: depozito/arıza/artış); native_api 4: bildirimde "Ödendi işaretle" (Intent extra `eylem=odendi` → `Android.bekleyenEylem()` → `odemeIsaretSayfasi`), ana ekran kutucuğu `ElifWidget` (`Android.setWidget(json)`, `widgetGuncelle`), uygulama kilidi (KeyguardManager, `Android.setLock/getLock/lockAvailable`).
- Yazı boyutu: her telefonda `localStorage['elif-yazi']` → body zoom + `body.buyuk`; dar satırlarda rozetler container query ile ikona döner.
- TÜFE (`ayarlar.tufe`) → `oneriKira`; ilan telefonu `ayarlar.ilanTel`; boş daire başlangıcı `bosBas`; Mart'ta `beyanBildirimi`.
- Tutar girişinde `sayi()` "2.400" gibi binlik noktayı tanır.
- Kira ve aidat ayın 15'inde; aylık borç = kira + aidat. Aidat yaz 300, kış 1300 (Ekim–Nisan).
- Kömür: petek başı 600 kg × ton fiyatı; boş ve kiraya verilmeyen daireler "Ev sahibi payı".
- Depozito toplam borca sayılmaz. Kira artışları `kiraArtislari` geçmişiyle tutulur (eski aylar eski tutarda).
- Hatırlatmalar: vade günü, sonra ödenmezse 3 günde bir; alınmamış depozito 10 günde bir.

## Kullanıcı tercihleri
- Kopyalanacak her şey (bağlantı, metin, numara) mesajda kod bloğu içinde verilir.
- Elektrik abone no zorunlu değil; telefonun yanında kopyalama düğmesi yok; toplu onay yok.
- Daire listesinde arama/WhatsApp düğmesi yok (daire sayfasında var); kira ve aidat ayrı satırlarda; sağ sütunda petek rozeti (gerçekçi petek simgesi + sayı, altında isteğe bağlı "petek" yazısı: Ayarlar → Görünüm, `elif-petek-yazi`) ve altında ödeme düğmesi.
- Uygulama "gardırop gibi" düzenli olmalı: gereksiz açıklama/tekrar yok, bilgiler hizalı, aranan kolay bulunur.
- Bildirim ve geçmiş: gün başlıklarıyla gruplu; her tür kendi rengi/ikonu. "İlk yükleme" notları gösterilmez (`odemeNotu`).
- Üst bant: logo + ad + canlı tarih-saat (`saatGoster`), ? (Rehber, `REHBER` soru-cevap + "Göster" → `yardim-git`) ve zil; dönem seçici ikinci satırda. Rehberi yeni özellik eklendikçe güncelle.
- Kelimeler satır sonunda bölünmez (body hyphens: manual, overflow-wrap: break-word); "e‑posta" bölünmeyen tire (U+2011) ile yazılır.
- Tasarım sade, ikonlar tutarlı ve az; her kart başlığı `baslik(ikon, metin)` ile.
- İşlemi yapan kişi e-posta değil adla görünür: `senk.js` → `KISI_ADLARI` (e-postanın `epostaIzi` parmak izi → ad). Depo açık olduğu için e-posta yazılmaz. Umut (kullanıcı), Murat (babası), Ömer (kardeşi). Yeni kişi eklenince izi hesaplanıp eklenir.
