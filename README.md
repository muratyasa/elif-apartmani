# Elif Apartmanı

40 dairelik apartman için kira ve kömür ödemesi takip uygulaması (Android).

- Her daire için kiracı, telefon, aylık kira ve ödeme günü
- Aylık kira durumu: ödendi / bekliyor / kısmi / gecikti
- Kömür taksitleri ve daire bazında ödeme takibi
- Ödeme günü yaklaşınca ve geciktiğinde telefona bildirim
- Yedek alma / geri yükleme, Excel için CSV dışa aktarma
- Uygulama içinden güncelleme

## İndirme

En son sürüm: https://github.com/muratyasa/elif-apartmani/releases/latest/download/ElifApartmani.apk

## Nasıl derlenir

`main` dalına yapılan her gönderimde GitHub Actions APK'yı derler ve yeni bir sürüm (release) yayınlar.
Uygulamanın ekranları `app/src/main/assets` içindeki HTML/CSS/JS dosyalarıdır; Android tarafı
(`app/src/main/java`) veri saklama, bildirimler ve güncelleme kontrolünü yapar.
Veriler sadece telefonda saklanır, bu depoya hiçbir kişisel bilgi gönderilmez.
