'use strict';
/* Elif Apartmanı – kira ve kömür takibi
   Veriler telefonda saklanır (Android köprüsü), tarayıcıda denerken localStorage kullanılır. */

var W = (typeof window !== 'undefined') ? window : {};
var BR = (typeof window !== 'undefined' && window.Android) ? window.Android : null;
var APK_URL = 'https://github.com/muratyasa/elif-apartmani/releases/latest/download/ElifApartmani.apk';

var AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
var AYK = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
var DURUM = { odendi: 'Ödendi', gecikti: 'Gecikti', kismi: 'Kısmi', bekliyor: 'Bekliyor', yok: 'Boş', tanimsiz: 'Kira yok' };
var TUR = { kira: 'Kira', aidat: 'Aidat', komur: 'Kömür', diger: 'Diğer' };

/* ---------- Veri ---------- */
function bosVeri() {
  return {
    surum: 1,
    daireler: [],
    odemeler: [],
    taksitler: [],
    komur: [],
    notlar: [],
    silinenler: [],
    giderler: [],
    ayarlar: { hatirlatGun: [0], gecikme: true, gecikmeSiklik: 3, bildirimDuzeni: 2, saat: 10, bildirimGoruldu: '', aidat: { yaz: 300, kis: 1300, kisBas: 10, kisBit: 4 } },
    sonYedek: ''
  };
}
var DB = bosVeri();

function yukle() {
  var raw = '';
  try { raw = BR ? BR.load() : (localStorage.getItem('elif-db') || ''); } catch (e) { raw = ''; }
  if (!raw) return;
  try { DB = normalize(JSON.parse(raw)); } catch (e) { toast('Kayıtlar okunamadı'); }
}
function normalize(o) {
  var b = bosVeri();
  var d = Object.assign(b, o || {});
  d.ayarlar = Object.assign(bosVeri().ayarlar, (o && o.ayarlar) || {});
  d.ayarlar.aidat = Object.assign(bosVeri().ayarlar.aidat, (o && o.ayarlar && o.ayarlar.aidat) || {});
  /* Yeni bildirim düzeni (24.10.2026): ödeme günü + ödenmezse 3 günde bir */
  if (!(o && o.ayarlar && o.ayarlar.bildirimDuzeni >= 2)) {
    d.ayarlar.hatirlatGun = [0]; d.ayarlar.gecikme = true; d.ayarlar.gecikmeSiklik = 3; d.ayarlar.bildirimDuzeni = 2;
  }
  if (!Array.isArray(d.daireler)) d.daireler = [];
  if (!Array.isArray(d.odemeler)) d.odemeler = [];
  if (!Array.isArray(d.taksitler)) d.taksitler = [];
  if (!Array.isArray(d.komur)) d.komur = [];
  if (!Array.isArray(d.notlar)) d.notlar = [];
  if (!Array.isArray(d.silinenler)) d.silinenler = [];
  if (!Array.isArray(d.giderler)) d.giderler = [];
  /* Düzeltme (24.10.2026): Daire 17 girişi 15.07.2023 */
  (d.daireler || []).forEach(function (x) {
    if (x.no === '17' && x.kiraci === 'Esma Görünüş' && x.girisTarihi === '2026-07-15') {
      x.girisTarihi = '2023-07-15'; x.baslangic = '2023-07'; x.takipBas = '2026-07';
    }
  });
  /* Düzeltme (24.10.2026): Daire 30 ve 32'nin Ekim 2026 kira artışı yapıldı */
  (d.daireler || []).forEach(function (x) {
    if ((x.no === '24' || x.no === '30' || x.no === '32') && x.girisTarihi === '2025-10-15' && !(x.kiraArtislari || []).length) {
      x.kiraArtislari = [{ ay: '2026-10', eski: +x.kira || 0, yeni: +x.kira || 0, not: 'Ekim 2026 artışı yapıldı' }];
    }
  });
  /* Düzeltme: 9.834 ₺ petek başına fiyattı; ton fiyatı 16.390 ₺, petek başına 600 kg (tutarlar değişmez) */
  d.komur.forEach(function (z) {
    if (+z.tonFiyati === 9834 && !z.petekKg) {
      z.tonFiyati = 16390; z.petekKg = 600;
      Object.keys(z.daireler || {}).forEach(function (k) { var e = z.daireler[k]; if (e && +e.kg) e.kg = Math.round(+e.kg * 0.6); });
    }
  });
  IDX = null;
  return d;
}
function kaydetYerel() {
  IDX = null;
  var s = JSON.stringify(DB);
  try {
    if (BR) BR.save(s); else localStorage.setItem('elif-db', s);
  } catch (e) { toast('Kaydedilemedi'); }
}
function kaydet() {
  kaydetYerel();
  hatirlatmalariGonder();
  if (typeof gonderZamanla === 'function') gonderZamanla();
}
/* Yedek dosyasına giriş bilgileri ve eşitleme izleri konmaz */
function temizVeri() {
  var o = {};
  Object.keys(DB).forEach(function (k) { if (k.charAt(0) !== '_') o[k] = DB[k]; });
  return o;
}
function yeniId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

/* ---------- Tarih ---------- */
function pad(n) { return String(n).padStart(2, '0'); }
function fromDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function bugun() { return fromDate(new Date()); }
function buAy() { return bugun().slice(0, 7); }
function toDate(s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2] || 1, 12); }
function ayEkle(ym, n) {
  var p = ym.split('-').map(Number), y = p[0], m = p[1] + n;
  y += Math.floor((m - 1) / 12);
  m = ((m - 1) % 12 + 12) % 12 + 1;
  return y + '-' + pad(m);
}
function gunEkle(s, n) { var d = toDate(s); d.setDate(d.getDate() + n); return fromDate(d); }
function gunFark(a, b) { return Math.round((toDate(b) - toDate(a)) / 86400000); }
function aydakiGun(ym) { var p = ym.split('-').map(Number); return new Date(p[0], p[1], 0).getDate(); }
function ayAdi(ym) { var p = ym.split('-'); return AYLAR[+p[1] - 1] + ' ' + p[0]; }
function ayKisa(ym) { var p = ym.split('-'); return AYK[+p[1] - 1] + ' ' + p[0].slice(2); }
function tarihAdi(s, yil) {
  if (!s) return '';
  var p = s.split('-');
  return (+p[2]) + ' ' + AYLAR[+p[1] - 1] + (yil === false ? '' : ' ' + p[0]);
}
function sezonu(s) { var p = s.split('-').map(Number); return p[1] >= 7 ? p[0] + '-' + (p[0] + 1) : (p[0] - 1) + '-' + p[0]; }
function sezonEkle(sz, n) { var y = +sz.split('-')[0] + n; return y + '-' + (y + 1); }
function kalanGunMetni(g) {
  if (g === 0) return 'bugün';
  if (g === 1) return 'yarın';
  if (g > 1) return g + ' gün sonra';
  if (g === -1) return 'dün';
  return (-g) + ' gün önce';
}

/* ---------- Para ---------- */
var NF = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });
function TL(v) { return NF.format(+v || 0) + ' ₺'; }
function sayi(v) {
  if (typeof v === 'number') return v;
  var s = String(v || '').trim().replace(/\s/g, '').replace(/₺/g, '');
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); /* 2.400 ve 16.000 binlik ayırıcıyla yazılır */
  var n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

/* ---------- Hesaplar ---------- */
function daireSirala(a, b) { return String(a.no).localeCompare(String(b.no), 'tr', { numeric: true }); }
function daireler() { return DB.daireler.slice().sort(daireSirala); }
function daireBul(id) { for (var i = 0; i < DB.daireler.length; i++) if (DB.daireler[i].id === id) return DB.daireler[i]; return null; }
function depozitoDurumu(d) {
  if (d.bos) return '';
  if (d.depozitoDurum) return d.depozitoDurum;
  return (d.depozitoAlindi || +d.depozito > 0) ? 'alindi' : '';
}
function bosAdi(d) { return d.ortak ? (d.not || 'Kiraya verilmiyor') : 'Boş daire'; }
function daireAdi(d) { return d ? 'Daire ' + d.no : 'Silinmiş daire'; }

function vadeGunu(d, ym) {
  var g = Math.min(Math.max(1, parseInt(d.odemeGunu, 10) || 1), aydakiGun(ym));
  return ym + '-' + pad(g);
}
function baslangicAyi(d) {
  var b = d.baslangic || (d.olusturma ? d.olusturma.slice(0, 7) : '2000-01');
  return d.takipBas && d.takipBas > b ? d.takipBas : b;
}
/* Kira tutarı o ay neydi? Artışlardan önceki aylar eski tutarla hesaplanır. */
function kiraTutari(d, ym) {
  var t = +d.kira || 0;
  (d.kiraArtislari || []).slice().sort(function (a, b) { return a.ay < b.ay ? 1 : -1; })
    .forEach(function (a) { if (ym < a.ay) t = +a.eski || 0; });
  return t;
}
/* Yıllık kira artış günü: giriş (veya sözleşme başlangıcı) tarihinin yıl dönümü */
function artisBaz(d) { return d.girisTarihi || d.sozlesmeBas || ''; }
function sonrakiArtis(d) {
  var baz = artisBaz(d);
  if (!baz || d.bos) return '';
  var y = +bugun().slice(0, 4) - 1, t;
  do { t = y + baz.slice(4); y++; } while (t <= baz || t < gunEkle(bugun(), -30));
  return t;
}
function artisYapildiMi(d, tarih) {
  return (d.kiraArtislari || []).some(function (a) { return a.ay === tarih.slice(0, 7); });
}
/* Ödeme toplamları için önbellek; her kayıtta sıfırlanır */
var IDX = null;
function odenenToplam(tur, did, donem) {
  if (!IDX) {
    IDX = {};
    DB.odemeler.forEach(function (o) {
      var k = o.tur + '|' + o.daireId + '|' + o.donem;
      IDX[k] = (IDX[k] || 0) + (+o.tutar || 0);
    });
  }
  return IDX[tur + '|' + did + '|' + donem] || 0;
}
function kiraOdenen(did, ym) { return odenenToplam('kira', did, ym); }
/* O ay dairede kiracı var mıydı? (şimdiki kiracı veya eski kiracıların dönemleri) */
function kiraciDonemi(d, ym) {
  if (!d.bos && ym >= baslangicAyi(d)) return true;
  return (d.eskiKiracilar || []).some(function (k) { return ym >= (k.giris || '0000-00') && ym <= (k.cikis || '9999-99'); });
}
function kiraTekDurum(d, ym) {
  if (!kiraciDonemi(d, ym)) return { kod: 'yok', odenen: 0, kalan: 0, beklenen: 0, vade: '' };
  var bek = kiraTutari(d, ym), od = kiraOdenen(d.id, ym), kalan = Math.max(0, bek - od), vade = vadeGunu(d, ym), kod;
  if (bek <= 0) kod = od > 0 ? 'odendi' : 'tanimsiz';
  else if (kalan <= 0) kod = 'odendi';
  else if (bugun() > vade) kod = 'gecikti';
  else if (od > 0) kod = 'kismi';
  else kod = 'bekliyor';
  return { kod: kod, odenen: od, kalan: kalan, beklenen: bek, vade: vade };
}
/* Aidat: kış aylarında (varsayılan Ekim–Nisan) kış tutarı, diğer aylarda yaz tutarı. Daireye özel tutar girilebilir. */
function kisAyiMi(ym) {
  var A = DB.ayarlar.aidat || {}, m = +ym.slice(5), b = +A.kisBas || 10, e = +A.kisBit || 4;
  return b <= e ? (m >= b && m <= e) : (m >= b || m <= e);
}
function aidatTutar(d, ym) {
  var A = DB.ayarlar.aidat || {}, kis = kisAyiMi(ym);
  var ozel = kis ? d.aidatKis : d.aidatYaz;
  if (ozel !== undefined && ozel !== null && ozel !== '') return +ozel || 0;
  return +(kis ? A.kis : A.yaz) || 0;
}
function aidatDurum(d, ym) {
  if (!kiraciDonemi(d, ym)) return { kod: 'yok', odenen: 0, kalan: 0, beklenen: 0, vade: '' };
  var bek = aidatTutar(d, ym), od = odenenToplam('aidat', d.id, ym), kalan = Math.max(0, bek - od), vade = vadeGunu(d, ym), kod;
  if (bek <= 0) kod = 'odendi';
  else if (kalan <= 0) kod = 'odendi';
  else if (bugun() > vade) kod = 'gecikti';
  else if (od > 0) kod = 'kismi';
  else kod = 'bekliyor';
  return { kod: kod, odenen: od, kalan: kalan, beklenen: bek, vade: vade };
}
/* Aylık ödeme = kira + aidat */
function kiraDurum(d, ym) {
  var k = kiraTekDurum(d, ym);
  if (k.kod === 'yok') return k;
  var a = aidatDurum(d, ym);
  var bek = k.beklenen + a.beklenen, od = Math.min(k.odenen, k.beklenen || k.odenen) + Math.min(a.odenen, a.beklenen), kalan = k.kalan + a.kalan, kod;
  if (bek <= 0) kod = k.kod;
  else if (kalan <= 0) kod = (k.beklenen <= 0 && k.odenen <= 0) ? 'tanimsiz' : 'odendi';
  else if (bugun() > k.vade) kod = 'gecikti';
  else if (od > 0) kod = 'kismi';
  else kod = 'bekliyor';
  if (k.beklenen <= 0 && k.odenen <= 0 && kalan <= 0) kod = 'tanimsiz';
  return { kod: kod, odenen: od, kalan: kalan, beklenen: bek, vade: k.vade, kira: k, aidat: a };
}
function dokum(k) {
  if (!k.aidat || !k.aidat.kalan) return TL(k.kalan);
  if (!k.kira.kalan) return TL(k.aidat.kalan) + ' aidat';
  return TL(k.kalan) + ' (aidat dahil)';
}
/* Vadesi geçmiş, ödenmemiş aylar (en fazla 36 ay geriye) */
function kiraBorclari(d) {
  var cur = buAy(), list = [];
  for (var i = 36; i >= 0; i--) {
    var ym = ayEkle(cur, -i), k = kiraDurum(d, ym);
    if (k.kod === 'gecikti') list.push({ ym: ym, kalan: k.kalan, vade: k.vade });
  }
  return list;
}
function ilkOdenmemisAy(d) {
  var b = kiraBorclari(d);
  if (b.length) return b[0].ym;
  var cur = buAy();
  for (var i = 0; i < 3; i++) { var k = kiraDurum(d, ayEkle(cur, i)); if (k.kalan > 0) return ayEkle(cur, i); }
  return cur;
}

/* ---------- Kömür: her sezon bir ton fiyatı, her daireye kilo; borç = kilo × ton fiyatı ---------- */
function komurSezonBul(sz) { for (var i = 0; i < DB.komur.length; i++) if (DB.komur[i].sezon === sz) return DB.komur[i]; return null; }
function komurSezonAl(sz) {
  var k = komurSezonBul(sz);
  if (!k) { k = { sezon: sz, tonFiyati: 0, yuvarla: 100, sonOdeme: '', daireler: {} }; DB.komur.push(k); }
  if (!k.daireler) k.daireler = {};
  return k;
}
function yuvarla(v, adim) { adim = +adim || 0; return adim > 0 ? Math.round(v / adim) * adim : Math.round(v * 100) / 100; }
function komurHesap(sez, kg) { return yuvarla((+kg || 0) / 1000 * (+sez.tonFiyati || 0), sez.yuvarla); }
function komurOdenen(did, sz) { return odenenToplam('komur', did, sz); }
/* Daireye o sezon yazılan kömür ve ödeme durumu; kömür yazılmamışsa null */
/* Petek dağıtımı: toplam ton, bütün dairelerin toplam petek sayısına bölünür */
function toplamPetek() { return DB.daireler.reduce(function (t, x) { return t + (parseInt(x.petek, 10) || 0); }, 0); }
function petekBasinaKg(sez) {
  var tp = toplamPetek();
  return sez && +sez.toplamTon > 0 && tp > 0 ? (+sez.toplamTon * 1000) / tp : 0;
}
function komurDurum(d, sez) {
  if (!sez) return null;
  var e = (sez.daireler || {})[d.id];
  var pb = +sez.petekKg > 0 ? +sez.petekKg : petekBasinaKg(sez), petek = parseInt(d.petek, 10) || 0;
  if ((!e || !(+e.kg > 0 || +e.tutar > 0)) && pb > 0 && petek > 0) {
    e = { kg: Math.round(pb * petek * 10) / 10, tutar: null, otomatik: true };
  }
  var od = komurOdenen(d.id, sez.sezon);
  if (!e || !(+e.kg > 0 || +e.tutar > 0)) {
    if (od > 0) return { kod: 'odendi', kg: 0, beklenen: od, odenen: od, kalan: 0 };
    return null;
  }
  var bek = (e.tutar !== null && e.tutar !== undefined && e.tutar !== '') ? +e.tutar : komurHesap(sez, e.kg);
  var kalan = Math.max(0, Math.round((bek - od) * 100) / 100), kod;
  if (kalan <= 0) kod = 'odendi';
  else if (sez.sonOdeme && bugun() > sez.sonOdeme) kod = 'gecikti';
  else if (od > 0) kod = 'kismi';
  else kod = 'bekliyor';
  return { kod: kod, kg: +e.kg || 0, beklenen: bek, odenen: od, kalan: kalan, otomatik: !!e.otomatik, elle: e.tutar !== null && e.tutar !== undefined && e.tutar !== '' };
}
function kgMetni(kg) { return NF.format(+kg || 0) + ' kg'; }

/* ---------- Bildirim listesi (telefon her gün buradan bakar) ---------- */
function hatirlatmaListesi() {
  var A = DB.ayarlar, gun0 = bugun(), son = gunEkle(gun0, 90), kovalar = {};
  var gunler = (A.hatirlatGun || []).map(Number).filter(function (n) { return n >= 0; });
  function ekle(tarih, tip, gunSayisi, d, txt) {
    if (tarih < gun0 || tarih > son) return;
    var k = tarih + '|' + tip + '|' + gunSayisi;
    if (!kovalar[k]) kovalar[k] = { tarih: tarih, tip: tip, gun: gunSayisi, satirlar: [], ids: [] };
    kovalar[k].satirlar.push(kisi(d) + ' – ' + txt);
    if (kovalar[k].ids.indexOf(d.id) < 0) kovalar[k].ids.push(d.id);
  }
  /* Gecikme: ödeme gününden N gün sonra, ödenmezse yine N günde bir (N = seçilen sıklık) */
  var siklik = +A.gecikmeSiklik || 3;
  function gecikmeGunleri(vade) {
    var l = [];
    for (var t = gunEkle(vade, siklik); t <= son; t = gunEkle(t, siklik)) if (t >= gun0) l.push(t);
    return l;
  }
  function kisi(d) { return 'Daire ' + d.no + (d.kiraci ? ' (' + d.kiraci + ')' : ''); }
  var cur = buAy();
  DB.daireler.forEach(function (d) {
    for (var i = -24; i <= 3; i++) {
      var ym = ayEkle(cur, i), k = kiraDurum(d, ym);
      if (k.kalan <= 0) continue;
      gunler.forEach(function (g) { ekle(gunEkle(k.vade, -g), 'kira', g, d, dokum(k)); });
      if (A.gecikme) gecikmeGunleri(k.vade).forEach(function (t) { ekle(t, 'kira-gec', 0, d, ayAdi(ym) + ', ' + dokum(k)); });
    }
    DB.komur.forEach(function (sez) {
      if (!sez.sonOdeme || d.bos) return;
      var k = komurDurum(d, sez);
      if (!k || k.kalan <= 0) return;
      gunler.forEach(function (g) { ekle(gunEkle(sez.sonOdeme, -g), 'komur', g, d, TL(k.kalan)); });
      if (A.gecikme) gecikmeGunleri(sez.sonOdeme).forEach(function (t) { ekle(t, 'komur-gec', 0, d, sez.sezon + ' kömürü, ' + TL(k.kalan)); });
    });
    if (depozitoDurumu(d) === 'alinmadi') {
      /* 10 günde bir (her gün yeniden hesaplanınca kaymasın diye takvime sabit günler) */
      for (var t2 = gun0; t2 <= son; t2 = gunEkle(t2, 1)) if (Math.floor(toDate(t2).getTime() / 86400000) % 10 === 0) ekle(t2, 'depozito', 0, d, +d.kira ? TL(d.kira) : 'tutar girilmemiş');
    }
    var art = sonrakiArtis(d);
    if (art && !artisYapildiMi(d, art)) [30, 7, 0].forEach(function (g) { ekle(gunEkle(art, -g), 'artis', g, d, TL(d.kira) + ' → artış ' + tarihAdi(art)); });
  });
  var ozetler = ayOzetiBildirimi(gun0, son).concat(beyanBildirimi(gun0, son));
  return Object.keys(kovalar).sort().map(function (key) {
    var b = kovalar[key], n = b.ids.length, baslik, ust;
    var satirlar = b.satirlar.slice(0, 12);
    if (b.satirlar.length > 12) satirlar.push('… ve ' + (b.satirlar.length - 12) + ' kayıt daha');
    if (b.tip === 'kira') {
      baslik = (b.gun === 0 ? 'Bugün kira günü' : 'Kira ' + b.gun + ' gün sonra') + ' · ' + n + ' daire';
      ust = b.gun === 0 ? 'Bugün ödemesi gelmesi gerekenler:' : tarihAdi(gunEkle(b.tarih, b.gun), false) + ' günü ödemesi gelecek olanlar:';
    } else if (b.tip === 'komur') {
      baslik = (b.gun === 0 ? 'Bugün kömür ödeme günü' : 'Kömür ödemesi ' + b.gun + ' gün sonra') + ' · ' + n + ' daire';
      ust = 'Kömür ödemesi bekleyenler:';
    } else if (b.tip === 'kira-gec') {
      baslik = 'Ödenmemiş kira · ' + n + ' daire';
      ust = 'Ödeme günü geçtiği halde kirası girilmemiş daireler:';
    } else if (b.tip === 'komur-gec') {
      baslik = 'Ödenmemiş kömür · ' + n + ' daire';
      ust = 'Ödeme günü geçtiği halde kömür ödemesi girilmemiş daireler:';
    } else if (b.tip === 'artis') {
      baslik = (b.gun === 0 ? 'Bugün kira artış günü' : 'Kira artışına ' + b.gun + ' gün kaldı') + ' · ' + n + ' daire';
      ust = 'Yıllık kira artış zamanı gelen daireler:';
    } else if (b.tip === 'depozito') {
      baslik = 'Depozito alınmadı · ' + n + ' daire';
      ust = 'Depozitosu henüz alınmamış daireler:';
    } else {
      baslik = (b.gun === 0 ? 'Bugün sözleşmesi bitiyor' : 'Sözleşme ' + b.gun + ' gün sonra bitiyor') + ' · ' + n + ' daire';
      ust = 'Kira sözleşmesi bitenler:';
    }
    return { tarih: b.tarih, tur: b.tip, baslik: baslik, metin: ust + '\n' + satirlar.join('\n'), daireler: b.ids };
  }).concat(ozetler).sort(function (a, b) { return a.tarih < b.tarih ? -1 : a.tarih > b.tarih ? 1 : 0; });
}
function hatirlatmalariGonder() {
  if (!BR || !BR.setReminders) return;
  try { BR.setReminders(JSON.stringify({ saat: DB.ayarlar.saat, items: hatirlatmaListesi() })); } catch (e) { /* yoksay */ }
}

/* ---------- Arayüz yardımcıları ---------- */
function $(s) { return document.querySelector(s); }
function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
var toastZamani = null;
var toastGeriAl = null;
var toastEk = null;
function toast(msg, geriAl, ek) {
  if (typeof document === 'undefined') return;
  var t = $('#toast');
  toastGeriAl = geriAl || null; toastEk = ek || null;
  t.innerHTML = '<span>' + esc(msg) + '</span>' + (ek ? '<button type="button" class="toast-btn ek" data-act="toast-ek">' + esc(ek.metin) + '</button>' : '') +
    (geriAl ? '<button type="button" class="toast-btn" data-act="geri-al">Geri al</button>' : '');
  t.hidden = false;
  clearTimeout(toastZamani);
  toastZamani = setTimeout(function () { t.hidden = true; toastGeriAl = null; toastEk = null; }, ek ? 9000 : geriAl ? 6000 : 2600);
}
/* ---------- Simgeler: her konu için tek, tutarlı simge ---------- */
var IK = {
  kisi: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5z',
  para: 'M2 6h20v12H2V6zm2 2v8h16V8H4zm8 1.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
  alev: 'M12 2c1 3.5 5 6 5 11a5 5 0 0 1-10 0c0-2.2 1-3.8 2.2-5.2.3 1.6 1.1 2.7 2.3 3.2C11 8.5 11.3 5 12 2z',
  bina: 'M5 3h14v18h-5v-4h-4v4H5V3zm3 3v2h2V6H8zm6 0v2h2V6h-2zm-6 4v2h2v-2H8zm6 0v2h2v-2h-2z',
  takvim: 'M7 2h2v2h6V2h2v2h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V2zM5 9v10h14V9H5z',
  uyari: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
  bilgi: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
  arac: 'M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z',
  fis: 'M6 2h12a2 2 0 0 1 2 2v18l-3-2-2 2-3-2-3 2-2-2-3 2V4a2 2 0 0 1 2-2zm2 5v2h8V7H8zm0 4v2h8v-2H8z',
  onay: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z',
  saat: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm.5 5H11v6l5.2 3.2.8-1.3-4.5-2.7V7z',
  unlem: 'M11 4h2v11h-2zm0 13h2v3h-2z',
  yarim: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2v16a8 8 0 0 1 0-16z',
  grafik: 'M4 20V10h3v10H4zm6 0V4h3v16h-3zm6 0v-7h3v7h-3z',
  kilit: 'M12 1a5 5 0 0 0-5 5v3H5v13h14V9h-2V6a5 5 0 0 0-5-5zm-3 8V6a3 3 0 0 1 6 0v3H9zm3 4a2 2 0 0 1 1 3.7V19h-2v-2.3A2 2 0 0 1 12 13z',
  artis: 'M16 6l2.3 2.3-4.9 4.9-4-4L2 16.6 3.4 18l6-6 4 4 6.3-6.3L22 12V6h-6z',
  zil: 'M12 22a2.5 2.5 0 0 0 2.5-2.5h-5A2.5 2.5 0 0 0 12 22zm7-6V11c0-3.3-2-6-5-6.7V3.5a2 2 0 0 0-4 0v.8C7 5 5 7.7 5 11v5l-2 2v1h18v-1l-2-2z',
  bulut: 'M19.4 10A7.5 7.5 0 0 0 5.4 8 6 6 0 0 0 6 20h13a5 5 0 0 0 .4-10z',
  kaydet: 'M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4zm-5 16a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm3-10H5V5h10v4z',
  kalem: 'M3 17.3V21h3.8L17.8 9.9 14 6.2 3 17.3zM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8L19 8.8 20.7 7z',
  ev: 'M12 3 2 12h3v8h5v-6h4v6h5v-8h3L12 3z',
  simsek: 'M7 2v11h3v9l7-12h-4l4-8H7z',
  damla: 'M12 2.7C8.5 7 6 10.4 6 14a6 6 0 0 0 12 0c0-3.6-2.5-7-6-11.3z',
  cuzdan: 'M3 6a2 2 0 0 1 2-2h13v3H5v.5h16V20H5a2 2 0 0 1-2-2V6zm14 7a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z'
};
function ikon(ad, sinif) {
  return '<svg class="' + (sinif || 'ik') + '" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="' + IK[ad] + '"/></svg>';
}
var BASLIK_RENK = { artis: 'mor', kilit: 'sari', alev: 'turuncu', uyari: 'kirmizi', onay: 'yesil', arac: 'gri', kalem: 'gri', saat: 'gri', bilgi: 'turuncu', kaydet: 'yesil', bulut: 'mavi', zil: 'mavi' };
function baslik(ad, metin) { return '<h2 class="card-title"><span class="ct-kutu ck-' + (BASLIK_RENK[ad] || 'mavi') + '">' + ikon(ad, 'ct-ik') + '</span><span>' + metin + '</span></h2>'; }
var CHIP_IK = { odendi: 'onay', gecikti: 'unlem', kismi: 'yarim', bekliyor: 'saat' };
function chip(kod) { return '<span class="chip ' + kod + '">' + (CHIP_IK[kod] ? ikon(CHIP_IK[kod], 'chip-ik') : '') + DURUM[kod] + '</span>'; }

var S = { tab: 'ozet', ay: buAy(), sezon: sezonu(bugun()), filtre: 'hepsi', arama: '', gTur: 'hepsi', gDaire: '', guncelleme: null, elleKontrol: false };

/* ---------- Ana görünüm ---------- */
/* Üst bantta canlı tarih ve saat */
function saatGoster() {
  var el = document.getElementById('top-sub'); if (!el) return;
  var n = new Date(), gun = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'][n.getDay()];
  var ay = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'][n.getMonth()];
  el.innerHTML = '<span>' + n.getDate() + ' ' + ay + ' ' + n.getFullYear() + ', ' + gun + '</span><b>' + pad(n.getHours()) + ':' + pad(n.getMinutes()) + '</b>';
}
if (typeof setInterval === 'function' && typeof document !== 'undefined') setInterval(saatGoster, 15000);
function ciz() {
  var tabs = document.querySelectorAll('#tabs button');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('on', tabs[i].dataset.tab === S.tab);
  var nav = $('#periodnav');
  if (S.tab === 'ozet' || S.tab === 'daireler') { nav.hidden = false; $('#donem-label').textContent = ayAdi(S.ay); }
  else if (S.tab === 'komur') { nav.hidden = false; $('#donem-label').textContent = S.sezon; }
  else nav.hidden = true;
  if (!DB.daireler.length && S.tab !== 'ayarlar') nav.hidden = true;
  saatGoster();
  var html;
  if (!DB.daireler.length && S.tab !== 'ayarlar') html = vKurulum();
  else html = { ozet: vOzet, daireler: vDaireler, komur: vKomur, gecmis: vGecmis, ayarlar: vAyarlar }[S.tab]();
  $('#main').innerHTML = html;
  $('#fab').hidden = S.tab === 'ayarlar' || !DB.daireler.length;
  bildirimRozeti();
  guncellemeBandi();
}

function vKurulum() {
  return '<section class="card">' +
    '' + baslik('bina', 'Başlangıç') + '' +
    '<p class="note">Önce daireleri oluşturalım. Kiracı adı, telefon ve kira tutarını sonra her dairenin içinden tek tek girebilirsiniz.</p>' +
    '<div class="form">' +
    '<div class="grid2">' +
    '<div class="field"><label for="k-sayi">Daire sayısı</label><input id="k-sayi" type="number" inputmode="numeric" value="33" min="1" max="500"></div>' +
    '<div class="field"><label for="k-gun">Kira ödeme günü</label><input id="k-gun" type="number" inputmode="numeric" value="1" min="1" max="31"></div>' +
    '</div>' +
    '<div class="field"><label for="k-kira">Aylık kira (hepsi için, boş bırakılabilir)</label><input id="k-kira" inputmode="decimal" placeholder="Örn. 6000"></div>' +
    '<button type="button" class="btn block" data-act="kurulum">Daireleri oluştur</button>' +
    '</div></section>' +
    '<section class="card">' + baslik('kaydet', 'Yedeğiniz var mı?') + '' +
    '<p class="note">Daha önce aldığınız bir yedek dosyasını yükleyebilirsiniz.</p>' +
    '<button type="button" class="btn ghost block" data-act="yedek-yukle">Yedekten geri yükle</button>' +
    '<button type="button" class="btn ghost block" data-act="metin-ac">Metinden yükle (kopyala-yapıştır)</button></section>';
}

function vOzet() {
  var ay = S.ay, bek = 0, od = 0, c = { odendi: 0, gecikti: 0, kismi: 0, bekliyor: 0, yok: 0, tanimsiz: 0 };
  daireler().forEach(function (d) {
    var k = kiraDurum(d, ay);
    bek += k.beklenen; od += Math.min(k.odenen, k.beklenen || k.odenen); c[k.kod]++;
  });
  var yuzde = bek ? Math.min(100, Math.round(od / bek * 100)) : 0;
  var gun0 = bugun(), geciken = [], yaklasan = [];
  daireler().forEach(function (d) {
    var b = kiraBorclari(d);
    if (b.length) geciken.push({ d: d, b: b, toplam: b.reduce(function (t, x) { return t + x.kalan; }, 0) });
    [buAy(), ayEkle(buAy(), 1)].forEach(function (ym) {
      var k = kiraDurum(d, ym);
      if (k.kod === 'bekliyor' || k.kod === 'kismi') {
        var g = gunFark(gun0, k.vade);
        if (g >= 0 && g <= 7) yaklasan.push({ d: d, ym: ym, k: k, g: g });
      }
    });
  });
  geciken.sort(function (a, b) { return b.toplam - a.toplam; });
  yaklasan.sort(function (a, b) { return a.g - b.g || daireSirala(a.d, b.d); });

  var eksikAbone = DB.daireler.filter(function (d) { return !d.elkAbone && !d.ortak; }).length;
  var eksikSu = DB.daireler.filter(function (d) { return !d.suAbone && !d.ortak; }).length;
  var eksikPetek = DB.daireler.filter(function (d) { return !d.petek && !d.ortak; }).length;
  var eksikler = [];
  if (eksikAbone) eksikler.push(eksikAbone + ' dairenin elektrik abone numarası');
  if (eksikSu) eksikler.push(eksikSu + ' dairenin su abone numarası');
  if (eksikPetek) eksikler.push(eksikPetek + ' dairenin petek sayısı');
  var artislar = daireler().map(function (d) { var t = sonrakiArtis(d); return t && !artisYapildiMi(d, t) ? { d: d, t: t, g: gunFark(bugun(), t) } : null; })
    .filter(function (x) { return x && x.g <= 45; }).sort(function (a, b) { return a.g - b.g; });
  var depYok = daireler().filter(function (d) { return depozitoDurumu(d) === 'alinmadi'; });
  var depBilinmez = DB.daireler.filter(function (d) { return !d.bos && !depozitoDurumu(d); }).length;
  var h = (eksikler.length ? '<section class="card"><div class="card-head">' + baslik('bilgi', 'Eksik bilgi') +
    '<button type="button" class="link" data-act="abonelikler">Tamamla</button></div>' +
    '<p class="note warn">' + eksikler.join(', ') + ' girilmemiş.</p></section>' : '') +
    (artislar.length ? '<section class="card">' + baslik('artis', 'Kira artışı yaklaşanlar') + '<div class="list">' + artislar.map(function (x) {
      return satirSar(x.d, '<button type="button" class="row" data-act="artis-ac" data-id="' + x.d.id + '"><span class="no">' + esc(x.d.no) + '</span>' +
        '<span class="row-main"><span class="row-title">' + esc(x.d.kiraci || 'Kiracı') + '</span><span class="row-sub">' + esc(tarihAdi(x.t, false)) + ' · ' +
        (x.g < 0 ? '<span style="color:var(--bad)">' + kalanGunMetni(x.g) + '</span>' : kalanGunMetni(x.g)) + '</span>' +
        '<span class="artis-tutar">' + TL(x.d.kira) + (oneriKira(x.d) ? ' <span class="ok-isaret">→</span> <b>' + TL(oneriKira(x.d)) + '</b>' : '') + '</span></span></button>');
    }).join('') + '</div></section>' : '') +
    (depYok.length || depBilinmez ? '<section class="card">' + baslik('kilit', 'Depozito') +
      (depYok.length ? '<p class="note warn">' + depYok.length + ' dairenin depozitosu alınmadı.</p><div class="list">' + depYok.map(function (d) {
        return satirSar(d, '<button type="button" class="row" data-act="daire-ac" data-id="' + d.id + '"><span class="no">' + esc(d.no) + '</span>' +
          '<span class="row-main"><span class="row-title">' + esc(d.kiraci || 'Kiracı') + '</span><span class="row-sub">' + (d.girisTarihi ? 'Giriş ' + esc(tarihAdi(d.girisTarihi)) : 'Depozito bekleniyor') + '</span></span>' +
          (+d.kira ? '<span class="row-end"><span class="amt">' + TL(d.kira) + '</span></span>' : '') + '</button>');
      }).join('') + '</div>' : '') +
      (depBilinmez ? '<p class="note">' + depBilinmez + ' dairenin depozito durumu girilmemiş.</p>' : '') + '</section>' : '') +
    
    '<section class="card">' +
    baslik('para', esc(ayAdi(ay)) + ' kira + aidat') +
    '<div class="big">' + TL(od) + ' <small>/ ' + TL(bek) + '</small></div>' +
    '<div class="bar" role="img" aria-label="Yüzde ' + yuzde + ' toplandı"><i style="width:' + yuzde + '%"></i></div>' +
    '<div class="counts"><span><b>' + c.odendi + '</b> ödedi</span>' +
    (c.gecikti ? '<span><b>' + c.gecikti + '</b> gecikti</span>' : '') +
    (c.kismi ? '<span><b>' + c.kismi + '</b> kısmi</span>' : '') +
    '<span><b>' + c.bekliyor + '</b> bekliyor</span>' +
    (c.yok ? '<span><b>' + c.yok + '</b> boş</span>' : '') +
    (c.tanimsiz ? '<span><b>' + c.tanimsiz + '</b> kira girilmemiş</span>' : '') + '</div>' +
    '</section>';

  if (!geciken.length && !yaklasan.length) {
    h += '<section class="card ok-kart">' + ikon('onay', 'ok-ik') + '<div><b>Geciken ödeme yok</b><br><span class="muted">Önümüzdeki 7 günde ödeme günü gelen daire de yok.</span></div></section>';
  } else {
  if (geciken.length) {
  h += '<section class="card"><div class="card-head">' + baslik('uyari', 'Ödemesi geciken') +
    (geciken.length ? '<span class="amt bad">' + TL(geciken.reduce(function (t, x) { return t + x.toplam; }, 0)) + '</span>' : '') + '</div>';
  {
    h += '<div class="list">';
    geciken.forEach(function (x) {
      var aylar = x.b.map(function (b) { return ayKisa(b.ym); }).join(', ');
      h += satirSar(x.d, '<button type="button" class="row" data-act="daire-ac" data-id="' + x.d.id + '">' +
        '<span class="no">' + esc(x.d.no) + '</span>' +
        '<span class="row-main"><span class="row-title">' + esc(x.d.kiraci || 'Kiracı girilmemiş') + '</span>' +
        '<span class="row-sub">' + x.b.length + ' ay: ' + esc(aylar) + '</span></span>' +
        '<span class="row-end"><span class="amt bad">' + TL(x.toplam) + '</span></span></button>');
    });
    h += '</div>';
  }
  h += '</section>';
  }
  h += '<section class="card">' + baslik('takvim', 'Önümüzdeki 7 gün');
  if (!yaklasan.length) h += '<p class="empty">Bu hafta ödeme günü gelen daire yok.</p>';
  else {
    h += '<div class="list">';
    yaklasan.forEach(function (x) {
      h += satirSar(x.d, '<button type="button" class="row" data-act="daire-ac" data-id="' + x.d.id + '">' +
        '<span class="no">' + esc(x.d.no) + '</span>' +
        '<span class="row-main"><span class="row-title">' + esc(x.d.kiraci || 'Kiracı girilmemiş') + '</span>' +
        '<span class="row-sub">' + esc(tarihAdi(x.k.vade, false)) + ' · ' + kalanGunMetni(x.g) + '</span></span>' +
        '<span class="row-end"><span class="amt">' + TL(x.k.kalan) + '</span></span></button>');
    });
    h += '</div>';
  }
  h += '</section>';
  }

  var sz = sezonu(gun0), sez = komurSezonBul(sz);
  if (sez) {
    var kb = 0, ko = 0, kGec = 0, kBorclu = 0;
    DB.daireler.forEach(function (d) {
      var k = komurDurum(d, sez); if (!k) return;
      kb += k.beklenen; ko += Math.min(k.odenen, k.beklenen);
      if (k.kalan > 0) kBorclu++; if (k.kod === 'gecikti') kGec++;
    });
    var ky = kb ? Math.min(100, Math.round(ko / kb * 100)) : 0;
    h += '<section class="card"><div class="card-head">' + baslik('alev', 'Kömür ' + esc(sz)) +
      '<button type="button" class="link" data-act="sekme" data-tab="komur">Ayrıntı</button></div>' +
      '<div class="big">' + TL(ko) + ' <small>/ ' + TL(kb) + '</small></div>' +
      '<div class="bar"><i style="width:' + ky + '%"></i></div>' +
      '<div class="counts"><span><b>' + kBorclu + '</b> dairenin kömür borcu var</span>' + (kGec ? '<span><b>' + kGec + '</b> gecikti</span>' : '') + '</div></section>';
  }
  h += islerKarti();
  h += '<button type="button" class="btn ghost block ik-btn" data-act="rapor">' + ikon('grafik') + 'Gelir raporu</button>';
  return h;
}

function kalemSatiri(ad, x) {
  if (x.kod === 'tanimsiz') return '<span class="kalem"><span class="k-ad">' + ad + '</span><span class="k-tutar muted">—</span>' + chip('tanimsiz') + '</span>';
  if (x.beklenen <= 0 && x.odenen <= 0) return '<span class="kalem"><span class="k-ad">' + ad + '</span><span class="k-tutar muted">—</span><span class="k-not">Kiraya dahil</span></span>';
  return '<span class="kalem"><span class="k-ad">' + ad + '</span><span class="k-tutar' + (x.kod === 'gecikti' ? ' bad' : '') + '">' + TL(x.kalan > 0 ? x.kalan : x.beklenen) + '</span>' + chip(x.kod) + '</span>';
}
function daireSatiri(d, ay) {
  var k = kiraDurum(d, ay), alt;
  if (k.kod === 'yok') alt = '<span class="row-sub">' + (d.ortak ? 'Kiraya verilmiyor' : 'Kiracı yok' + (bosGun(d) !== null ? ' · ' + bosGun(d) + ' gündür boş' : '')) + '</span>';
  else alt = '<span class="kalemler">' + kalemSatiri('Kira', k.kira) + kalemSatiri('Aidat', k.aidat) + '</span>';
  var hizli = (k.kod === 'bekliyor' || k.kod === 'gecikti' || k.kod === 'kismi') && k.kalan > 0
    ? '<button type="button" class="paid-btn" data-act="hizli-odendi" data-id="' + d.id + '" aria-label="Daire ' + esc(d.no) + ' ' + esc(ayAdi(ay)) + ' kirası ödendi">✓</button>' : '';
  return '<div class="row-wrap"><button type="button" class="row daire-row" data-act="daire-ac" data-id="' + d.id + '">' +
    '<span class="no">' + esc(d.no) + '</span>' +
    '<span class="row-main"><span class="row-title">' + esc(d.bos ? bosAdi(d) : (d.kiraci || 'Kiracı girilmemiş')) + '</span>' + alt + '</span>' +
    '<span class="petek-sut">' + (d.petek ? '<b>' + d.petek + '</b><small>petek</small>' : '') + '</span></button>' + (hizli || '<span class="paid-yer"></span>') + '</div>';
}
function daireFiltreli() {
  var ay = S.ay, q = S.arama.trim().toLocaleLowerCase('tr');
  return daireler().filter(function (d) {
    var k = kiraDurum(d, ay);
    if (S.filtre === 'odemeyen' && !(k.kod === 'gecikti' || k.kod === 'bekliyor' || k.kod === 'kismi')) return false;
    if (S.filtre === 'odeyen' && k.kod !== 'odendi') return false;
    if (S.filtre === 'bos' && (k.kod !== 'yok' || d.ortak)) return false;
    if (q) {
      var metin = (d.no + ' ' + (d.kiraci || '') + ' ' + (d.telefon || '') + ' ' + (d.elkAbone || '') + ' ' + (d.elkTesisat || '') + ' ' + (d.suAbone || '') + ' ' + (d.telefon2 || '') + ' ' + (d.kefilAd || '') + ' ' + (d.eskiKiracilar || []).map(function (k) { return k.ad; }).join(' ')).toLocaleLowerCase('tr');
      if (metin.indexOf(q) < 0) return false;
    }
    return true;
  });
}
function daireListesiHtml() {
  var l = daireFiltreli();
  if (!l.length) return '<p class="empty">Bu filtreye uyan daire yok.</p>';
  return l.map(function (d) { return daireSatiri(d, S.ay); }).join('');
}
function vDaireler() {
  var say = { hepsi: 0, odemeyen: 0, odeyen: 0, bos: 0 };
  DB.daireler.forEach(function (d) {
    var k = kiraDurum(d, S.ay); say.hepsi++;
    if (k.kod === 'gecikti' || k.kod === 'bekliyor' || k.kod === 'kismi') say.odemeyen++;
    if (k.kod === 'odendi') say.odeyen++;
    if (k.kod === 'yok' && !d.ortak) say.bos++;
  });
  var f = [['hepsi', 'Hepsi'], ['odemeyen', 'Ödemeyen'], ['odeyen', 'Ödeyen'], ['bos', 'Boş']];
  return '<div class="filters">' + f.map(function (x) {
    return '<button type="button" class="filter' + (S.filtre === x[0] ? ' on' : '') + '" data-act="filtre" data-v="' + x[0] + '">' + x[1] + ' <b>' + say[x[0]] + '</b></button>';
  }).join('') + '</div>' +
    '<input id="arama" type="search" placeholder="Daire no, kiracı, telefon veya abone no ara" value="' + esc(S.arama) + '" aria-label="Ara">' +
    '<section class="card"><div class="list" id="daire-listesi">' + daireListesiHtml() + '</div></section>' +
    '<div class="actions"><button type="button" class="btn ghost" data-act="abonelikler">Abonelikler (elektrik, su)</button>' +
    '<button type="button" class="btn ghost" data-act="daire-yeni">+ Daire ekle</button></div>';
}

function vKomur() {
  var sez = komurSezonBul(S.sezon), h = '';
  h += '<section class="card"><div class="card-head">' + baslik('alev', esc(S.sezon) + ' sezonu') + '' +
    '<button type="button" class="link" data-act="komur-ayar">' + (sez ? 'Fiyatı düzenle' : 'Sezonu başlat') + '</button></div>';
  if (!sez) {
    h += '<p class="empty">Bu sezon için kömür fiyatı girilmemiş. “Sezonu başlat” ile ton fiyatını girin, sonra her daireye kaç kilo yazıldığını ekleyin.</p></section>' +
      '<button type="button" class="btn ghost block" data-act="komur-hesap">Kömür hesaplama aracı</button>';
    return h;
  }
  var bek = 0, od = 0, kg = 0, borclu = 0;
  DB.daireler.forEach(function (d) {
    var k = komurDurum(d, sez); if (!k) return;
    bek += k.beklenen; od += Math.min(k.odenen, k.beklenen); kg += k.kg; if (k.kalan > 0) borclu++;
  });
  var pbk = +sez.petekKg > 0 ? +sez.petekKg : petekBasinaKg(sez);
  h += '<dl class="kv"><dt>Ton fiyatı</dt><dd>' + TL(sez.tonFiyati) + '</dd>' +
    (sez.toplamTon ? '<dt>Toplam alınan</dt><dd>' + NF.format(sez.toplamTon) + ' ton</dd>' : '') +
    (pbk ? '<dt>Petek başına</dt><dd>' + NF.format(Math.round(pbk * 10) / 10) + ' kg</dd>' : '') +
    '<dt>Toplam yazılan</dt><dd>' + kgMetni(kg) + '</dd>' +
    '<dt>Toplanan</dt><dd>' + TL(od) + ' / ' + TL(bek) + '</dd>' +
    '<dt>Kalan</dt><dd style="color:' + (bek - od > 0 ? 'var(--bad)' : 'var(--ok)') + '">' + TL(Math.max(0, bek - od)) + '</dd>' +
    komurKasaSatirlari(S.sezon, od) +
    (sez.sonOdeme ? '<dt>Son ödeme</dt><dd>' + esc(tarihAdi(sez.sonOdeme)) + '</dd>' : '') +
    '</dl>' + (borclu ? '<p class="note">' + borclu + ' dairenin kömür borcu var.</p>' : '') +
    '<button type="button" class="btn ghost block" data-act="komur-hesap">Kömür hesaplama aracı</button></section>';

  h += '<section class="card"><div class="card-head">' + baslik('bina', 'Daireler') + '</div>' +
    '<div class="list">';
  daireler().forEach(function (d) {
    var k = komurDurum(d, sez), alt;
    if (!k) alt = '<span class="row-sub">' + (d.petek ? 'Kömür yazılmamış' : 'Petek sayısı girilmemiş') + '</span>';
    else alt = (d.bos ? '<span class="row-sub">Ev sahibi payı</span>' : '') + '<span class="kalemler genis">' +
      '<span class="kalem"><span class="k-ad">Tutar</span><span class="k-tutar">' + TL(k.beklenen) + '</span>' + ((d.bos || d.ortak) && k.kod !== 'odendi' ? '<span></span>' : chip(k.kod)) + '</span>' +
      (k.kalan > 0 && k.odenen > 0 ? '<span class="kalem"><span class="k-ad">Kalan</span><span class="k-tutar' + (k.kod === 'gecikti' ? ' bad' : '') + '">' + TL(k.kalan) + '</span><span></span></span>' : '') + '</span>';
    var ode;
    if (k && (d.bos || d.ortak)) ode = '<span class="dy dy-ev" title="Ev sahibi payı" aria-label="Ev sahibi payı">' + ikon('ev') + '</span>';
    else if (k && k.kalan > 0 && k.odenen > 0) ode = '<button type="button" class="paid-btn dy-kismi" data-act="komur-ode" data-id="' + d.id + '" aria-label="Daire ' + esc(d.no) + ' kalan kömür ödemesini gir">₺</button>';
    else if (k && k.kalan > 0) ode = '<button type="button" class="paid-btn" data-act="komur-ode" data-id="' + d.id + '" aria-label="Daire ' + esc(d.no) + ' kömür ödemesi gir">₺</button>';
    else if (k && k.beklenen > 0) ode = '<span class="dy dy-ok" aria-label="Kömür tamamen ödendi">' + ikon('onay') + '</span>';
    else ode = '<span class="paid-yer"></span>';
    h += '<div class="row-wrap"><button type="button" class="row daire-row" data-act="komur-kg" data-id="' + d.id + '">' +
      '<span class="no">' + esc(d.no) + '</span>' +
      '<span class="row-main"><span class="row-title">' + esc(d.bos ? bosAdi(d) : (d.kiraci || 'Kiracı girilmemiş')) + '</span>' + alt + '</span>' +
      '<span class="petek-sut">' + (d.petek ? '<b>' + d.petek + '</b><small>petek</small>' : '') + '</span></button>' + ode + '</div>';
  });
  return h + '</div></section>';
}

/* Sezon ayarı: ton fiyatı, yuvarlama, son ödeme günü */
function komurAyarSayfasi() {
  var mevcut = komurSezonBul(S.sezon);
  sayfaAc({
    baslik: function () { return S.sezon + ' kömür fiyatı'; },
    ciz: function () {
      var x = mevcut || { tonFiyati: '', yuvarla: 100, sonOdeme: '' };
      return '<div class="form">' +
        '<div class="field"><label for="ks-fiyat">Ton fiyatı (₺)</label><input id="ks-fiyat" inputmode="decimal" value="' + esc(x.tonFiyati || '') + '" placeholder="Örn. 16.390"></div>' +
        '<div class="field"><label for="ks-yuv">Borç tutarı yuvarlansın mı?</label><select id="ks-yuv">' +
        [[0, 'Yuvarlama (kuruşu kuruşuna)'], [10, 'En yakın 10 ₺'], [50, 'En yakın 50 ₺'], [100, 'En yakın 100 ₺']].map(function (o) {
          return '<option value="' + o[0] + '"' + (+x.yuvarla === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
        }).join('') + '</select></div>' +
        '<p class="note" id="ks-ornek"></p>' +
        '<div class="field"><label for="ks-pkg">Petek başına kömür (kg)</label><input id="ks-pkg" inputmode="decimal" value="' + esc(x.petekKg || '') + '" placeholder="Örn. 600"></div>' +
        '<p class="note">Petek başına kg girilirse her dairenin kömürü = petek sayısı × bu kg olur.</p>' +
        '<div class="field"><label for="ks-ton">Toplam alınan kömür (ton, isteğe bağlı)</label><input id="ks-ton" inputmode="decimal" value="' + esc(x.toplamTon || '') + '" placeholder="Örn. 60"></div>' +
        '<p class="note" id="ks-petek"></p>' +
        '<div class="field"><label for="ks-son">Son ödeme günü (isteğe bağlı)</label><input id="ks-son" type="date" value="' + esc(x.sonOdeme || '') + '"></div>' +
        '<p class="note">Son ödeme günü girilirse, borcu kalan daireler için o güne göre hatırlatma gelir.</p>' +
        '<button type="button" class="btn block" data-act="komur-ayar-kaydet">Kaydet</button></div>';
    },
    hazir: function () {
      var ornek = function () {
        var f = sayi($('#ks-fiyat').value), y = +$('#ks-yuv').value;
        $('#ks-ornek').textContent = f ? 'Örnek: 1800 kg → ' + TL(yuvarla(1.8 * f, y)) : '';
      };
      var petekNot = function () {
        var ton = sayi($('#ks-ton').value), tp = toplamPetek();
        $('#ks-petek').textContent = !tp ? 'Dairelerin petek sayısı girilirse toplam ton petek başına bölünür ve her dairenin kilosu kendiliğinden hesaplanır.'
          : ton ? 'Toplam ' + tp + ' petek → petek başına ' + NF.format(Math.round(ton * 1000 / tp * 10) / 10) + ' kg. Kilosu elle girilmeyen dairelere petek sayısına göre pay verilir.'
          : 'Toplam ' + tp + ' petek var. Toplam tonu girerseniz her dairenin kilosu petek sayısına göre hesaplanır.';
      };
      $('#ks-ton').addEventListener('input', petekNot);
      petekNot();
      $('#ks-fiyat').addEventListener('input', ornek);
      $('#ks-yuv').addEventListener('change', ornek);
      ornek();
    }
  });
}
function komurAyarKaydet() {
  var f = sayi($('#ks-fiyat').value);
  if (!(f > 0)) { toast('Ton fiyatını girin'); return; }
  var sez = komurSezonAl(S.sezon);
  sez.tonFiyati = f; sez.yuvarla = +$('#ks-yuv').value; sez.sonOdeme = $('#ks-son').value || ''; sez.toplamTon = sayi($('#ks-ton').value); sez.petekKg = sayi($('#ks-pkg').value);
  kaydet(); sayfaKapat(); yenile(); toast('Kömür fiyatı kaydedildi');
}

/* Kömür hesaplama aracı: toplam ton × ton fiyatı, toplam petek sayısına bölünür */
function komurHesapSayfasi() {
  var sez = komurSezonBul(S.sezon) || {};
  var tp = toplamPetek();
  sayfaAc({
    baslik: function () { return 'Kömür hesaplama'; },
    ciz: function () {
      return '<div class="form">' +
        '<div class="grid2"><div class="field"><label for="kh-ton">Toplam kömür (ton)</label><input id="kh-ton" inputmode="decimal" value="' + esc(sez.toplamTon || '') + '"></div>' +
        '<div class="field"><label for="kh-fiyat">Ton fiyatı (₺)</label><input id="kh-fiyat" inputmode="decimal" value="' + esc(sez.tonFiyati || '') + '"></div></div>' +
        '<div class="field"><label for="kh-petek">Toplam petek sayısı</label><input id="kh-petek" type="number" inputmode="numeric" value="' + (tp || '') + '"></div>' +
        (tp ? '<p class="note">Dairelere girilen petek sayılarının toplamı: ' + tp + '. İsterseniz değiştirip deneme hesabı yapabilirsiniz.</p>'
          : '<p class="note">Dairelerin petek sayısı henüz girilmemiş. Toplamı elle yazabilirsiniz.</p>') +
        '</div>' +
        '<section class="card">' + baslik('grafik', 'Sonuç') + '<dl class="kv" id="kh-sonuc"></dl></section>' +
        '<section class="card">' + baslik('alev', 'Petek sayısına göre daire payı') + '<div id="kh-tablo"></div></section>' +
        '<button type="button" class="btn block" data-act="kh-kaydet">' + esc(S.sezon) + ' sezonuna kaydet</button>' +
        '<p class="note">Kaydedince ton fiyatı ve toplam ton bu sezona yazılır; kilosu elle girilmemiş her dairenin payı petek sayısına göre hesaplanır.</p>';
    },
    hazir: function () {
      var hesapla = function () {
        var ton = sayi($('#kh-ton').value), f = sayi($('#kh-fiyat').value), p = parseInt($('#kh-petek').value, 10) || 0;
        var toplam = ton * f, kgP = p ? ton * 1000 / p : 0, tlP = p ? toplam / p : 0;
        $('#kh-sonuc').innerHTML = '<dt>Toplam tutar</dt><dd>' + TL(Math.round(toplam)) + '</dd>' +
          '<dt>Petek başına kömür</dt><dd>' + (p ? NF.format(Math.round(kgP * 10) / 10) + ' kg' : '–') + '</dd>' +
          '<dt>Petek başına tutar</dt><dd>' + (p ? TL(Math.round(tlP)) : '–') + '</dd>';
        var sayilar = [];
        DB.daireler.forEach(function (d) { var n = parseInt(d.petek, 10) || 0; if (n && sayilar.indexOf(n) < 0) sayilar.push(n); });
        if (!sayilar.length) sayilar = [2, 3, 4, 5, 6];
        sayilar.sort(function (a, b) { return a - b; });
        $('#kh-tablo').innerHTML = !p ? '<p class="empty">Toplam petek sayısını girin.</p>' : '<dl class="kv">' + sayilar.map(function (n) {
          var kac = DB.daireler.filter(function (d) { return (parseInt(d.petek, 10) || 0) === n; }).length;
          return '<dt>' + n + ' petek' + (kac ? ' (' + kac + ' daire)' : '') + '</dt><dd>' + NF.format(Math.round(kgP * n * 10) / 10) + ' kg · ' + TL(Math.round(tlP * n)) + '</dd>';
        }).join('') + '</dl>';
      };
      ['kh-ton', 'kh-fiyat', 'kh-petek'].forEach(function (id) { document.getElementById(id).addEventListener('input', hesapla); });
      hesapla();
    }
  });
}
function komurHesapKaydet() {
  var ton = sayi($('#kh-ton').value), f = sayi($('#kh-fiyat').value);
  if (!(f > 0)) { toast('Ton fiyatını girin'); return; }
  var sez = komurSezonAl(S.sezon);
  sez.tonFiyati = f; sez.toplamTon = ton;
  kaydet(); sayfaKapat(); yenile(); toast(S.sezon + ' sezonu kaydedildi');
}

/* Bir daireye yazılan kömür */
function komurKgSayfasi(id) {
  var d = daireBul(id), sez = komurSezonBul(S.sezon);
  if (!sez) { toast('Önce sezonun ton fiyatını girin'); komurAyarSayfasi(); return; }
  var e = sez.daireler[d.id] || {};
  sayfaAc({
    baslik: function () { return 'Daire ' + d.no + ' · ' + sez.sezon + ' kömürü'; },
    ciz: function () {
      var k = komurDurum(d, sez);
      return '<section class="card"><div class="row-title">' + esc(d.kiraci || (d.bos ? 'Boş daire' : 'Kiracı girilmemiş')) + '</div>' +
        (k ? '<dl class="kv"><dt>Borç</dt><dd>' + TL(k.beklenen) + '</dd><dt>Ödenen</dt><dd>' + TL(k.odenen) + '</dd>' +
          '<dt>Kalan</dt><dd style="color:' + (k.kalan > 0 ? 'var(--bad)' : 'var(--ok)') + '">' + TL(k.kalan) + '</dd></dl>' : '') + '</section>' +
        '<div class="form">' +
        '<div class="field"><label for="kk-kg">Yazılan kömür (kg)</label><input id="kk-kg" inputmode="decimal" value="' + esc(e.kg || '') + '" placeholder="Örn. 1800"></div>' +
        '<p class="note" id="kk-hesap"></p>' +
        (petekBasinaKg(sez) && d.petek ? '<p class="note">Boş bırakırsanız petek sayısına göre ' + kgMetni(Math.round(petekBasinaKg(sez) * d.petek * 10) / 10) + ' hesaplanır (' + d.petek + ' petek).</p>' : '') +
        '<label class="check"><input id="kk-elle" type="checkbox"' + (e.tutar !== undefined && e.tutar !== null && e.tutar !== '' ? ' checked' : '') + '> Tutarı elle gireceğim</label>' +
        '<div class="field" id="kk-tutar-alan"><label for="kk-tutar">Kömür borcu (₺)</label><input id="kk-tutar" inputmode="decimal" value="' + esc(e.tutar !== undefined && e.tutar !== null ? e.tutar : '') + '"></div>' +
        '<button type="button" class="btn block" data-act="komur-kg-kaydet" data-id="' + d.id + '">Kaydet</button>' +
        (k && k.kalan > 0 ? '<button type="button" class="btn ghost block" data-act="komur-ode" data-id="' + d.id + '">Kömür ödemesi gir</button>' : '') +
        '</div>';
    },
    hazir: function () {
      var g = function () {
        var kg = sayi($('#kk-kg').value);
        $('#kk-hesap').textContent = kg ? NF.format(kg / 1000) + ' ton × ' + TL(sez.tonFiyati) + ' = ' + TL(komurHesap(sez, kg)) : '';
        $('#kk-tutar-alan').hidden = !$('#kk-elle').checked;
      };
      $('#kk-kg').addEventListener('input', g);
      $('#kk-elle').addEventListener('change', g);
      g();
    }
  });
}
function komurKgKaydet(id) {
  var sez = komurSezonAl(S.sezon), kg = sayi($('#kk-kg').value), elle = $('#kk-elle').checked, tutar = sayi($('#kk-tutar').value);
  if (elle && !(tutar >= 0)) { toast('Tutarı girin'); return; }
  if (!kg && !(elle && tutar > 0)) delete sez.daireler[id];
  else sez.daireler[id] = { kg: kg, tutar: elle ? tutar : null };
  kaydet(); sayfaKapat(); yenile(); toast('Kaydedildi');
}

var TUR_STIL = { kira: ['para', 'mavi'], aidat: ['bina', 'yesil'], komur: ['alev', 'turuncu'], diger: ['fis', 'gri'] };
function odemeNotu(o) { return o.not && !/^İlk yükleme/.test(o.not) ? o.not : ''; }
function odemeSatiri(o, daireGoster) {
  var d = daireBul(o.daireId), donem = '', st = TUR_STIL[o.tur] || TUR_STIL.diger;
  if ((o.tur === 'kira' || o.tur === 'aidat') && o.donem) donem = ayAdi(o.donem);
  else if (o.tur === 'komur') donem = /^\d{4}-\d{4}$/.test(o.donem || '') ? o.donem : '';
  else donem = o.aciklama || '';
  var turMetin = (TUR[o.tur] || 'Diğer') + (donem ? ' · ' + donem : '');
  var meta = [daireGoster ? '' : tarihAdi(o.tarih), o.sekil, o.kim && typeof kisaKim === 'function' ? kisaKim(o.kim) : '', odemeNotu(o)].filter(Boolean).join(' · ');
  var sol, baslikM, alt;
  if (daireGoster) {
    sol = '<span class="no">' + esc(d ? d.no : '?') + '</span>';
    baslikM = d ? (d.kiraci || (d.bos ? bosAdi(d) : daireAdi(d))) : 'Silinmiş daire';
    alt = '<span class="od-tur od-' + st[1] + '">' + ikon(st[0]) + esc(turMetin) + '</span>';
  } else {
    sol = '<span class="od-ik od-' + st[1] + '">' + ikon(st[0]) + '</span>';
    baslikM = turMetin; alt = '';
  }
  return '<button type="button" class="row od-row" data-act="odeme-duzenle" data-id="' + o.id + '">' + sol +
    '<span class="row-main"><span class="row-title">' + esc(baslikM) + '</span>' + alt +
    (meta ? '<span class="row-meta">' + esc(meta) + '</span>' : '') + '</span>' +
    '<span class="row-end"><span class="amt">' + TL(o.tutar) + '</span></span></button>';
}
function daireSecici(act, deger, hepsiMetni) {
  return '<label class="daire-secici' + (deger ? ' secili' : '') + '">' + ikon('kisi', 'ds-ik') +
    '<select data-change="' + act + '" aria-label="Daire seç"><option value="">' + hepsiMetni + '</option>' +
    daireler().map(function (d) {
      return '<option value="' + d.id + '"' + (deger === d.id ? ' selected' : '') + '>Daire ' + esc(d.no) + (d.kiraci ? ' · ' + esc(d.kiraci) : d.bos ? ' · ' + esc(bosAdi(d)) : '') + '</option>';
    }).join('') + '</select><span class="ds-ok" aria-hidden="true">▾</span></label>';
}
function vGecmis() {
  var l = DB.odemeler.filter(function (o) {
    if (S.gTur !== 'hepsi' && o.tur !== S.gTur) return false;
    if (S.gDaire && o.daireId !== S.gDaire) return false;
    return true;
  }).sort(function (a, b) { return (b.tarih + b.kayit) < (a.tarih + a.kayit) ? -1 : 1; });
  var toplam = l.reduce(function (t, o) { return t + (+o.tutar || 0); }, 0);
  var h = '<section class="card gc-ozet">' +
    '<div class="gc-toplam"><span><b>' + TL(toplam) + '</b><small>' + l.length + ' ödeme</small></span>' +
    '<button type="button" class="link gc-silinen" data-act="silinenler">Silinenler' + (DB.silinenler.length ? ' (' + DB.silinenler.length + ')' : '') + '</button>' +
    '</div><div class="gc-linkler"><button type="button" class="hap mavi" data-act="rapor">' + ikon('grafik') + 'Rapor</button>' +
    '<button type="button" class="hap kirmizi" data-act="giderler">' + ikon('cuzdan') + 'Giderler</button></div>' +
    '<div class="filters">' + [['hepsi', 'Hepsi'], ['kira', 'Kira'], ['aidat', 'Aidat'], ['komur', 'Kömür'], ['diger', 'Diğer']].map(function (x) {
      return '<button type="button" class="filter' + (S.gTur === x[0] ? ' on' : '') + '" data-act="g-tur-sec" data-v="' + x[0] + '">' + x[1] + '</button>';
    }).join('') + '</div>' +
    daireSecici('g-daire', S.gDaire, 'Bütün daireler') + '</section>';
  if (!l.length) return h + '<p class="empty">Bu seçime uyan ödeme yok.</p>';
  var gunler = [], gun = null;
  l.slice(0, 400).forEach(function (o) {
    if (!gun || gun.t !== o.tarih) { gun = { t: o.tarih, l: [], top: 0 }; gunler.push(gun); }
    gun.l.push(o); gun.top += +o.tutar || 0;
  });
  gunler.forEach(function (g) {
    h += '<div class="bk-gun gc-gun"><span>' + esc(gunBasligi(g.t)) + '</span><span>' + TL(g.top) + '</span></div>' +
      '<section class="card gc-kart"><div class="list">' + g.l.map(function (o) { return odemeSatiri(o, true); }).join('') + '</div></section>';
  });
  if (l.length > 400) h += '<p class="note">Son 400 ödeme gösteriliyor. Eskiler için daire seçin.</p>';
  return h;
}

function vAyarlar() {
  var A = DB.ayarlar, izin = BR && BR.notificationsAllowed ? BR.notificationsAllowed() : true;
  var secenek = [[0, 'Ödeme günü'], [1, '1 gün önce'], [3, '3 gün önce'], [7, '7 gün önce'], [15, '15 gün önce']];
  var h = '';
  if (BR && BR.http) {
    var ot = DB._oturum;
    h += '<section class="card">' + baslik('bulut', 'Ortak kullanım') + '' + (ot
      ? '<p class="note">Giriş yapan: <b>' + esc(ot.email) + '</b>. Bu telefondaki kayıtlar diğer telefonlarla eşitleniyor.</p>' +
        '<p class="note" id="senk-durum">' + senkDurumHtml() + '</p>' +
        '<div class="actions"><button type="button" class="btn ghost" data-act="senk-simdi">Şimdi eşitle</button>' +
        '<button type="button" class="btn ghost" data-act="senk-cikis">Çıkış yap</button></div>'
      : '<p class="note">Babanız, kardeşiniz ve siz aynı kayıtları görün: kendi e-postanızla giriş yapın.</p>' +
        '<div class="form"><div class="field"><label for="g-email">E-posta</label><input id="g-email" type="email" autocomplete="email" inputmode="email"></div>' +
        '<div class="field"><label for="g-sifre">Şifre</label><input id="g-sifre" type="password" autocomplete="current-password"></div>' +
        '<button type="button" class="btn block" data-act="senk-giris">Giriş yap</button>' +
        '<button type="button" class="link" data-act="senk-unuttum">Şifremi unuttum</button></div>') + '</section>';
  }
  h += '<section class="card">' + baslik('zil', 'Bildirimler') + '';
  if (!izin) {
    h += '<p class="note warn">Bildirim izni kapalı, hatırlatmalar gelmez.</p>' +
      '<button type="button" class="btn block" data-act="bildirim-izin">Bildirimlere izin ver</button>';
  }
  h += '<div class="field"><span class="lbl">Ne zaman hatırlatılsın?</span><div class="daychips">' +
    secenek.map(function (s) {
      var on = (A.hatirlatGun || []).indexOf(s[0]) >= 0;
      return '<button type="button" class="filter' + (on ? ' on' : '') + '" data-act="hatirlat-gun" data-v="' + s[0] + '" aria-pressed="' + on + '">' + s[1] + '</button>';
    }).join('') + '</div></div>' +
    '<div class="field"><label for="a-gecikme">Ödeme gecikince ne sıklıkla hatırlatılsın?</label><select id="a-gecikme" data-change="a-gecikme">' +
    [['0', 'Hatırlatma yapma'], ['1', 'Ertesi gün, sonra her gün'], ['3', '3 gün sonra, sonra 3 günde bir'], ['7', '7 gün sonra, sonra haftada bir']].map(function (o) {
      var sec = A.gecikme ? String(+A.gecikmeSiklik || 1) : '0';
      return '<option value="' + o[0] + '"' + (sec === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('') + '</select></div>' +
    '<div class="field"><label for="a-saat">Bildirim saati</label><select id="a-saat" data-change="a-saat">';
  for (var s = 7; s <= 21; s++) h += '<option value="' + s + '"' + (+A.saat === s ? ' selected' : '') + '>' + pad(s) + ':00</option>';
  h += '</select></div>' +
    '<button type="button" class="btn ghost block" data-act="bildirim-dene">Deneme bildirimi gönder</button>';
  h += '</section>';

  var oto = {};
  try { oto = BR && BR.backupInfo ? JSON.parse(BR.backupInfo()) : {}; } catch (e) { oto = {}; }
  var AD = DB.ayarlar.aidat || {};
  h += ekAyarlarHtml();
  h += '<section class="card">' + baslik('para', 'Aidat (bütün daireler)') + '' +
    '<div class="grid2"><div class="field"><label for="ad-yaz">Normal aidat (₺)</label><input id="ad-yaz" inputmode="decimal" value="' + esc(AD.yaz || '') + '"></div>' +
    '<div class="field"><label for="ad-kis">Kış aidatı (₺)</label><input id="ad-kis" inputmode="decimal" value="' + esc(AD.kis || '') + '"></div></div>' +
    '<div class="grid2"><div class="field"><label for="ad-bas">Kış aidatı ilk ay</label><select id="ad-bas">' +
    AYLAR.map(function (n, i) { return '<option value="' + (i + 1) + '"' + (+AD.kisBas === i + 1 ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></div>' +
    '<div class="field"><label for="ad-bit">Kış aidatı son ay</label><select id="ad-bit">' +
    AYLAR.map(function (n, i) { return '<option value="' + (i + 1) + '"' + (+AD.kisBit === i + 1 ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></div></div>' +
    '<p class="note">Farklı aidatı olan daire, kendi Düzenle ekranından ayarlanır.</p>' +
    '<button type="button" class="btn ghost block" data-act="aidat-kaydet">Aidatı kaydet</button></section>';

  h += '<section class="card">' + baslik('kaydet', 'Otomatik yedek') + '' +
    (oto.klasor
      ? '<p class="note">Her gün ve uygulamadan her çıkışta şu klasöre yedek alınıyor: <b>' + esc(oto.klasor) + '</b>. Son 30 günün yedeği saklanır.</p>' +
        (oto.son ? '<p class="note">Son otomatik yedek: ' + esc(tarihAdi(oto.son)) + '</p>' : '') +
        (oto.hata ? '<p class="note warn">' + esc(oto.hata) + '</p>' : '') +
        '<div class="actions"><button type="button" class="btn ghost" data-act="oto-simdi">Şimdi yedekle</button>' +
        '<button type="button" class="btn ghost" data-act="oto-klasor">Klasörü değiştir</button></div>'
      : '<p class="note warn">Otomatik yedek klasörü seçilmedi.</p>' +
        '<p class="note">Bir kez klasör seçin, uygulama her gün oraya kendiliğinden yedek alsın. Öneri: telefonda “Belgeler” içinde “Elif Apartmanı Yedek” adında bir klasör oluşturup onu seçin.</p>' +
        '<button type="button" class="btn block" data-act="oto-klasor">Yedek klasörü seç</button>') +
    '</section>';

  h += '<section class="card">' + baslik('bulut', 'Google Drive yedeği') + '' +
        (DB.sonYedek ? '<p class="note">Son yedek: ' + esc(tarihAdi(DB.sonYedek)) + '</p>' : '<p class="note warn">Henüz Drive\'a yedek alınmadı.</p>') +
    '<button type="button" class="btn block" data-act="drive-yedekle">Google Drive\'a yedekle</button>' +
    '<button type="button" class="btn ghost block" data-act="drive-yukle">Google Drive\'dan geri yükle</button>' +
    '<details class="note"><summary>Nasıl?</summary>' +
    '<p><b>Yedeklerken:</b> açılan menüden <b>Drive</b>’ı (Drive’a kaydet) seçin, klasörü seçip <b>Kaydet</b>’e basın.</p>' +
    '<p><b>Geri yüklerken:</b> açılan dosya ekranında sol üstteki <b>☰</b> menüden <b>Drive</b>’ı seçin, en yeni “elif-apartmani-yedek” dosyasına dokunun.</p></details>' +
    '</section>';

  h += '<section class="card">' + baslik('arac', 'Diğer') + '' +
    '<div class="actions"><button type="button" class="btn ghost" data-act="yedek-al">Dosya olarak kaydet</button>' +
    '<button type="button" class="btn ghost" data-act="yedek-yukle">Dosyadan yükle</button></div>' +
    '<button type="button" class="btn ghost block" data-act="metin-ac">Metinden yükle (kopyala-yapıştır)</button>' +
    '<button type="button" class="btn ghost block" data-act="csv">Excel için ödemeleri dışa aktar</button></section>';

  var surum = BR && BR.versionName ? BR.versionName() : 'tarayıcı';
  if (BR && BR.webVersion) surum += ' · ekran ' + BR.webVersion();
  h += '<section class="card">' + baslik('bilgi', 'Uygulama') + '' +
    '<dl class="kv"><dt>Sürüm</dt><dd>' + esc(surum) + '</dd><dt>Daire</dt><dd>' + DB.daireler.length + '</dd><dt>Ödeme kaydı</dt><dd>' + DB.odemeler.length + '</dd></dl>' +
    '<div class="actions"><button type="button" class="btn ghost" data-act="guncelleme-kontrol">Güncelleme kontrol et</button>' +
    '<button type="button" class="btn ghost" data-act="daire-yeni">Daire ekle</button></div></section>';
  return h;
}

/* ---------- Kopyalama ---------- */
function kopyala(metin, ad) {
  if (!metin) return;
  var bitti = function () { toast((ad || 'Metin') + ' kopyalandı'); };
  if (BR && BR.copy) { BR.copy(ad || 'Elif Apartmanı', String(metin)); bitti(); return; }
  try {
    navigator.clipboard.writeText(String(metin)).then(bitti, function () { toast(String(metin)); });
  } catch (e) { toast(String(metin)); }
}
var TEL_IKON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z"/></svg>';
function araDugmesi(tel, ad) {
  if (!tel) return '';
  return '<button type="button" class="call-btn" data-act="ara" data-tel="' + esc(tel) + '" aria-label="' + esc((ad || 'Kiracı') + ' ara') + '">' + TEL_IKON + '</button>';
}
/* Listede satır + yanında telefon düğmesi */
function satirSar(d, satirHtml) {
  return '<div class="row-wrap">' + satirHtml + '</div>';
}
/* Değeri gösteren satır: yanında kopyala düğmesi, değere basılı tutunca da kopyalar; telefonsa arama düğmesi de */
function kopyaSatiri(ad, deger, telefon) {
  return '<dt>' + esc(ad) + '</dt><dd class="kopya-dd"><span class="kopya" data-kopya="' + esc(deger) + '" data-ad="' + esc(ad) + '">' + esc(deger) + '</span>' +
    (telefon ? araDugmesi(deger, ad) : '<button type="button" class="kopya-btn" data-act="kopyala" data-v="' + esc(deger) + '" data-ad="' + esc(ad) + '" aria-label="' + esc(ad) + ' kopyala">' + KOPYA_IKON + '</button>') + '</dd>';
}
var KOPYA_IKON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>';

function abonelikSayfasi() {
  sayfaAc({
    baslik: function () { return 'Abonelikler'; },
    ciz: function () {
      var l = daireler(), eksik = 0;
      var h = '' +
        '<section class="card"><div class="list">';
      l.forEach(function (d) {
        if (!d.elkAbone && !d.elkTesisat) eksik++;
        h += '<div class="row abone-row">' +
          '<button type="button" class="no" data-act="daire-ac" data-id="' + d.id + '">' + esc(d.no) + '</button>' +
          '<span class="row-main"><span class="row-title">' + esc(d.bos ? bosAdi(d) : (d.kiraci || 'Kiracı girilmemiş')) + '</span>' +
          aboneSatiri('Elektrik', 'Elektrik abone no', d.elkAbone) + aboneSatiri('Tesisat', 'Elektrik tesisat no', d.elkTesisat) + aboneSatiri('Su', 'Su abone no', d.suAbone) +
          '</span></div>';
      });
      h += '</div></section>';
      if (eksik) h += '<p class="note">' + eksik + ' dairenin abone numarası girilmemiş. Daireye dokunup Düzenle ile ekleyebilirsiniz.</p>';
      return h;
    }
  });
}
function aboneSatiri(kisa, ad, deger) {
  if (!deger) return '<span class="row-sub abone-line">' + kisa + ': –</span>';
  return '<span class="row-sub abone-line">' + kisa + ': <span class="kopya" data-kopya="' + esc(deger) + '" data-ad="' + esc(ad) + '">' + esc(deger) + '</span>' +
    '<button type="button" class="kopya-btn" data-act="kopyala" data-v="' + esc(deger) + '" data-ad="' + esc(ad) + '" aria-label="' + esc(ad) + ' kopyala">' + KOPYA_IKON + '</button></span>';
}

/* Basılı tutunca kopyala */
function basiliTutKur() {
  var zaman = null, hedef = null, x0 = 0, y0 = 0;
  function iptal() { clearTimeout(zaman); zaman = null; if (hedef) hedef.classList.remove('basili'); hedef = null; }
  document.addEventListener('touchstart', function (e) {
    var el = e.target.closest ? e.target.closest('[data-kopya]') : null;
    if (!el) return;
    hedef = el; el.classList.add('basili');
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    zaman = setTimeout(function () {
      var h = hedef; iptal();
      if (h) { kopyala(h.dataset.kopya, h.dataset.ad); S.sonKopya = Date.now(); }
    }, 550);
  }, { passive: true });
  document.addEventListener('touchmove', function (e) {
    if (!zaman) return;
    var t = e.touches[0];
    if (Math.abs(t.clientX - x0) > 10 || Math.abs(t.clientY - y0) > 10) iptal();
  }, { passive: true });
  document.addEventListener('touchend', iptal);
  document.addEventListener('touchcancel', iptal);
  document.addEventListener('contextmenu', function (e) {
    if (e.target.closest && e.target.closest('[data-kopya]')) e.preventDefault();
  });
}

/* ---------- Tam ekran sayfalar ---------- */
var YIGIN = [];
function sayfaAc(s) { YIGIN.push(s); sayfaCiz(); }
function sayfaKapat() { YIGIN.pop(); sayfaCiz(); }
function sayfaCiz() {
  var el = $('#sheet');
  if (!YIGIN.length) { el.hidden = true; return; }
  var s = YIGIN[YIGIN.length - 1];
  $('#sheet-title').textContent = s.baslik();
  var body = $('#sheet-body');
  body.innerHTML = s.ciz();
  body.scrollTop = 0;
  el.hidden = false;
  if (s.hazir) s.hazir();
  var ba = document.getElementById('b-ara'); if (ba && S.bAra) ba.value = S.bAra;
}
function yenile() { ciz(); if (YIGIN.length) sayfaCiz(); }

function onayla(mesaj, dugme, fn) {
  sayfaAc({
    baslik: function () { return 'Emin misiniz?'; },
    ciz: function () {
      return '<section class="card"><p style="margin:0">' + esc(mesaj) + '</p></section>' +
        '<div class="actions"><button type="button" class="btn ghost" data-act="sheet-geri">Vazgeç</button>' +
        '<button type="button" class="btn danger" data-act="onay-evet">' + esc(dugme) + '</button></div>';
    },
    onay: fn
  });
}

/* Daire ayrıntı */
function daireSayfasi(id) {
  sayfaAc({
    daireId: id,
    baslik: function () { var d = daireBul(id); return d ? 'Daire ' + d.no : 'Daire'; },
    ciz: function () {
      var d = daireBul(id);
      if (!d) return '<p class="empty">Bu daire silinmiş.</p>';
      var borc = kiraBorclari(d), borcTop = borc.reduce(function (t, x) { return t + x.kalan; }, 0);
      var sozKalan = d.sozlesmeBit ? gunFark(bugun(), d.sozlesmeBit) : null;
      var bos = function (t) { return '<dd class="missing">' + (t || 'Girilmemiş') + '</dd>'; };
      var kSz = komurSezonBul(sezonu(bugun())), kDu = komurDurum(d, kSz);
      var ad0 = DB.ayarlar.aidat || {}, simdiKis = kisAyiMi(buAy());
      var aidatMetin = d.bos ? '' : TL(aidatTutar(d, buAy())) + ' <small class="muted">(' + (simdiKis ? 'kış' : 'normal') + ')</small>';
      var kom = kDu ? kDu.kalan : 0, topBorc = borcTop + kom;
      var h = '<section class="card daire-bas">' +
        '<div class="tenant-head"><div class="daire-kimlik">' +
        '<div class="row-title" style="font-size:21px">' + esc(d.bos ? bosAdi(d) : (d.kiraci || 'Kiracı adı girilmemiş')) + '</div>' +
        '<div class="muted">' + (d.bos ? (d.ortak ? 'Kiraya verilmiyor' : 'Kiracı yok') : (topBorc ? '<span style="color:var(--bad);font-weight:600">' + TL(topBorc) + ' borç</span>' : '<span style="color:var(--ok);font-weight:600">Borç yok</span>')) + '</div></div>' +
        (d.bos ? '' : '<span class="head-btns">' + waDugmesi(d) + araDugmesi(d.telefon, d.kiraci) + '</span>') + '</div>' +
        '<div class="actions">' +
        (!d.bos ? '<button type="button" class="btn" data-act="odeme-daire" data-id="' + d.id + '">Ödeme gir</button>' : '') +
        (d.bos ? '<button type="button" class="btn" data-act="kiraci-yeni" data-id="' + d.id + '">Yeni kiracı</button>' : '') +
        '<button type="button" class="btn ghost" data-act="daire-duzenle" data-id="' + d.id + '">Düzenle</button>' +
        '</div></section>';

      if (d.bos && !d.ortak) h += bosDaireKarti(d);
      h += '<section class="card">' + baslik('kisi', 'Kiracı') + '<dl class="kv">' +
        (d.bos || d.kiraci ? '' : '<dt>Ad soyad</dt>' + bos()) +
        '<dt>Telefon</dt>' + (d.telefon && !d.bos ? '<dd><span class="kopya" data-kopya="' + esc(d.telefon) + '" data-ad="Telefon">' + esc(d.telefon) + '</span></dd>' : bos(d.bos ? '–' : '')) +
        '<dt>Giriş tarihi</dt>' + (d.bos ? bos('–') : '<dd>' + esc(d.girisTarihi ? tarihAdi(d.girisTarihi) : ayAdi(baslangicAyi(d))) + '</dd>') +
        '<dt>Depozito</dt>' + (d.bos ? bos('–') : depozitoDurumu(d) === 'alinmadi' ? '<dd class="missing bad">Alınmadı</dd>'
          : depozitoDurumu(d) === 'alindi' ? '<dd>' + (+d.depozito ? TL(d.depozito) : 'Alındı') + ' <span style="color:var(--ok)">✓</span></dd>' : bos()) +
        '</dl></section>';

      h += '<section class="card">' + baslik('para', 'Kira ve aidat') + '<dl class="kv">' +
        '<dt>Aylık kira</dt>' + (+d.kira ? '<dd>' + TL(d.kira) + '</dd>' : bos()) +
        '<dt>Aidat</dt>' + (d.bos ? bos('–') : '<dd>' + aidatMetin + '</dd>') +
        (sonrakiArtis(d) ? '<dt>Sonraki kira artışı</dt><dd>' + esc(tarihAdi(sonrakiArtis(d))) + (artisYapildiMi(d, sonrakiArtis(d)) ? ' ✓' : '') + '</dd>' : '') +
        '<dt>Geciken</dt><dd style="color:' + (borcTop ? 'var(--bad)' : 'var(--ok)') + '">' + (borcTop ? TL(borcTop) : 'Yok') + '</dd>' +
        '</dl></section>';

      h += '<section class="card"><div class="card-head">' + baslik('alev', 'Kömür' + (kSz ? ' ' + esc(kSz.sezon) : '')) + (kDu && kDu.beklenen ? chip(kDu.kod) : '') + '</div><dl class="kv">' +
        '<dt>Petek sayısı</dt>' + (d.petek ? '<dd>' + d.petek + '</dd>' : bos()) +
        (kDu ? '<dt>Toplam</dt><dd>' + TL(kDu.beklenen) + '</dd><dt>Ödenen</dt><dd>' + TL(kDu.odenen) + '</dd>' +
          '<dt>Kalan</dt><dd style="color:' + (kDu.kalan > 0 ? 'var(--bad)' : 'var(--ok)') + '">' + (kDu.kalan > 0 ? TL(kDu.kalan) : 'Yok ✓') + '</dd>'
          : '<dt>Kömür</dt>' + bos(d.bos && !d.petek ? '–' : 'Yazılmamış')) +
        '</dl>' + (kDu && kDu.kalan > 0 ? '<button type="button" class="btn ghost block" data-act="komur-ode" data-id="' + d.id + '">Kömür ödemesi gir</button>' : '') + '</section>';

      h += '<section class="card">' + baslik('fis', 'Abonelikler') + '<dl class="kv">' +
        (d.elkAbone ? kopyaSatiri('Elektrik', d.elkAbone) : '<dt>Elektrik</dt>' + bos()) +
        (d.suAbone ? kopyaSatiri('Su', d.suAbone) : '<dt>Su</dt>' + bos()) +
        '</dl></section>';
      if (!d.bos && d.kiraciNot) h += '<section class="card">' + baslik('kalem', 'Kiracı notu') + '<p class="note">' + esc(d.kiraciNot) + '</p></section>';
      if (d.not) h += '<section class="card">' + baslik('kalem', 'Not') + '<p class="note">' + esc(d.not) + '</p></section>';
      h += '<div class="actions">' +
        (!d.bos ? '<button type="button" class="btn ghost" data-act="kiraci-cikis" data-id="' + d.id + '">Kiracı çıktı</button>' : '') +
        (!d.bos ? '<button type="button" class="btn ghost" data-act="artis-ac" data-id="' + d.id + '">Kira artışı</button>' : '') +
        '<button type="button" class="btn ghost" data-act="toplu-ac" data-id="' + d.id + '">Geçmişi toplu gir</button>' +
        (!d.bos ? '<button type="button" class="btn ghost" data-act="dokum" data-id="' + d.id + '">Hesap dökümü</button>' : '') + '</div>' +
        ((d.kiraArtislari || []).length ? '<section class="card">' + baslik('artis', 'Kira artışları') + '<dl class="kv">' +
          d.kiraArtislari.slice().sort(function (a, b) { return a.ay < b.ay ? 1 : -1; }).map(function (a) {
            return '<dt>' + esc(ayAdi(a.ay)) + '</dt><dd>' + TL(a.eski) + ' → ' + TL(a.yeni) + '</dd>';
          }).join('') + '</dl></section>' : '');

      var cur = buAy(), hucreler = '';
      for (var i = -10; i <= 1; i++) {
        var ym = ayEkle(cur, i), k = kiraDurum(d, ym);
        var alt = k.kod === 'yok' ? '–' : (k.kod === 'odendi' ? '✓' : (k.kod === 'tanimsiz' ? '–' : TL(k.kalan)));
        hucreler += '<button type="button" class="mcell ' + k.kod + (ym === cur ? ' simdi' : '') + '" data-act="ay-hucre" data-id="' + d.id + '" data-ym="' + ym + '"' +
          (k.kod === 'yok' ? ' disabled' : '') + ' aria-label="' + esc(ayAdi(ym) + ': ' + DURUM[k.kod]) + '">' +
          '<b>' + AYK[+ym.slice(5) - 1] + '</b>' + esc(alt) + '</button>';
      }
      h += '<section class="card">' + baslik('takvim', 'Son 12 ay kira') + '<div class="months">' + hucreler + '</div></section>';

      var od = DB.odemeler.filter(function (o) { return o.daireId === d.id; })
        .sort(function (a, b) { return (b.tarih + b.kayit) < (a.tarih + a.kayit) ? -1 : 1; });
      h += '<section class="card">' + baslik('saat', 'Ödeme geçmişi') + '';
      if (!od.length) h += '<p class="empty">Bu daire için henüz ödeme girilmemiş.</p>';
      else h += '<div class="list">' + od.slice(0, 60).map(function (o) { return odemeSatiri(o, false); }).join('') + '</div>';
      h += '</section>';
      var dIs = DB.notlar.filter(function (n) { return n.daireId === d.id; }).sort(function (a, b) {
        return (a.durum === 'yapildi') - (b.durum === 'yapildi') || (a.tarih < b.tarih ? 1 : -1); });
      h += '<section class="card"><div class="card-head">' + baslik('arac', 'Arıza ve işler') +
        '<button type="button" class="link" data-act="is-yeni" data-daire="' + d.id + '">+ Ekle</button></div>' +
        (dIs.length ? dIs.slice(0, 10).map(function (n) { return isSatiri(n, false); }).join('') : '<p class="empty">Kayıtlı arıza yok.</p>') + '</section>';
      var eski = (d.eskiKiracilar || []).slice().reverse();
      if (eski.length) {
        h += '<section class="card">' + baslik('kisi', 'Eski kiracılar') + '<div class="list">';
        eski.forEach(function (k) {
          var borc = kiraBorclari(d).filter(function (b) { return b.ym >= k.giris && b.ym <= k.cikis; }).reduce(function (t, b) { return t + b.kalan; }, 0);
          h += '<div class="row-wrap"><div class="row"><span class="row-main"><span class="row-title">' + esc(k.ad || 'İsimsiz') + '</span>' +
            '<span class="row-sub">' + esc(ayAdi(k.giris)) + ' – ' + esc(ayAdi(k.cikis)) + (k.telefon ? ' · ' + esc(k.telefon) : '') + '</span></span>' +
            '<span class="row-end">' + (borc ? '<span class="amt bad">' + TL(borc) + ' borç</span>' : chip('odendi')) + '</span></div>' +
            araDugmesi(k.telefon, k.ad) + '</div>';
        });
        h += '</div></section>';
      }
      return h;
    }
  });
}

/* Daire ekle / düzenle (kiracı bilgileriyle) */
function daireFormu(id, yeniKiraciMi) {
  var d = id ? daireBul(id) : null;
  sayfaAc({
    baslik: function () { return d ? 'Daire ' + d.no + (yeniKiraciMi ? ' · yeni kiracı' : ' düzenle') : 'Yeni daire'; },
    ciz: function () {
      var x = d || { no: '', odemeGunu: 1, bos: false };
      var yeniKiraci = !!yeniKiraciMi;
      function alan(id, etiket, deger, ek) {
        return '<div class="field"><label for="' + id + '">' + etiket + '</label><input id="' + id + '" value="' + esc(deger || '') + '"' + (ek || '') + '></div>';
      }
      return '<div class="form">' +
        '<h3 class="section-title">Kiracı</h3>' +
        '<div class="check-ikili">' +
        '<label class="check kutu"><input id="d-bos" type="checkbox"' + (x.bos ? ' checked' : '') + '> Daire boş</label>' +
        '<label class="check kutu"><input id="d-ortak" type="checkbox"' + (x.ortak ? ' checked' : '') + '> Kiraya verilmiyor</label></div>' +
        '<div id="kiraci-alanlari" class="form">' +
        alan('d-kiraci', 'Ad soyad', x.kiraci, ' autocomplete="off"') +
        alan('d-tel', 'Telefon', x.telefon, ' type="tel"') +
        '<div class="grid2">' + alan('d-bas', 'Giriş tarihi', yeniKiraci ? bugun() : (x.girisTarihi || (x.baslangic ? x.baslangic + '-01' : '')), ' type="date"') +
        alan('d-depozito', 'Depozito (₺)', x.depozito || '', ' inputmode="decimal" placeholder="Bilinmiyorsa boş bırakın"') + '</div>' +
        '<div class="field"><label for="d-depdurum">Depozito durumu</label><select id="d-depdurum">' +
        [['', 'Bilinmiyor'], ['alindi', 'Alındı'], ['alinmadi', 'Alınmadı']].map(function (o) {
          var cur = yeniKiraci ? '' : depozitoDurumu(x);
          return '<option value="' + o[0] + '"' + (cur === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
        }).join('') + '</select></div>' +

        '<div class="field"><label for="d-kiracinot">Kiracı notu</label><textarea id="d-kiracinot">' + esc(x.kiraciNot || '') + '</textarea></div>' +
        '</div>' +
        '<h3 class="section-title">Daire</h3>' +
        '<div class="grid2">' + alan('d-no', 'Daire no', x.no, ' placeholder="Örn. 12"') +
        alan('d-gun', 'Kira ödeme günü', x.odemeGunu || 1, ' type="number" inputmode="numeric" min="1" max="31"') + '</div>' +
        '<div class="grid2">' + alan('d-kira', 'Aylık kira (₺)', x.kira || '', ' inputmode="decimal"') +
        alan('d-petek', 'Petek sayısı', x.petek || '', ' type="number" inputmode="numeric" min="0" max="50"') + '</div>' +
        '<div class="grid2">' + alan('d-aidatyaz', 'Özel normal aidat (₺)', x.aidatYaz === undefined || x.aidatYaz === null ? '' : x.aidatYaz, ' inputmode="decimal" placeholder="Boşsa genel: ' + esc(DB.ayarlar.aidat.yaz) + '"') +
        alan('d-aidatkis', 'Özel kış aidatı (₺)', x.aidatKis === undefined || x.aidatKis === null ? '' : x.aidatKis, ' inputmode="decimal" placeholder="Boşsa genel: ' + esc(DB.ayarlar.aidat.kis) + '"') + '</div>' +
        '<div class="grid2">' + alan('d-abone', 'Elektrik abone no', x.elkAbone, ' inputmode="numeric"') + alan('d-su', 'Su abone no', x.suAbone, ' inputmode="numeric"') + '</div>' +
        '<div class="field"><label for="d-not">Daire notu</label><textarea id="d-not">' + esc(x.not || '') + '</textarea></div>' +
        '<button type="button" class="btn block" data-act="daire-kaydet" data-id="' + (d ? d.id : '') + '">Kaydet</button>' +
        (d ? '<button type="button" class="btn danger block" data-act="daire-sil" data-id="' + d.id + '">Daireyi sil</button>' : '') +
        '</div>';
    },
    hazir: function () {
      var cb = $('#d-bos');
      if (yeniKiraciMi) cb.checked = false;
      var guncelle = function () { $('#kiraci-alanlari').hidden = cb.checked; };
      cb.addEventListener('change', guncelle);
      guncelle();
      if (yeniKiraciMi || !d) {
        var dep = $('#d-depozito'), kira = $('#d-kira'), elle = false;
        var oner = function () { if (!elle) dep.value = kira.value; };
        dep.addEventListener('input', function () { elle = true; });
        kira.addEventListener('input', oner);
        oner();
      }
    }
  });
}
function daireKaydet(id) {
  var no = $('#d-no').value.trim();
  if (!no) { toast('Daire no girin'); return; }
  var cakisan = DB.daireler.some(function (x) { return x.id !== id && String(x.no).toLocaleLowerCase('tr') === no.toLocaleLowerCase('tr'); });
  if (cakisan) { toast('Bu numarada başka bir daire var'); return; }
  if ($('#d-ortak').checked) $('#d-bos').checked = true;
  var mevcut = id ? daireBul(id) : null, bos = $('#d-bos').checked;
  var veri = {
    no: no, odemeGunu: Math.min(31, Math.max(1, parseInt($('#d-gun').value, 10) || 1)), kira: sayi($('#d-kira').value),
    elkAbone: $('#d-abone').value.trim(), suAbone: $('#d-su').value.trim(), not: $('#d-not').value.trim(), bos: bos, ortak: $('#d-ortak').checked,
    petek: parseInt($('#d-petek').value, 10) || 0,
    aidatYaz: $('#d-aidatyaz').value.trim() === '' ? null : sayi($('#d-aidatyaz').value),
    aidatKis: $('#d-aidatkis').value.trim() === '' ? null : sayi($('#d-aidatkis').value)
  };
  var kiraciVeri = {
    kiraci: $('#d-kiraci').value.trim(), telefon: $('#d-tel').value.trim(), 
    girisTarihi: $('#d-bas').value || '', baslangic: ($('#d-bas').value || '').slice(0, 7), depozito: sayi($('#d-depozito').value), depozitoDurum: $('#d-depdurum').value || (sayi($('#d-depozito').value) > 0 ? 'alindi' : ''), depozitoAlindi: $('#d-depdurum').value === 'alindi' || sayi($('#d-depozito').value) > 0,
    kiraciNot: $('#d-kiracinot').value.trim()
  };
  if (!bos) {
    var eski = (mevcut && mevcut.eskiKiracilar) || [];
    if (!kiraciVeri.baslangic && eski.length) kiraciVeri.baslangic = buAy();
    var sonCikis = eski.length ? eski[eski.length - 1].cikis : '';
    if (sonCikis && kiraciVeri.baslangic && kiraciVeri.baslangic <= sonCikis) { toast('Giriş tarihi, önceki kiracının çıkış ayından sonra olmalı'); return; }
    Object.assign(veri, kiraciVeri);
  }
  if (mevcut && veri.baslangic && veri.baslangic < baslangicAyi(mevcut) && !mevcut.bos) {
    /* Giriş tarihi geriye alındıysa eski aylar borç sayılmasın: takip eski başlangıçtan devam eder */
    var ilkOdeme = DB.odemeler.filter(function (o) { return o.daireId === mevcut.id && o.tur === 'kira'; })
      .reduce(function (m, o) { return !m || o.donem < m ? o.donem : m; }, '');
    veri.takipBas = ilkOdeme && ilkOdeme < baslangicAyi(mevcut) ? ilkOdeme : baslangicAyi(mevcut);
  }
  if (mevcut) Object.assign(mevcut, veri);
  else DB.daireler.push(Object.assign({ id: yeniId(), olusturma: bugun(), eskiKiracilar: [] }, veri));
  kaydet(); sayfaKapat(); yenile(); toast('Kaydedildi');
}

/* Geçmiş kiraları toplu "ödendi" girme */
function topluAylar(d, bas, bit) {
  var l = [];
  if (!bas || !bit || bit < bas) return l;
  for (var ym = bas; ym <= bit && l.length < 240; ym = ayEkle(ym, 1)) {
    var k = kiraDurum(d, ym);
    if (k.kalan > 0) l.push({ ym: ym, tutar: k.kalan, vade: k.vade, kira: k.kira.kalan, aidat: k.aidat.kalan });
  }
  return l;
}
function topluSayfasi(id) {
  var d = daireBul(id);
  var ilk = baslangicAyi(d);
  (d.eskiKiracilar || []).forEach(function (k) { if (k.giris && k.giris < ilk) ilk = k.giris; });
  if (ilk < '2000-01') ilk = ayEkle(buAy(), -12);
  S.topluSekil = 'Nakit';
  sayfaAc({
    baslik: function () { return 'Daire ' + d.no + ' · geçmişi toplu gir'; },
    ciz: function () {
      var son = DB.odemeler.filter(function (o) { return o.daireId === d.id && o.toplu; })
        .sort(function (a, b) { return a.kayit < b.kayit ? 1 : -1; })[0];
      return '<section class="card"><p class="note">Seçtiğiniz aylar arasında kirası ve aidatı tam ödenmiş sayılacak aylar tek seferde kaydedilir. ' +
        'Zaten ödenmiş aylar atlanır, kısmi ödenmiş ayların kalanı tamamlanır. Eksik ödenen bir ay varsa sonra o aya dokunup düzeltebilirsiniz.</p></section>' +
        '<div class="form">' +
        '<div class="grid2"><div class="field"><label for="t-bas">İlk ay</label><input id="t-bas" type="month" value="' + esc(ilk) + '"></div>' +
        '<div class="field"><label for="t-bit">Son ay</label><input id="t-bit" type="month" value="' + esc(ayEkle(buAy(), -1)) + '"></div></div>' +
        '<div class="field"><span class="lbl">Nasıl ödendi?</span><div class="seg" id="t-sekil">' +
        ['Nakit', 'Banka'].map(function (x) { return '<button type="button" data-act="t-sekil" data-v="' + x + '" class="' + (S.topluSekil === x ? 'on' : '') + '">' + x + '</button>'; }).join('') +
        '</div></div>' +
        '<p class="note">Ödeme tarihi olarak her ayın kendi ödeme günü yazılır.</p>' +
        '<section class="card"><div id="t-ozet" class="note"></div></section>' +
        '<button type="button" class="btn block" data-act="toplu-kaydet" data-id="' + d.id + '">Kaydet</button>' +
        (son ? '<button type="button" class="btn danger block" data-act="toplu-geri" data-id="' + d.id + '" data-t="' + son.toplu + '">Son toplu girişi geri al</button>' : '') +
        '</div>';
    },
    hazir: function () {
      var guncelle = function () {
        var bas = $('#t-bas').value, bit = $('#t-bit').value, l = topluAylar(d, bas, bit), el = $('#t-ozet');
        if (!bas || !bit) { el.textContent = 'İlk ve son ayı seçin.'; return; }
        if (bit < bas) { el.textContent = 'Son ay, ilk aydan önce olamaz.'; return; }
        var top = l.reduce(function (t, x) { return t + x.tutar; }, 0);
        var uyari = bas < baslangicAyi(d) && !(d.eskiKiracilar || []).length
          ? ' Kiracının giriş ayı ' + ayAdi(baslangicAyi(d)) + ' olarak kayıtlı, daha önceki aylar atlanır. Daha eskiye gitmek için Düzenle’den giriş ayını değiştirin.' : '';
        el.textContent = l.length
          ? l.length + ' ay kaydedilecek (' + ayAdi(l[0].ym) + ' – ' + ayAdi(l[l.length - 1].ym) + '), toplam ' + TL(top) + '.' + uyari
          : 'Bu aralıkta kaydedilecek ödenmemiş ay yok.' + uyari;
      };
      $('#t-bas').addEventListener('change', guncelle);
      $('#t-bit').addEventListener('change', guncelle);
      guncelle();
    }
  });
}
function topluKaydet(id) {
  var d = daireBul(id), l = topluAylar(d, $('#t-bas').value, $('#t-bit').value);
  if (!l.length) { toast('Kaydedilecek ay yok'); return; }
  var tid = yeniId(), simdi = new Date().toISOString(), gun0 = bugun();
  l.forEach(function (x) {
    [['kira', x.kira], ['aidat', x.aidat]].forEach(function (p) {
      if (!(p[1] > 0)) return;
      DB.odemeler.push({ id: yeniId(), kayit: simdi, toplu: tid, daireId: d.id, tur: p[0], donem: x.ym, tutar: p[1],
        tarih: x.vade > gun0 ? gun0 : x.vade, sekil: S.topluSekil || 'Nakit', aciklama: '', not: 'Toplu giriş' });
    });
  });
  kaydet(); sayfaKapat(); yenile();
  toast(l.length + ' ayın kira ve aidatı kaydedildi', function () {
    DB.odemeler = DB.odemeler.filter(function (o) { return o.toplu !== tid; });
    kaydet(); yenile(); toast('Toplu giriş geri alındı');
  });
}

/* Yıllık kira artışı */
function artisSayfasi(id) {
  var d = daireBul(id), t = sonrakiArtis(d) || bugun();
  sayfaAc({
    baslik: function () { return 'Daire ' + d.no + ' · kira artışı'; },
    ciz: function () {
      return '<section class="card"><dl class="kv"><dt>Kiracı</dt><dd>' + esc(d.kiraci || '–') + '</dd>' +
        '<dt>Şu anki kira</dt><dd>' + TL(d.kira) + '</dd>' +
        '<dt>Artış günü</dt><dd>' + esc(tarihAdi(t)) + '</dd>' +
        (oneriKira(d) ? '<dt>Önerilen yeni kira</dt><dd class="oneri">' + TL(oneriKira(d)) + ' <small>(%' + NF.format(+DB.ayarlar.tufe) + ')</small></dd>' : '') + '</dl>' +
        (+DB.ayarlar.tufe ? '' : '<p class="note">Ayarlar → Kira artışı bölümüne yıllık TÜFE oranını yazarsanız yeni kira burada hazır gelir.</p>') + '</section>' +
        '<div class="form">' +
        '<div class="grid2"><div class="field"><label for="ar-yuzde">Artış oranı (%)</label><input id="ar-yuzde" inputmode="decimal" placeholder="Örn. 35" value="' + (+DB.ayarlar.tufe ? esc(DB.ayarlar.tufe) : '') + '"></div>' +
        '<div class="field"><label for="ar-yeni">Yeni kira (₺)</label><input id="ar-yeni" inputmode="decimal" value="' + (oneriKira(d) || '') + '"></div></div>' +
        '<div class="field"><label for="ar-ay">Hangi aydan itibaren?</label><input id="ar-ay" type="month" value="' + esc(t.slice(0, 7)) + '"></div>' +
        '<p class="note">Bu aydan önceki aylar eski kira ile hesaplanmaya devam eder.</p>' +
        '<button type="button" class="btn block" data-act="artis-kaydet" data-id="' + d.id + '">Artışı kaydet</button></div>';
    },
    hazir: function () {
      $('#ar-yuzde').addEventListener('input', function () {
        var y = sayi($('#ar-yuzde').value);
        $('#ar-yeni').value = y ? String(Math.round((+d.kira || 0) * (1 + y / 100) / 50) * 50) : '';
      });
    }
  });
}
function artisKaydet(id) {
  var d = daireBul(id), yeni = sayi($('#ar-yeni').value), ay = $('#ar-ay').value;
  if (!(yeni > 0)) { toast('Yeni kirayı girin'); return; }
  if (!ay) { toast('Ayı seçin'); return; }
  d.kiraArtislari = (d.kiraArtislari || []).filter(function (a) { return a.ay !== ay; });
  d.kiraArtislari.push({ ay: ay, eski: kiraTutari(d, ayEkle(ay, -1)), yeni: yeni });
  d.kira = yeni;
  kaydet(); sayfaKapat(); yenile(); toast('Kira artışı kaydedildi: ' + TL(yeni));
}

/* Kiracı çıkışı: bilgiler eski kiracılara taşınır, o aya kadarki borçlar takipte kalır */
function kiraciCikisSayfasi(id) {
  var d = daireBul(id);
  sayfaAc({
    baslik: function () { return 'Daire ' + d.no + ' · kiracı çıkışı'; },
    ciz: function () {
      return '<section class="card"><div class="row-title">' + esc(d.kiraci || 'Kiracı') + '</div>' +
        '<p class="note">Kiracı bilgileri silinmez, “Eski kiracılar” bölümüne taşınır. Çıkış ayına kadar ödenmemiş kiralar borç olarak görünmeye devam eder.</p></section>' +
        '<div class="form"><div class="field"><label for="c-ay">Kirasını ödeyeceği son ay</label><input id="c-ay" type="month" value="' + buAy() + '"></div>' +
        '<button type="button" class="btn block" data-act="cikis-kaydet" data-id="' + d.id + '">Çıkışı kaydet</button></div>';
    }
  });
}
function kiraciCikisKaydet(id) {
  var d = daireBul(id), cikis = $('#c-ay').value, giris = baslangicAyi(d);
  if (!cikis) { toast('Son ayı seçin'); return; }
  if (cikis < giris) { toast('Son ay, giriş ayından (' + ayAdi(giris) + ') önce olamaz'); return; }
  d.eskiKiracilar = d.eskiKiracilar || [];
  d.eskiKiracilar.push({
    ad: d.kiraci || '', telefon: d.telefon || '', telefon2: d.telefon2 || '', tc: d.tc || '', giris: giris, cikis: cikis,
    depozito: d.depozito || 0, sozlesmeBas: d.sozlesmeBas || '', sozlesmeBit: d.sozlesmeBit || '',
    kefilAd: d.kefilAd || '', kefilTel: d.kefilTel || '', not: d.kiraciNot || ''
  });
  ['kiraci', 'telefon', 'telefon2', 'tc', 'baslangic', 'girisTarihi', 'sozlesmeBas', 'sozlesmeBit', 'kefilAd', 'kefilTel', 'kiraciNot'].forEach(function (k) { d[k] = ''; });
  d.depozito = 0; d.depozitoAlindi = false; d.depozitoDurum = ''; d.bos = true;
  kaydet(); sayfaKapat(); yenile(); toast('Kiracı çıkışı kaydedildi');
}

/* ---------- Bildirim geçmişi ---------- */
function bildirimKaydi() {
  var raw = '';
  try { raw = BR && BR.notificationLog ? BR.notificationLog() : ''; } catch (e) { raw = ''; }
  try { var l = raw ? JSON.parse(raw) : []; return Array.isArray(l) ? l : []; } catch (e) { return []; }
}
function bildirimRozeti() {
  var el = document.getElementById('bell-badge');
  if (!el) return;
  var gor = DB.ayarlar.bildirimGoruldu || '';
  var n = bildirimKaydi().filter(function (x) { return (x.zaman || '') > gor; }).length;
  el.textContent = n > 9 ? '9+' : String(n);
  el.hidden = !n;
}
var BILDIRIM_TUR = {
  'kira': ['takvim', 'mavi'], 'kira-gec': ['uyari', 'kirmizi'], 'komur': ['alev', 'turuncu'], 'komur-gec': ['alev', 'bordo'],
  'depozito': ['kilit', 'sari'], 'artis': ['artis', 'mor'], 'sozlesme': ['fis', 'gri'], 'ozet': ['grafik', 'yesil'], 'beyan': ['fis', 'lacivert']
};
function bildirimTuru(x) {
  if (x.tur && BILDIRIM_TUR[x.tur]) return x.tur;
  var t = (x.baslik || '').toLocaleLowerCase('tr');
  if (t.indexOf('özeti') >= 0) return 'ozet';
  if (t.indexOf('beyanname') >= 0) return 'beyan';
  if (t.indexOf('ödenmemiş kömür') >= 0) return 'komur-gec';
  if (t.indexOf('ödenmemiş') >= 0) return 'kira-gec';
  if (t.indexOf('kömür') >= 0) return 'komur';
  if (t.indexOf('depozito') >= 0) return 'depozito';
  if (t.indexOf('artış') >= 0) return 'artis';
  if (t.indexOf('sözleşme') >= 0) return 'sozlesme';
  return 'kira';
}
function gunBasligi(t) {
  var g = bugun();
  if (t === g) return 'Bugün';
  if (t === gunEkle(g, 1)) return 'Yarın';
  if (t === gunEkle(g, -1)) return 'Dün';
  var gunAd = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'][toDate(t).getDay()];
  return tarihAdi(t, t.slice(0, 4) !== g.slice(0, 4)) + ', ' + gunAd;
}
function bildirimKartiHtml(x, saat) {
  var tur = bildirimTuru(x), tt = BILDIRIM_TUR[tur];
  var satirlar = String(x.metin || '').split('\n');
  var ust = (satirlar.shift() || '').replace(/:\s*$/, '');
  var parca = String(x.baslik || '').split(' · ');
  var satirHtml = satirlar.map(function (l) {
    var m = /^Daire (\S+)(?: \((.*)\))? – (.*)$/.exec(l);
    if (!m) return '<div class="bk-fazla">' + esc(l) + '</div>';
    var d = DB.daireler.filter(function (z) { return String(z.no) === m[1]; })[0];
    var ic = '<span class="no">' + esc(m[1]) + '</span><span class="bk-kisi"><span class="bk-ad">' + esc(m[2] || 'Daire ' + m[1]) + '</span>' +
      '<span class="bk-detay">' + esc(m[3]) + '</span></span>';
    return d ? '<button type="button" class="bk-satir" data-act="daire-ac" data-id="' + d.id + '">' + ic + '<span class="bk-ok" aria-hidden="true">›</span></button>'
      : '<div class="bk-satir">' + ic + '</div>';
  }).join('');
  return '<section class="card bk bk-' + tt[1] + '">' +
    '<div class="bk-bas"><span class="bk-ik">' + ikon(tt[0]) + '</span>' +
    '<span class="bk-baslik"><b>' + esc(parca[0]) + '</b>' + (ust ? '<small>' + esc(ust) + '</small>' : '') + '</span>' +
    '<span class="bk-sag">' + (parca[1] ? '<span class="bk-sayi">' + esc(parca[1]) + '</span>' : '') + (saat ? '<span class="bk-saat">' + esc(saat) + '</span>' : '') + '</span></div>' +
    (satirHtml ? '<div class="bk-liste">' + satirHtml + '</div>' : '') +
    '</section>';
}
function bildirimGruplu(l, tarihAl, saatAl) {
  var h = '', son = '';
  l.forEach(function (x) {
    var t = tarihAl(x);
    if (t !== son) { h += '<h3 class="bk-gun">' + esc(gunBasligi(t)) + '</h3>'; son = t; }
    h += bildirimKartiHtml(x, saatAl(x));
  });
  return h;
}
function bildirimListesiHtml() {
  var q = (S.bAra || '').trim().toLocaleLowerCase('tr');
  var uyar = function (x) { return !q || (x.baslik + ' ' + x.metin).toLocaleLowerCase('tr').indexOf(q) >= 0; };
  if (S.bSekme === 'yaklasan') {
    var y = hatirlatmaListesi().filter(uyar).slice(0, 60);
    if (!y.length) return '<p class="empty">' + (q ? 'Aramaya uyan bildirim yok.' : 'Önümüzdeki 90 gün için planlanmış bildirim yok.') + '</p>';
    return bildirimGruplu(y, function (x) { return x.tarih; }, function () { return pad(DB.ayarlar.saat) + ':00'; });
  }
  var l = bildirimKaydi().filter(uyar);
  if (!l.length) return '<p class="empty">' + (q ? 'Aramaya uyan bildirim yok.' : 'Henüz gönderilmiş bildirim yok. Gelen her bildirim burada saklanır.') + '</p>';
  return bildirimGruplu(l, function (x) { return (x.zaman || '').slice(0, 10); }, function (x) { return (x.zaman || '').slice(11, 16); });
}
function bildirimSayfasi() {
  S.bSekme = S.bSekme || 'gecmis'; S.bAra = '';
  var l = bildirimKaydi();
  if (l.length && l[0].zaman) { DB.ayarlar.bildirimGoruldu = l[0].zaman; kaydet(); bildirimRozeti(); }
  sayfaAc({
    baslik: function () { return 'Bildirimler'; },
    ciz: function () {
      return '<div class="seg">' +
        '<button type="button" data-act="b-sekme" data-v="gecmis" class="' + (S.bSekme === 'gecmis' ? 'on' : '') + '">Gelenler</button>' +
        '<button type="button" data-act="b-sekme" data-v="yaklasan" class="' + (S.bSekme === 'yaklasan' ? 'on' : '') + '">Yaklaşanlar</button></div>' +
        '<input id="b-ara" type="search" placeholder="Bildirimlerde ara: daire no, isim, ay" aria-label="Bildirimlerde ara">' +
        '<div id="b-liste" class="stack bk-akis">' + bildirimListesiHtml() + '</div>';
    }
  });
}

/* Ödeme formu */
var FORM = null;
function odemeFormu(on) {
  on = on || {};
  var mevcut = on.id ? DB.odemeler.filter(function (o) { return o.id === on.id; })[0] : null;
  var b = mevcut || {};
  FORM = {
    id: mevcut ? mevcut.id : null,
    tur: b.tur || on.tur || 'kira',
    sekil: b.sekil || 'Nakit',
    tutarElle: !!mevcut
  };
  var daireId = b.daireId || on.daireId || '';
  var ay = ((b.tur === 'kira' || b.tur === 'aidat') && b.donem) || on.ay || (daireId && daireBul(daireId) ? ilkOdenmemisAy(daireBul(daireId)) : buAy());
  var sezonSec = (b.tur === 'komur' && b.donem) || on.sezon || sezonu(bugun());
  sayfaAc({
    baslik: function () { return mevcut ? 'Ödemeyi düzenle' : 'Ödeme gir'; },
    ciz: function () {
      var sezonlar = DB.komur.map(function (k) { return k.sezon; });
      if (sezonlar.indexOf(sezonSec) < 0) sezonlar.push(sezonSec);
      sezonlar.sort().reverse();
      return '<div class="form">' +
        '<div class="field"><label for="o-daire">Daire</label><select id="o-daire"><option value="">Daire seçin</option>' +
        daireler().map(function (d) {
          return '<option value="' + d.id + '"' + (d.id === daireId ? ' selected' : '') + '>Daire ' + esc(d.no) + (d.kiraci ? ' · ' + esc(d.kiraci) : (d.bos ? ' · boş' : '')) + '</option>';
        }).join('') + '</select></div>' +
        '<div class="field"><span class="lbl">Ödeme türü</span><div class="seg" id="o-tur">' +
        ['kira', 'aidat', 'komur', 'diger'].map(function (t) {
          return '<button type="button" data-act="o-tur" data-v="' + t + '" class="' + (FORM.tur === t ? 'on' : '') + '">' + TUR[t] + '</button>';
        }).join('') + '</div></div>' +
        '<div class="field" id="f-ay"><label for="o-ay">Hangi ay?</label><input id="o-ay" type="month" value="' + esc(ay) + '"></div>' +
        '<div class="field" id="f-taksit"><label for="o-taksit">Hangi sezonun kömürü?</label><select id="o-taksit">' +
        sezonlar.map(function (z) { return '<option value="' + z + '"' + (z === sezonSec ? ' selected' : '') + '>' + z + '</option>'; }).join('') + '</select></div>' +
        '<div class="field" id="f-aciklama"><label for="o-aciklama">Açıklama</label><input id="o-aciklama" value="' + esc(b.aciklama || '') + '" placeholder="Örn. tamir, boya"></div>' +
        '<div class="grid2"><div class="field"><label for="o-tutar">Tutar (₺)</label><input id="o-tutar" inputmode="decimal" value="' + esc(b.tutar || '') + '"></div>' +
        '<div class="field"><label for="o-tarih">Ödeme tarihi</label><input id="o-tarih" type="date" value="' + esc(b.tarih || bugun()) + '"></div></div>' +
        '<p class="note" id="o-ipucu"></p>' +
        '<div class="field"><span class="lbl">Nasıl ödendi?</span><div class="seg" id="o-sekil">' +
        ['Nakit', 'Banka'].map(function (s) {
          return '<button type="button" data-act="o-sekil" data-v="' + s + '" class="' + (FORM.sekil === s ? 'on' : '') + '">' + s + '</button>';
        }).join('') + '</div></div>' +
        '<div class="field"><label for="o-not">Not</label><input id="o-not" value="' + esc(b.not || '') + '"></div>' +
        '<button type="button" class="btn block" data-act="odeme-kaydet">Kaydet</button>' +
        (mevcut && daireBul(mevcut.daireId) && waNumara(daireBul(mevcut.daireId).telefon) ? '<button type="button" class="btn wa-tam block" data-act="makbuz" data-id="' + mevcut.id + '">Kiracıya “ödeme alındı” gönder</button>' : '') +
        (mevcut ? '<button type="button" class="btn danger block" data-act="odeme-sil">Ödemeyi sil</button>' : '') +
        '</div>';
    },
    hazir: function () {
      formAlanlari();
      if (!mevcut) tutarOner();
      ['o-daire', 'o-ay', 'o-taksit'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('change', tutarOner);
      });
      $('#o-tutar').addEventListener('input', function () { FORM.tutarElle = true; });
    }
  });
}
function formAlanlari() {
  $('#f-ay').hidden = FORM.tur !== 'kira' && FORM.tur !== 'aidat';
  $('#f-taksit').hidden = FORM.tur !== 'komur';
  $('#f-aciklama').hidden = FORM.tur !== 'diger';
}
function tutarOner() {
  var d = daireBul($('#o-daire').value), ipucu = $('#o-ipucu'), kalan = null, metin = '';
  if (d && (FORM.tur === 'kira' || FORM.tur === 'aidat')) {
    var ym = $('#o-ay').value;
    if (ym) {
      var k = FORM.tur === 'aidat' ? aidatDurum(d, ym) : kiraTekDurum(d, ym);
      if (k.kod === 'yok') metin = 'Bu daire o ay boş görünüyor.';
      else if (k.beklenen) { kalan = k.kalan; metin = ayAdi(ym) + ' ' + (FORM.tur === 'aidat' ? 'aidatı' : 'kirası') + ': ' + TL(k.beklenen) + ', ' + TL(k.odenen) + ' ödendi, ' + TL(k.kalan) + ' kaldı.'; }
    }
  } else if (d && FORM.tur === 'komur') {
    var sel = $('#o-taksit'), kz = sel ? komurSezonBul(sel.value) : null, kk = komurDurum(d, kz);
    if (kk) { kalan = kk.kalan; metin = kz.sezon + ' kömürü: ' + TL(kk.beklenen) + ' borç, ' + TL(kk.odenen) + ' ödendi, ' + TL(kk.kalan) + ' kaldı.'; }
    else metin = 'Bu daireye bu sezon kömür yazılmamış. Kömür sekmesinden kilosunu girebilirsiniz.';
  }
  ipucu.textContent = metin;
  ipucu.hidden = !metin;
  if (!FORM.tutarElle && kalan !== null) $('#o-tutar').value = kalan > 0 ? String(kalan).replace('.', ',') : '';
}
function odemeKaydet() {
  var did = $('#o-daire').value, tutar = sayi($('#o-tutar').value), tarih = $('#o-tarih').value, donem = '';
  if (!did) { toast('Daire seçin'); return; }
  if (!(tutar > 0)) { toast('Tutar girin'); return; }
  if (!tarih) { toast('Ödeme tarihini girin'); return; }
  if (FORM.tur === 'kira' || FORM.tur === 'aidat') { donem = $('#o-ay').value; if (!donem) { toast('Hangi ay olduğunu seçin'); return; } }
  if (FORM.tur === 'komur') {
    var sel = $('#o-taksit'); donem = sel ? sel.value : '';
    if (!donem) { toast('Sezonu seçin'); return; }
  }
  var veri = {
    daireId: did, tur: FORM.tur, donem: donem, tutar: tutar, tarih: tarih, sekil: FORM.sekil,
    aciklama: FORM.tur === 'diger' ? $('#o-aciklama').value.trim() : '', not: $('#o-not').value.trim()
  };
  var yeniO = null;
  if (FORM.id) {
    var o = DB.odemeler.filter(function (x) { return x.id === FORM.id; })[0];
    if (o) Object.assign(o, veri);
  } else {
    yeniO = Object.assign({ id: yeniId(), kayit: new Date().toISOString() }, veri);
    DB.odemeler.push(yeniO);
  }
  kaydet(); sayfaKapat(); yenile();
  var dd = daireBul(did);
  toast(FORM.id ? 'Ödeme güncellendi' : 'Ödeme kaydedildi', null,
    yeniO && dd && waNumara(dd.telefon) ? { metin: 'Kiracıya bildir', fn: function () { makbuzGonder(dd, [yeniO]); } } : null);
}

/* ---------- Yedek, dışa aktarma, güncelleme ---------- */
function dosyaKaydet(icerik, ad, tur) {
  if (BR && BR.exportData) { BR.exportData(icerik, ad, tur); return; }
  toast('Dosya kaydetme sadece telefonda çalışır');
}
function yedekAl() {
  S.bekleyenYedek = true;
  dosyaKaydet(JSON.stringify(temizVeri(), null, 1), 'elif-apartmani-yedek-' + bugun() + '.json', 'application/json');
}
W.onExportDone = function (ok) {
  if (ok && S.bekleyenYedek) { DB.sonYedek = bugun(); kaydet(); }
  S.bekleyenYedek = false;
  toast(ok ? 'Dosya kaydedildi' : 'Dosya kaydedilmedi');
  yenile();
};
/* Kısa kurulum metni: her daire bir satır; ödemeler kurala göre üretilir */
function kurulumAc(k) {
  var son = k.sonAy, gun0 = bugun(), n = 0, ds = [], od = [], km = {};
  function id() { n++; return 'k' + Date.now().toString(36) + n; }
  function ode(did, tur, donem, tutar, tarih, not) {
    od.push({ id: id(), kayit: new Date().toISOString(), toplu: 'ilk-yukleme', daireId: did, tur: tur, donem: donem, tutar: tutar,
      tarih: tarih > gun0 ? gun0 : tarih, sekil: 'Nakit', aciklama: '', not: not || 'İlk yükleme' });
  }
  var ad0 = k.aidat || { yaz: 300, kis: 1300, kisBas: 10, kisBit: 4 };
  function kisMi(ym) { var m = +ym.slice(5); return ad0.kisBas <= ad0.kisBit ? (m >= ad0.kisBas && m <= ad0.kisBit) : (m >= ad0.kisBas || m <= ad0.kisBit); }
  k.d.forEach(function (r) {
    // [no, ad, giriş, kira, depozito, depDurum, elektrik, petek, kömürÖdenen(-1 = hepsi), telefon, takipBaşlangıcı, not, bayrak]
    var no = r[0], ad = r[1], giris = r[2], did = 'd' + (no < 10 ? '0' : '') + no, bay = r[12] || '';
    var bos = !ad, ortak = bay.indexOf('O') >= 0, dahil = bay.indexOf('A') >= 0, gun1 = bay.indexOf('1') >= 0;
    var d = { id: did, no: String(no), olusturma: gun0, odemeGunu: 15, kira: r[3] || 0, petek: r[7] || 0, elkAbone: r[6] || '', elkTesisat: '', suAbone: '',
      not: r[11] || '', bos: bos, ortak: ortak, eskiKiracilar: [], kiraci: ad || '', telefon: r[9] || '', telefon2: '', tc: '',
      girisTarihi: giris || '', baslangic: giris ? giris.slice(0, 7) : '', depozito: r[4] || 0, depozitoDurum: r[5] || '', depozitoAlindi: r[5] === 'alindi',
      sozlesmeBas: '', sozlesmeBit: '', kefilAd: '', kefilTel: '', kiraciNot: dahil ? 'Kiraya aidat dahil' : '',
      aidatYaz: dahil ? 0 : null, aidatKis: dahil ? 0 : null };
    if (r[10]) d.takipBas = r[10];
    ds.push(d);
    if (bos) return;
    for (var ym = d.takipBas && d.takipBas > d.baslangic ? d.takipBas : d.baslangic; ym <= son; ym = ayEkle(ym, 1)) {
      var t = ym + (gun1 ? '-01' : '-15');
      ode(did, 'kira', ym, d.kira, t);
      var a = dahil ? 0 : (kisMi(ym) ? ad0.kis : ad0.yaz);
      if (a) ode(did, 'aidat', ym, a, t);
    }
    if (d.petek) {
      var pkg = k.petekKg || 1000;
      km[did] = { kg: d.petek * pkg, tutar: null };
      var bor = Math.round(d.petek * pkg / 1000 * k.ton * 100) / 100, o = r[8] === -1 ? bor : (r[8] || 0);
      if (o) ode(did, 'komur', k.sezon, o, gun0, 'İlk yükleme (ödeme tarihi bilinmiyor)');
    }
  });
  var v = bosVeri();
  v.daireler = ds; v.odemeler = od;
  v.komur = [{ sezon: k.sezon, tonFiyati: k.ton, petekKg: k.petekKg || 0, yuvarla: 0, sonOdeme: '', toplamTon: 0, daireler: km }];
  v.ayarlar.aidat = ad0;
  return v;
}
function metinSayfasi() {
  sayfaAc({
    baslik: function () { return 'Metinden yükle'; },
    ciz: function () {
      return '<p class="note">Size gönderilen kurulum metnini ya da yedek metnini kopyalayıp aşağıdaki kutuya yapıştırın.</p>' +
        '<div class="field"><label for="m-metin">Metin</label><textarea id="m-metin" style="min-height:220px;font-size:13px" placeholder="Buraya yapıştırın"></textarea></div>' +
        '<button type="button" class="btn block" data-act="metin-yukle">Yükle</button>';
    }
  });
}
W.onShareStarted = function () { DB.sonYedek = bugun(); kaydet(); if (S.tab === 'ayarlar' && !YIGIN.length) ciz(); };
W.onImport = function (text) {
  var o;
  try { o = JSON.parse(String(text || '').trim().replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '')); } catch (e) { o = null; }
  if (o && o.kurulum) { try { o = kurulumAc(o); } catch (e) { o = null; } }
  if (!o || !Array.isArray(o.daireler)) { toast('Bu dosya bir Elif Apartmanı yedeği değil'); return; }
  onayla('Şu anki kayıtların yerine bu yedek yüklenecek: ' + o.daireler.length + ' daire, ' + (o.odemeler || []).length + ' ödeme. Şu anki kayıtlar silinir.',
    'Yedeği yükle', function () {
      var ot = DB._oturum;
      DB = normalize(o); DB._oturum = ot || null; DB._yansi = null; DB._son = null;
      kaydetYerel(); hatirlatmalariGonder(); YIGIN = []; sayfaCiz(); ciz();
      if (ot && typeof tamGonder === 'function') {
        toast('Yedek yüklendi, ortak kayıtlara gönderiliyor…');
        tamGonder().then(function () { return cek(); }).then(function () { toast('Ortak kayıtlar güncellendi'); }, function (e) { toast(e.message); });
      } else toast('Yedek yüklendi');
    });
};
function csvAktar() {
  function hucre(v) { var s = String(v == null ? '' : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  var satirlar = [['Ödeme tarihi', 'Daire', 'Kiracı', 'Tür', 'Dönem', 'Tutar', 'Ödeme şekli', 'Not']];
  DB.odemeler.slice().sort(function (a, b) { return a.tarih < b.tarih ? -1 : 1; }).forEach(function (o) {
    var d = daireBul(o.daireId), donem = '';
    if (o.tur === 'kira' || o.tur === 'aidat') donem = o.donem ? ayAdi(o.donem) : '';
    else if (o.tur === 'komur') donem = (o.donem || '') + ' kömür';
    else donem = o.aciklama || '';
    satirlar.push([o.tarih, d ? d.no : '', d ? d.kiraci : '', TUR[o.tur], donem, String(o.tutar).replace('.', ','), o.sekil || '', o.not || '']);
  });
  dosyaKaydet('﻿' + satirlar.map(function (r) { return r.map(hucre).join(';'); }).join('\r\n'), 'elif-apartmani-odemeler-' + bugun() + '.csv', 'text/csv');
}
function guncellemeKontrol(elle) {
  S.elleKontrol = !!elle;
  if (BR && BR.checkUpdate) { BR.checkUpdate(); if (elle) toast('Kontrol ediliyor…'); }
  else if (elle) toast('Güncelleme kontrolü sadece telefonda çalışır');
}
/* Telefon tarafından gelen sonuç: ekran güncellemesi indirildi mi, APK mı gerekiyor? */
W.onUpdateState = function (json) {
  var r = {};
  try { r = JSON.parse(json); } catch (e) { r = {}; }
  if (r.durum === 'ekran') {
    S.guncelleme = { tip: 'ekran' };
  } else if (r.durum === 'apk') {
    S.guncelleme = { tip: 'apk', url: r.apkUrl || APK_URL, notlar: r.notlar || '' };
  } else {
    if (S.elleKontrol) toast(r.durum === 'hata' ? 'İnternete bağlanılamadı, sonra tekrar deneyin' : 'Uygulama güncel');
  }
  S.elleKontrol = false;
  guncellemeBandi();
};
/* Eski sürümlerle uyum */
W.onUpdateInfo = function () {};
W.onApkProgress = function (y, hata) {
  var g = S.guncelleme || {};
  if (y >= 0) g.ilerleme = 'İndiriliyor… %' + y;
  else if (y === -1) g.ilerleme = 'Kurulum ekranı açılıyor. Açılan pencerede “Güncelle”ye basın.';
  else { g.ilerleme = ''; toast('Güncelleme indirilemedi: ' + (hata || 'bağlantı sorunu')); }
  S.guncelleme = g;
  guncellemeBandi();
};
function guncellemeBandi() {
  var el = $('#update-banner'), g = S.guncelleme;
  if (!g) { el.hidden = true; return; }
  if (g.tip === 'ekran') {
    el.innerHTML = '<div><b>Uygulama güncellendi</b><br>Yeni özellikler için yenileyin.</div>' +
      '<button type="button" class="btn small" data-act="yenile">Yenile</button>';
  } else {
    el.innerHTML = '<div><b>Önemli güncelleme var</b><br>' + esc(g.ilerleme || 'Bir kez kurulması gerekiyor, kayıtlar silinmez.') + '</div>' +
      (g.ilerleme ? '' : '<button type="button" class="btn small" data-act="guncelle">Güncelle</button>');
  }
  el.hidden = false;
}

/* ---------- Olaylar ---------- */
var EYLEM = {
  'sekme': function (el) { S.tab = el.dataset.tab; YIGIN = []; sayfaCiz(); ciz(); window.scrollTo(0, 0); },
  'donem-geri': function () { if (S.tab === 'komur') S.sezon = sezonEkle(S.sezon, -1); else S.ay = ayEkle(S.ay, -1); ciz(); },
  'donem-ileri': function () { if (S.tab === 'komur') S.sezon = sezonEkle(S.sezon, 1); else S.ay = ayEkle(S.ay, 1); ciz(); },
  'filtre': function (el) { S.filtre = el.dataset.v; ciz(); },
  'kurulum': function () {
    var n = Math.min(500, Math.max(1, parseInt($('#k-sayi').value, 10) || 0));
    var gun = Math.min(31, Math.max(1, parseInt($('#k-gun').value, 10) || 1));
    var kira = sayi($('#k-kira').value);
    for (var i = 1; i <= n; i++) {
      DB.daireler.push({ id: yeniId() + i, no: String(i), kiraci: '', telefon: '', kira: kira, odemeGunu: gun, baslangic: buAy(), bos: false, not: '', olusturma: bugun() });
    }
    kaydet(); S.tab = 'daireler'; ciz(); toast(n + ' daire oluşturuldu');
  },
  'daire-ac': function (el) { daireSayfasi(el.dataset.id); },
  'daire-yeni': function () { daireFormu(null); },
  'abonelikler': function () { abonelikSayfasi(); },
  'toplu-ac': function (el) { topluSayfasi(el.dataset.id); },
  'toplu-kaydet': function (el) { topluKaydet(el.dataset.id); },
  'toplu-geri': function (el) {
    var tid = el.dataset.t, n = DB.odemeler.filter(function (o) { return o.toplu === tid; }).length;
    onayla('Son toplu girişte kaydedilen ' + n + ' ödeme silinecek.', 'Geri al', function () {
      odemeleriSil(function (o) { return o.toplu === tid; });
      kaydet(); YIGIN.pop(); YIGIN.pop(); sayfaCiz(); ciz(); toast('Toplu giriş geri alındı');
    });
  },
  't-sekil': function (el) {
    S.topluSekil = el.dataset.v;
    var b = document.querySelectorAll('#t-sekil button');
    for (var i = 0; i < b.length; i++) b[i].classList.toggle('on', b[i].dataset.v === S.topluSekil);
  },
  'hizli-odendi': function (el) {
    var d = daireBul(el.dataset.id), ym = S.ay, k = kiraDurum(d, ym);
    if (!(k.kalan > 0)) return;
    var tid = yeniId(), simdi = new Date().toISOString();
    [['kira', k.kira.kalan], ['aidat', k.aidat.kalan]].forEach(function (p) {
      if (p[1] > 0) DB.odemeler.push({ id: yeniId(), kayit: simdi, hizli: tid, daireId: d.id, tur: p[0], donem: ym, tutar: p[1],
        tarih: bugun(), sekil: 'Nakit', aciklama: '', not: '' });
    });
    kaydet(); ciz();
    toast('Daire ' + d.no + ' · ' + ayAdi(ym) + ' ödendi', function () {
      DB.odemeler = DB.odemeler.filter(function (o) { return o.hizli !== tid; });
      kaydet(); yenile(); toast('Geri alındı');
    }, waNumara(d.telefon) ? { metin: 'Bildir', fn: function () { makbuzGonder(d, DB.odemeler.filter(function (o) { return o.hizli === tid; })); } } : null);
  },
  'geri-al': function () { var f = toastGeriAl; toastGeriAl = null; $('#toast').hidden = true; if (f) f(); },
  'toast-ek': function () { var f = toastEk && toastEk.fn; toastEk = null; $('#toast').hidden = true; if (f) f(); },
  'kiraci-yeni': function (el) { daireFormu(el.dataset.id, true); },
  'kiraci-cikis': function (el) { kiraciCikisSayfasi(el.dataset.id); },
  'cikis-kaydet': function (el) { kiraciCikisKaydet(el.dataset.id); },
  'bildirimler': function () { bildirimSayfasi(); },
  'b-sekme': function (el) { S.bSekme = el.dataset.v; sayfaCiz(); },
  'kopyala': function (el) { kopyala(el.dataset.v, el.dataset.ad); },
  'daire-duzenle': function (el) { daireFormu(el.dataset.id); },
  'daire-kaydet': function (el) { daireKaydet(el.dataset.id || null); },
  'daire-sil': function (el) {
    var id = el.dataset.id, d = daireBul(id), n = DB.odemeler.filter(function (o) { return o.daireId === id; }).length;
    onayla('Daire ' + d.no + ' ve bu daireye ait ' + n + ' ödeme kaydı silinecek. Bu işlem geri alınamaz.', 'Daireyi sil', function () {
      DB.daireler = DB.daireler.filter(function (x) { return x.id !== id; });
      odemeleriSil(function (o) { return o.daireId === id; });
      kaydet(); YIGIN = []; sayfaCiz(); ciz(); toast('Daire silindi');
    });
  },
  'ara': function (el) { if (BR && BR.call) BR.call(el.dataset.tel); else if (BR && BR.dial) BR.dial(el.dataset.tel); else toast(el.dataset.tel); },
  'odeme-yeni': function () {
    var top = YIGIN[YIGIN.length - 1];
    odemeFormu(top && top.daireId ? { daireId: top.daireId } : {});
  },
  'odeme-daire': function (el) { odemeFormu({ daireId: el.dataset.id }); },
  'ay-hucre': function (el) { odemeFormu({ daireId: el.dataset.id, tur: 'kira', ay: el.dataset.ym }); },
  'komur-ode': function (el) { odemeFormu({ daireId: el.dataset.id, tur: 'komur', sezon: S.tab === 'komur' ? S.sezon : sezonu(bugun()) }); },
  'komur-ayar': function () { komurAyarSayfasi(); },
  'komur-hesap': function () { komurHesapSayfasi(); },
  'kh-kaydet': function () { komurHesapKaydet(); },
  'komur-ayar-kaydet': function () { komurAyarKaydet(); },
  'komur-kg': function (el) { komurKgSayfasi(el.dataset.id); },
  'komur-kg-kaydet': function (el) { komurKgKaydet(el.dataset.id); },
  'odeme-duzenle': function (el) { odemeFormu({ id: el.dataset.id }); },
  'o-tur': function (el) {
    FORM.tur = el.dataset.v;
    var b = document.querySelectorAll('#o-tur button');
    for (var i = 0; i < b.length; i++) b[i].classList.toggle('on', b[i].dataset.v === FORM.tur);
    formAlanlari(); tutarOner();
  },
  'o-sekil': function (el) {
    FORM.sekil = el.dataset.v;
    var b = document.querySelectorAll('#o-sekil button');
    for (var i = 0; i < b.length; i++) b[i].classList.toggle('on', b[i].dataset.v === FORM.sekil);
  },
  'odeme-kaydet': function () { odemeKaydet(); },
  'odeme-sil': function () {
    var id = FORM.id;
    onayla('Bu ödeme kaydı silinecek.', 'Ödemeyi sil', function () {
      odemeleriSil(function (o) { return o.id === id; });
      kaydet(); YIGIN.pop(); YIGIN.pop(); sayfaCiz(); ciz(); toast('Ödeme silindi. 30 gün içinde Geçmiş → Silinen ödemeler’den geri getirilebilir.');
    });
  },
  'onay-evet': function () { var s = YIGIN[YIGIN.length - 1]; if (s && s.onay) s.onay(); },
  'sheet-geri': function () { sayfaKapat(); yenile(); },
  'hatirlat-gun': function (el) {
    var v = +el.dataset.v, l = (DB.ayarlar.hatirlatGun || []).slice(), i = l.indexOf(v);
    if (i >= 0) l.splice(i, 1); else l.push(v);
    DB.ayarlar.hatirlatGun = l.sort(function (a, b) { return b - a; });
    kaydet(); ciz();
  },
  'bildirim-dene': function () {
    if (BR && BR.testNotification) { BR.testNotification(); toast('Bildirim gönderildi'); }
    else toast('Bildirimler sadece telefonda çalışır');
  },
  'bildirim-izin': function () { if (BR && BR.requestNotifications) BR.requestNotifications(); },
  'yedek-al': yedekAl,
  'metin-ac': function () { metinSayfasi(); },
  'metin-yukle': function () { var t = $('#m-metin').value; if (!t.trim()) { toast('Önce metni yapıştırın'); return; } W.onImport(t); },
  'drive-yedekle': function () {
    if (!(BR && BR.shareFile)) { yedekAl(); return; }
    BR.shareFile(JSON.stringify(temizVeri()), 'elif-apartmani-yedek-' + bugun() + '.json', 'application/json');
  },
  'drive-yukle': function () {
    if (!(BR && BR.importData)) { toast('Sadece telefonda çalışır'); return; }
    toast('Sol üstteki ☰ menüden Drive’ı seçin');
    BR.importData();
  },
  'yedek-yukle': function () { if (BR && BR.importData) BR.importData(); else toast('Yedek yükleme sadece telefonda çalışır'); },
  'csv': csvAktar,
  'senk-giris': function (el) {
    var e = $('#g-email').value.trim(), p = $('#g-sifre').value;
    if (!e || !p) { toast('E-posta ve şifreyi girin'); return; }
    el.disabled = true; el.textContent = 'Giriş yapılıyor…';
    girisYap(e, p).then(function (sonuc) {
      SENK.zaman = new Date(); SENK.hata = '';
      toast(sonuc === 'cekildi' ? 'Giriş yapıldı, ortak kayıtlar yüklendi' : 'Giriş yapıldı, bu telefondaki kayıtlar ortak alana gönderildi');
      YIGIN = []; sayfaCiz(); ciz();
    }, function (err) {
      if (DB._oturum && /izin/.test(err.message)) { DB._oturum = null; kaydetYerel(); }
      toast(err.message); ciz();
    });
  },
  'senk-unuttum': function () {
    var e = $('#g-email').value.trim();
    if (!e) { toast('Önce e-posta adresinizi yazın'); return; }
    sifreSifirla(e).then(function () { toast('Şifre yenileme e-postası gönderildi'); }, function (err) { toast(err.message); });
  },
  'senk-simdi': function () { toast('Eşitleniyor…'); esitle('elle').then(function () { toast(SENK.hata ? SENK.hata : 'Eşitlendi'); ciz(); }); },
  'senk-cikis': function () {
    onayla('Bu telefonda ortak kullanımdan çıkış yapılacak. Kayıtlar telefonda kalır ama artık eşitlenmez.', 'Çıkış yap', function () {
      cikisYap(); YIGIN = []; sayfaCiz(); ciz(); toast('Çıkış yapıldı');
    });
  },
  'artis-ac': function (el) { artisSayfasi(el.dataset.id); },
  'artis-kaydet': function (el) { artisKaydet(el.dataset.id); },
  'aidat-kaydet': function () {
    DB.ayarlar.aidat = { yaz: sayi($('#ad-yaz').value), kis: sayi($('#ad-kis').value), kisBas: +$('#ad-bas').value, kisBit: +$('#ad-bit').value };
    kaydet(); ciz(); toast('Aidat kaydedildi');
  },
  'oto-klasor': function () { if (BR && BR.chooseBackupFolder) BR.chooseBackupFolder(); else toast('Sadece telefonda çalışır'); },
  'oto-simdi': function () { if (BR && BR.backupNow) { BR.backupNow(); toast('Yedekleniyor…'); } },
  'guncelleme-kontrol': function () { guncellemeKontrol(true); },
  'yenile': function () { S.guncelleme = null; if (BR && BR.reloadApp) BR.reloadApp(); },
  'guncelle': function () {
    var g = S.guncelleme || {};
    if (!(BR && BR.installApk)) { if (BR && BR.openUrl) BR.openUrl(APK_URL); return; }
    if (BR.canInstall && !BR.canInstall()) {
      toast('Bir kerelik izin: açılan ekranda “Bu kaynaktan izin ver”i açıp geri dönün, sonra tekrar Güncelle’ye basın.');
      BR.openInstallPermission();
      return;
    }
    g.ilerleme = 'İndiriliyor…'; S.guncelleme = g; guncellemeBandi();
    BR.installApk(g.url || APK_URL);
  }
};
var DEGISIM = {
  'g-tur': function (el) { S.gTur = el.value; ciz(); },
  'g-tur-sec': function (el) { S.gTur = el.dataset.v; ciz(); },
  'g-daire': function (el) { S.gDaire = el.value; ciz(); },
  'rapor-daire': function (el) { S.raporDaire = el.value; sayfaCiz(); },
  'a-gecikme': function (el) { var v = +el.value; DB.ayarlar.gecikme = v > 0; if (v) DB.ayarlar.gecikmeSiklik = v; kaydet(); ciz(); },
  'a-saat': function (el) { DB.ayarlar.saat = +el.value; kaydet(); toast('Bildirimler her gün ' + pad(el.value) + ':00 civarında gelir'); }
};

W.onBackupFolder = function () {
  var oto = {};
  try { oto = JSON.parse(BR.backupInfo()); } catch (e) { oto = {}; }
  toast(oto.hata ? oto.hata : 'Yedek kaydedildi');
  if (S.tab === 'ayarlar' && !YIGIN.length) ciz();
};
W.onBack = function () {
  if (YIGIN.length) { sayfaKapat(); yenile(); return true; }
  if (S.tab !== 'ozet') { S.tab = 'ozet'; ciz(); return true; }
  return false;
};
W.onAppResume = function () {
  var simdi = Date.now();
  if (!S.sonKontrol || simdi - S.sonKontrol > 3 * 3600 * 1000) { S.sonKontrol = simdi; if (!S.guncelleme) guncellemeKontrol(false); }
  if (!YIGIN.length) ciz();
  hatirlatmalariGonder();
  if (typeof esitle === 'function') esitle('devam');
};

function baslat() {
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    var f = EYLEM[el.dataset.act];
    if (f) { e.preventDefault(); f(el); }
  });
  document.addEventListener('change', function (e) {
    var el = e.target.closest('[data-change]');
    if (el && DEGISIM[el.dataset.change]) DEGISIM[el.dataset.change](el);
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'b-ara') {
      S.bAra = e.target.value;
      var bl = document.getElementById('b-liste');
      if (bl) bl.innerHTML = bildirimListesiHtml();
    }
    if (e.target.id === 'arama') {
      S.arama = e.target.value;
      var l = document.getElementById('daire-listesi');
      if (l) l.innerHTML = daireListesiHtml();
    }
  });
  basiliTutKur();
  yaziBoyuUygula();
  yukle();
  silinenleriTemizle();
  ciz();
  hatirlatmalariGonder();
  setTimeout(function () { guncellemeKontrol(false); }, 1500);
  if (typeof esitle === 'function') esitle('acilis');
}

/* Elif Apartmanı – ek özellikler:
   1) WhatsApp'tan hatırlatma   2) Yıllık gelir raporu (grafikli)
   3) Arıza / iş defteri        4) Silinen ödemeler (30 gün geri getirme) */

/* ---------- 1) WhatsApp hatırlatma ---------- */
function waNumara(tel) {
  var n = String(tel || '').replace(/\D/g, '');
  if (!n) return '';
  if (n.indexOf('00') === 0) n = n.slice(2);
  if (n.charAt(0) === '0') n = '90' + n.slice(1);
  else if (n.length === 10 && n.charAt(0) === '5') n = '90' + n;
  return n;
}
/* Dairenin ödenmemiş kalemleri: gecikmiş/bekleyen kira+aidat, kömür, alınmamış depozito */
function borcKalemleri(d) {
  var l = [];
  kiraBorclari(d).forEach(function (b) {
    var k = kiraDurum(d, b.ym);
    var ne = k.kira && k.kira.kalan && k.aidat && k.aidat.kalan ? 'kira ve aidatı' : (k.aidat && k.aidat.kalan && !(k.kira && k.kira.kalan) ? 'aidatı' : 'kirası');
    l.push({ metin: ayAdi(b.ym) + ' ' + ne, tutar: b.kalan });
  });
  var bu = kiraDurum(d, buAy());
  if (bu.kalan > 0 && bu.kod !== 'gecikti' && bu.kod !== 'yok' && gunFark(bugun(), bu.vade) <= 3) {
    l.push({ metin: ayAdi(buAy()) + ' kira ve aidatı (son gün ' + tarihAdi(bu.vade, false) + ')', tutar: bu.kalan });
  }
  var kz = komurSezonBul(sezonu(bugun())), kk = kz ? komurDurum(d, kz) : null;
  if (kk && kk.kalan > 0) l.push({ metin: kz.sezon + ' kömür bedeli', tutar: kk.kalan });
  if (depozitoDurumu(d) === 'alinmadi') l.push({ metin: 'Depozito', tutar: +d.depozito || +d.kira || 0 });
  return l;
}
function hatirlatmaMetni(d) {
  var l = borcKalemleri(d), ad = d.kiraci ? (d.kiraci.split(' ')[0]) : '';
  if (!l.length) return '';
  var top = l.reduce(function (t, x) { return t + x.tutar; }, 0);
  return 'Merhaba' + (ad ? ' ' + ad : '') + ',\n' +
    'Elif Apartmanı Daire ' + d.no + ' için ödenmemiş tutarlar:\n' +
    l.map(function (x) { return '• ' + x.metin + ': ' + TL(x.tutar); }).join('\n') +
    (l.length > 1 ? '\nToplam: ' + TL(top) : '') +
    '\nBilginize, iyi günler.';
}
function whatsappAc(d) {
  var n = waNumara(d.telefon);
  if (!n) { toast('Bu dairede telefon numarası yok'); return; }
  var m = hatirlatmaMetni(d);
  if (!m) { toast('Bu dairenin ödenmemiş borcu yok'); return; }
  var url = 'https://wa.me/' + n + '?text=' + encodeURIComponent(m);
  if (BR && BR.openUrl) BR.openUrl(url); else window.open(url);
}
var WA_IKON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"/></svg>';
function waDugmesi(d) {
  if (!d || d.bos || !d.telefon || !borcKalemleri(d).length) return '';
  return '<button type="button" class="wa-btn" data-act="wa" data-id="' + d.id + '" aria-label="WhatsApp ile hatırlat">' + WA_IKON + '</button>';
}

/* ---------- 2) Yıllık gelir raporu ---------- */
function raporSayfasi(yil) {
  S.raporYil = yil || S.raporYil || +bugun().slice(0, 4);
  sayfaAc({
    baslik: function () { return 'Gelir raporu'; },
    ciz: function () {
      var y = String(S.raporYil), aylik = [], kira = 0, aidat = 0, komur = 0, diger = 0, daire = {};
      var secili = S.raporDaire ? daireBul(S.raporDaire) : null;
      if (!secili) S.raporDaire = '';
      for (var m = 0; m < 12; m++) aylik.push(0);
      DB.odemeler.forEach(function (o) {
        if (!o.tarih || o.tarih.slice(0, 4) !== y) return;
        if (secili && o.daireId !== secili.id) return;
        var t = +o.tutar || 0, ay = +o.tarih.slice(5, 7) - 1;
        if (o.tur === 'kira') { kira += t; aylik[ay] += t; daire[o.daireId] = (daire[o.daireId] || 0) + t; }
        else if (o.tur === 'aidat') aidat += t;
        else if (o.tur === 'komur') komur += t;
        else diger += t;
      });
      var h = '<div class="yil-nav"><button type="button" class="icon-btn" data-act="rapor-yil" data-v="-1" aria-label="Önceki yıl">‹</button>' +
        '<b>' + y + '</b><button type="button" class="icon-btn" data-act="rapor-yil" data-v="1" aria-label="Sonraki yıl">›</button></div>';
      h += daireSecici('rapor-daire', S.raporDaire, 'Bütün daireler (genel)');
      h += '<section class="card">' + baslik('grafik', (secili ? 'Daire ' + esc(secili.no) + ' · ' : '') + y + ' kira geliri') +
        (secili ? '<div class="rapor-kim">' + esc(secili.kiraci || bosAdi(secili)) + '</div>' : '') +
        '<div class="big">' + TL(kira) + '</div>' +
        grafikHtml(aylik) + '</section>';
      h += '<section class="card">' + baslik('para', 'Diğer tahsilatlar') + '<dl class="kv">' +
        '<dt>Aidat</dt><dd>' + TL(aidat) + '</dd><dt>Kömür</dt><dd>' + TL(komur) + '</dd>' +
        (diger ? '<dt>Diğer</dt><dd>' + TL(diger) + '</dd>' : '') + '</dl>' +
        '</section>';
      if (secili) return h;
      h += gelirGiderKarti(y, kira + aidat + komur + diger);
      var satirlar = daireler().filter(function (d) { return daire[d.id]; });
      h += '<section class="card">' + baslik('bina', 'Daire daire kira geliri');
      if (!satirlar.length) h += '<p class="empty">' + y + ' yılında kira ödemesi kaydı yok.</p>';
      else {
        var enCok = Math.max.apply(null, satirlar.map(function (d) { return daire[d.id]; }));
        h += '<div class="rapor-liste">' + satirlar.map(function (d) {
          var v = daire[d.id];
          return '<button type="button" class="rapor-satir" data-act="rapor-daire-sec" data-id="' + d.id + '"><span class="no">' + esc(d.no) + '</span><span class="row-main"><span class="row-title">' + esc(d.kiraci || bosAdi(d)) + '</span>' +
            '<span class="mini-bar"><i style="width:' + Math.max(2, Math.round(v / enCok * 100)) + '%"></i></span></span><span class="amt">' + TL(v) + '</span></button>';
        }).join('') + '</div>';
      }
      h += '</section><button type="button" class="btn ghost block" data-act="rapor-csv">Excel için dışa aktar</button>';
      return h;
    },
    hazir: grafikEtkilesim
  });
}
/* Aylık tahsilat grafiği: tek seri, tek renk, sıfırdan başlayan sütunlar, dokununca değer */
function grafikHtml(aylik) {
  var en = Math.max.apply(null, aylik), W2 = 340, H = 180, sol = 44, alt = 22, ust = 10;
  var adim = niceAdim(en), tavan = Math.max(adim, Math.ceil(en / adim) * adim);
  var gw = (W2 - sol - 4) / 12, bw = Math.max(8, gw - 6), ph = H - alt - ust;
  var s = '<div class="grafik" role="img" aria-label="Aylık kira tahsilatı"><svg viewBox="0 0 ' + W2 + ' ' + H + '" preserveAspectRatio="none">';
  for (var g = 0; g <= tavan; g += adim) {
    var gy = ust + ph - g / tavan * ph;
    s += '<line x1="' + sol + '" x2="' + W2 + '" y1="' + gy + '" y2="' + gy + '" class="g-cizgi"/>' +
      '<text x="' + (sol - 6) + '" y="' + (gy + 4) + '" class="g-eksen" text-anchor="end">' + kisaTL(g) + '</text>';
  }
  aylik.forEach(function (v, i) {
    var x = sol + i * gw + (gw - bw) / 2, h = tavan ? v / tavan * ph : 0, y = ust + ph - h;
    if (v > 0) {
      var r = Math.min(4, h, bw / 2);
      s += '<path class="g-sutun" d="M' + x + ',' + (ust + ph) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + bw - r) +
        'Q' + (x + bw) + ',' + y + ' ' + (x + bw) + ',' + (y + r) + 'V' + (ust + ph) + 'Z"/>';
    }
    s += '<rect class="g-hedef" x="' + (sol + i * gw) + '" y="' + ust + '" width="' + gw + '" height="' + (ph + alt) + '" data-ay="' + i + '" data-v="' + v + '"/>' +
      '<text x="' + (sol + i * gw + gw / 2) + '" y="' + (H - 6) + '" class="g-eksen" text-anchor="middle">' + AYK[i].slice(0, 3) + '</text>';
  });
  s += '</svg><div class="g-ipucu" id="g-ipucu" hidden></div></div>';
  return s;
}
function niceAdim(en) {
  if (!(en > 0)) return 10000;
  var ham = en / 4, us = Math.pow(10, Math.floor(Math.log10(ham))), k = ham / us;
  return (k <= 1 ? 1 : k <= 2 ? 2 : k <= 5 ? 5 : 10) * us;
}
function kisaTL(v) { return v >= 1000 ? NF.format(Math.round(v / 1000)) + 'B' : NF.format(v); }
function grafikEtkilesim() {
  var ip = document.getElementById('g-ipucu');
  if (!ip) return;
  var hedefler = document.querySelectorAll('.g-hedef');
  for (var i = 0; i < hedefler.length; i++) {
    hedefler[i].addEventListener('click', function (e) {
      var r = e.currentTarget, ay = +r.getAttribute('data-ay'), v = +r.getAttribute('data-v');
      ip.textContent = AYLAR[ay] + ': ' + TL(v);
      ip.hidden = false;
    });
  }
}
function raporCsv() {
  var y = String(S.raporYil), sat = [['Daire', 'Kiracı', 'Kira', 'Aidat', 'Kömür', 'Diğer', 'Toplam']], m = {};
  DB.odemeler.forEach(function (o) {
    if (!o.tarih || o.tarih.slice(0, 4) !== y) return;
    var r = m[o.daireId] || (m[o.daireId] = { kira: 0, aidat: 0, komur: 0, diger: 0 });
    r[o.tur in r ? o.tur : 'diger'] += +o.tutar || 0;
  });
  daireler().forEach(function (d) {
    var r = m[d.id]; if (!r) return;
    sat.push([d.no, d.kiraci || '', r.kira, r.aidat, r.komur, r.diger, r.kira + r.aidat + r.komur + r.diger]);
  });
  var csv = '﻿' + sat.map(function (r) { return r.map(function (v) { return String(v).replace(/;/g, ','); }).join(';'); }).join('\r\n');
  if (BR && BR.shareFile) BR.shareFile(csv, 'elif-apartmani-gelir-' + y + '.csv', 'text/csv');
  else dosyaKaydet(csv, 'elif-apartmani-gelir-' + y + '.csv', 'text/csv');
}

/* ---------- 3) Arıza / iş defteri ---------- */
function kimdir() { return (DB._oturum && DB._oturum.email) || ''; }
function acikIsler(did) {
  return DB.notlar.filter(function (n) { return n.durum !== 'yapildi' && (did === undefined || n.daireId === did); })
    .sort(function (a, b) { return a.tarih < b.tarih ? 1 : -1; });
}
function isSatiri(n, daireGoster) {
  var d = daireBul(n.daireId), yap = n.durum === 'yapildi';
  return '<div class="is-satir' + (yap ? ' yapildi' : '') + '">' +
    '<button type="button" class="is-kutu" data-act="is-durum" data-id="' + n.id + '" aria-label="' + (yap ? 'Yapılmadı olarak işaretle' : 'Yapıldı olarak işaretle') + '">' + (yap ? '✓' : '') + '</button>' +
    '<button type="button" class="row-main is-metin" data-act="is-duzenle" data-id="' + n.id + '">' +
    '<span class="row-title">' + esc(n.metin) + '</span>' +
    '<span class="row-sub">' + (daireGoster ? (d ? 'Daire ' + esc(d.no) : 'Genel') + ' · ' : '') + esc(tarihAdi(n.tarih)) +
    (n.kim ? ' · ' + esc(kisaKim(n.kim)) : '') + (yap && n.yapildiTarih ? ' · yapıldı ' + esc(tarihAdi(n.yapildiTarih, false)) : '') + '</span></button></div>';
}
function islerKarti() {
  var l = acikIsler();
  return '<section class="card"><div class="card-head">' + baslik('arac', 'Arıza ve işler' + (l.length ? ' (' + l.length + ')' : '')) +
    '<button type="button" class="link" data-act="isler">Tümü</button></div>' +
    (l.length ? l.slice(0, 5).map(function (n) { return isSatiri(n, true); }).join('') + (l.length > 5 ? '<p class="note">… ve ' + (l.length - 5) + ' iş daha</p>' : '')
      : '<p class="empty">Bekleyen arıza ya da iş yok.</p>') +
    '<button type="button" class="btn ghost block" data-act="is-yeni">+ Arıza / iş ekle</button></section>';
}
function islerSayfasi() {
  sayfaAc({
    baslik: function () { return 'Arıza ve işler'; },
    ciz: function () {
      var acik = acikIsler(), biten = DB.notlar.filter(function (n) { return n.durum === 'yapildi'; })
        .sort(function (a, b) { return (a.yapildiTarih || a.tarih) < (b.yapildiTarih || b.tarih) ? 1 : -1; });
      return '<button type="button" class="btn block" data-act="is-yeni">+ Arıza / iş ekle</button>' +
        '<section class="card">' + baslik('arac', 'Bekleyen (' + acik.length + ')') + '' +
        (acik.length ? acik.map(function (n) { return isSatiri(n, true); }).join('') : '<p class="empty">Bekleyen iş yok.</p>') + '</section>' +
        '<section class="card">' + baslik('onay', 'Yapılanlar') + '' +
        (biten.length ? biten.slice(0, 50).map(function (n) { return isSatiri(n, true); }).join('') : '<p class="empty">Henüz tamamlanan iş yok.</p>') + '</section>';
    }
  });
}
function isFormu(id, daireId) {
  var n = id ? DB.notlar.filter(function (x) { return x.id === id; })[0] : null;
  sayfaAc({
    baslik: function () { return n ? 'İşi düzenle' : 'Arıza / iş ekle'; },
    ciz: function () {
      var did = n ? n.daireId : (daireId || '');
      return '<div class="form">' +
        '<div class="field"><label for="i-daire">Daire</label><select id="i-daire"><option value="">Genel (bina)</option>' +
        daireler().map(function (d) { return '<option value="' + d.id + '"' + (d.id === did ? ' selected' : '') + '>Daire ' + esc(d.no) + (d.kiraci ? ' · ' + esc(d.kiraci) : '') + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="field"><label for="i-metin">Ne yapılacak?</label><textarea id="i-metin" placeholder="Örn. Mutfak musluğu akıtıyor">' + esc(n ? n.metin : '') + '</textarea></div>' +
        '<button type="button" class="btn block" data-act="is-kaydet" data-id="' + (n ? n.id : '') + '">Kaydet</button>' +
        (n ? '<button type="button" class="btn danger block" data-act="is-sil" data-id="' + n.id + '">Sil</button>' : '') + '</div>';
    }
  });
}
function isKaydet(id) {
  var metin = $('#i-metin').value.trim(), did = $('#i-daire').value;
  if (!metin) { toast('Ne yapılacağını yazın'); return; }
  if (id) {
    var n = DB.notlar.filter(function (x) { return x.id === id; })[0];
    if (n) { n.metin = metin; n.daireId = did; }
  } else {
    DB.notlar.push({ id: yeniId(), daireId: did, metin: metin, durum: 'bekliyor', tarih: bugun(), kim: kimdir() });
  }
  kaydet(); sayfaKapat(); yenile(); toast('Kaydedildi');
}

/* ---------- 4) Silinen ödemeler ---------- */
function odemeleriSil(filtre) {
  var silinen = [], simdi = bugun(), kim = kimdir();
  DB.odemeler = DB.odemeler.filter(function (o) {
    if (!filtre(o)) return true;
    silinen.push(o);
    return false;
  });
  silinen.forEach(function (o) { DB.silinenler.push({ id: 's' + o.id, odeme: o, silinme: simdi, kim: kim }); });
  return silinen.length;
}
function silinenleriTemizle() {
  var sinir = gunEkle(bugun(), -30);
  DB.silinenler = DB.silinenler.filter(function (s) { return s.silinme >= sinir; });
}
function silinenlerSayfasi() {
  sayfaAc({
    baslik: function () { return 'Silinen ödemeler'; },
    ciz: function () {
      var l = DB.silinenler.slice().sort(function (a, b) { return a.silinme < b.silinme ? 1 : -1; });
      if (!l.length) return '<p class="empty">Son 30 günde silinen ödeme yok.</p>';
      return '<p class="note">Silinen ödemeler 30 gün burada durur. “Geri getir” ile ödeme eski haline döner.</p>' +
        '<section class="card"><div class="list">' + l.map(function (s) {
          var o = s.odeme, d = daireBul(o.daireId);
          return '<div class="row-wrap"><div class="row"><span class="no">' + esc(d ? d.no : '?') + '</span>' +
            '<span class="row-main"><span class="row-title">' + TUR[o.tur] + ' · ' + TL(o.tutar) + '</span>' +
            '<span class="row-sub">' + ((o.tur === 'kira' || o.tur === 'aidat') && o.donem ? esc(ayAdi(o.donem)) + ' · ' : '') +
            'silindi ' + esc(tarihAdi(s.silinme, false)) + (s.kim ? ' · ' + esc(kisaKim(s.kim)) : '') + '</span></span></div>' +
            '<button type="button" class="btn small ghost" data-act="geri-getir" data-id="' + s.id + '">Geri getir</button></div>';
        }).join('') + '</div></section>';
    }
  });
}
function geriGetir(id) {
  var s = DB.silinenler.filter(function (x) { return x.id === id; })[0];
  if (!s) return;
  DB.silinenler = DB.silinenler.filter(function (x) { return x.id !== id; });
  if (!DB.odemeler.some(function (o) { return o.id === s.odeme.id; })) DB.odemeler.push(s.odeme);
  kaydet(); sayfaCiz(); toast('Ödeme geri getirildi');
}

/* ---------- Olaylar ---------- */
Object.assign(EYLEM, {
  'wa': function (el) { whatsappAc(daireBul(el.dataset.id)); },
  'rapor': function () { S.raporDaire = S.tab === 'gecmis' ? S.gDaire : ''; raporSayfasi(); },
  'rapor-yil': function (el) { S.raporYil += +el.dataset.v; sayfaCiz(); },
  'rapor-daire-sec': function (el) { S.raporDaire = el.dataset.id; sayfaCiz(); },
  'rapor-csv': raporCsv,
  'isler': function () { islerSayfasi(); },
  'is-yeni': function (el) { var top = YIGIN[YIGIN.length - 1]; isFormu(null, el.dataset.daire || (top && top.daireId) || ''); },
  'is-duzenle': function (el) { isFormu(el.dataset.id); },
  'is-kaydet': function (el) { isKaydet(el.dataset.id || null); },
  'is-sil': function (el) {
    var id = el.dataset.id;
    onayla('Bu iş kaydı silinecek.', 'Sil', function () {
      DB.notlar = DB.notlar.filter(function (n) { return n.id !== id; });
      kaydet(); YIGIN.pop(); YIGIN.pop(); sayfaCiz(); ciz(); toast('Silindi');
    });
  },
  'is-durum': function (el) {
    var n = DB.notlar.filter(function (x) { return x.id === el.dataset.id; })[0];
    if (!n) return;
    if (n.durum === 'yapildi') { n.durum = 'bekliyor'; n.yapildiTarih = ''; }
    else { n.durum = 'yapildi'; n.yapildiTarih = bugun(); n.yapan = kimdir(); }
    kaydet(); yenile(); toast(n.durum === 'yapildi' ? 'Yapıldı olarak işaretlendi' : 'Tekrar bekleyen işlere alındı');
  },
  'silinenler': function () { silinenlerSayfasi(); },
  'geri-getir': function (el) { geriGetir(el.dataset.id); }
});

/* ---------- Gider defteri, hesap dökümü, ay sonu özeti ---------- */
var GIDER_KAT = [
  ['komur', 'Kömür alımı', 'alev', 'turuncu'], ['tamir', 'Tamir ve bakım', 'arac', 'gri'],
  ['elektrik', 'Ortak elektrik', 'simsek', 'sari'], ['su', 'Ortak su', 'damla', 'mavi'],
  ['temizlik', 'Temizlik / kapıcı', 'kisi', 'yesil'], ['vergi', 'Vergi ve harç', 'fis', 'mor'], ['diger', 'Diğer', 'cuzdan', 'gri']
];
function giderKat(k) { for (var i = 0; i < GIDER_KAT.length; i++) if (GIDER_KAT[i][0] === k) return GIDER_KAT[i]; return GIDER_KAT[GIDER_KAT.length - 1]; }
function giderToplam(filtre) { return DB.giderler.filter(filtre).reduce(function (t, g) { return t + (+g.tutar || 0); }, 0); }

/* Ay sonu özeti: her ayın 20'sinde tek bildirim */
function ayOzetiBildirimi(gun0, son) {
  var cur = buAy(), t = cur + '-20';
  if (t < gun0 || t > son) return [];
  var top = 0, odeyen = 0, bek = 0, od = 0, satir = [], ids = [];
  daireler().forEach(function (d) {
    var k = kiraDurum(d, cur);
    if (k.kod === 'yok' || k.kod === 'tanimsiz') return;
    top++; bek += k.beklenen; od += Math.min(k.odenen, k.beklenen);
    if (k.kalan <= 0) odeyen++;
    else { satir.push('Daire ' + d.no + (d.kiraci ? ' (' + d.kiraci + ')' : '') + ' – ' + TL(k.kalan)); ids.push(d.id); }
  });
  if (!top) return [];
  return [{ tarih: t, tur: 'ozet', baslik: AYLAR[+cur.slice(5) - 1] + ' özeti · ' + odeyen + '/' + top + ' ödedi', daireler: ids,
    metin: 'Toplanan ' + TL(od) + ' / ' + TL(bek) + (satir.length ? '. Ödemeyenler:' : '. Herkes ödedi.') + (satir.length ? '\n' + satir.slice(0, 12).join('\n') : '') }];
}

/* Kömür sayfası: kömürcüye ödenen ve kasa farkı */
function komurKasaSatirlari(sezon, toplanan) {
  var odenen = giderToplam(function (g) { return g.kat === 'komur' && g.tarih && sezonu(g.tarih) === sezon; });
  if (!odenen) return '';
  var fark = toplanan - odenen;
  return '<dt>Kömürcüye ödenen</dt><dd>' + TL(odenen) + '</dd>' +
    '<dt>Kasa</dt><dd style="color:' + (fark >= 0 ? 'var(--ok)' : 'var(--bad)') + '">' + (fark >= 0 ? '+' : '−') + TL(Math.abs(fark)) + '</dd>';
}

/* Rapor: gelir – gider – net */
function gelirGiderKarti(y, gelir) {
  var l = DB.giderler.filter(function (g) { return (g.tarih || '').slice(0, 4) === y; });
  var gider = l.reduce(function (t, g) { return t + (+g.tutar || 0); }, 0), net = gelir - gider;
  var kat = {};
  l.forEach(function (g) { kat[g.kat] = (kat[g.kat] || 0) + (+g.tutar || 0); });
  return '<section class="card"><div class="card-head">' + baslik('cuzdan', y + ' gelir – gider') +
    '<button type="button" class="link" data-act="giderler">Giderler</button></div><dl class="kv">' +
    '<dt>Toplam tahsilat</dt><dd>' + TL(gelir) + '</dd>' +
    '<dt>Giderler</dt><dd style="color:var(--bad)">' + (gider ? '−' : '') + TL(gider) + '</dd>' +
    '<dt><b>Net</b></dt><dd class="net' + (net < 0 ? ' bad' : '') + '">' + TL(net) + '</dd></dl>' +
    (gider ? '<div class="gd-dagilim">' + GIDER_KAT.filter(function (k) { return kat[k[0]]; }).map(function (k) {
      return '<div class="gd-dg"><span class="od-ik od-' + k[3] + '">' + ikon(k[2]) + '</span><span>' + k[1] + '</span><b>' + TL(kat[k[0]]) + '</b></div>';
    }).join('') + '</div>' : '<p class="empty">' + y + ' için gider girilmemiş.</p>') + '</section>';
}

function giderSatiri(g) {
  var k = giderKat(g.kat);
  var meta = [g.kim && typeof kisaKim === 'function' ? kisaKim(g.kim) : ''].filter(Boolean).join(' · ');
  return '<button type="button" class="row od-row" data-act="gider-duzenle" data-id="' + g.id + '">' +
    '<span class="od-ik od-' + k[3] + '">' + ikon(k[2]) + '</span>' +
    '<span class="row-main"><span class="row-title">' + esc(k[1]) + '</span>' +
    (g.aciklama ? '<span class="row-sub">' + esc(g.aciklama) + '</span>' : '') +
    (meta ? '<span class="row-meta">' + esc(meta) + '</span>' : '') + '</span>' +
    '<span class="row-end"><span class="amt bad">−' + TL(g.tutar) + '</span></span></button>';
}
function giderlerSayfasi() {
  sayfaAc({
    baslik: function () { return 'Giderler'; },
    ciz: function () {
      var y = bugun().slice(0, 4), l = DB.giderler.slice().sort(function (a, b) { return (b.tarih + (b.kayit || '')) < (a.tarih + (a.kayit || '')) ? -1 : 1; });
      var buYil = giderToplam(function (g) { return (g.tarih || '').slice(0, 4) === y; });
      var h = '<section class="card gc-ozet"><div class="gc-toplam"><span><b class="bad">' + TL(buYil) + '</b><small>' + y + ' yılı giderleri</small></span></div>' +
        '<button type="button" class="btn block" data-act="gider-yeni">+ Gider ekle</button></section>';
      if (!l.length) return h + '<p class="empty">Henüz gider girilmemiş. Kömür alımı, tamir, ortak elektrik gibi harcamaları buraya ekleyin.</p>';
      var gun = null;
      l.forEach(function (g) {
        if (!gun || gun.t !== g.tarih) {
          if (gun) h += '</div></section>';
          gun = { t: g.tarih };
          var gt = giderToplam(function (x) { return x.tarih === g.tarih; });
          h += '<div class="bk-gun gc-gun"><span>' + esc(gunBasligi(g.tarih)) + '</span><span>−' + TL(gt) + '</span></div><section class="card gc-kart"><div class="list">';
        }
        h += giderSatiri(g);
      });
      return h + '</div></section>';
    }
  });
}
function giderFormu(id) {
  var g = id ? DB.giderler.filter(function (x) { return x.id === id; })[0] : null;
  S.gdKat = g ? g.kat : (S.gdKat || 'tamir');
  sayfaAc({
    baslik: function () { return g ? 'Gideri düzenle' : 'Gider ekle'; },
    ciz: function () {
      return '<div class="form"><div class="field"><span class="lbl">Ne için?</span><div class="gd-katlar">' +
        GIDER_KAT.map(function (k) {
          return '<button type="button" class="gd-kat od-' + k[3] + (S.gdKat === k[0] ? ' on' : '') + '" data-act="gd-kat" data-v="' + k[0] + '">' + ikon(k[2]) + '<span>' + k[1] + '</span></button>';
        }).join('') + '</div></div>' +
        '<div class="grid2"><div class="field"><label for="gd-tutar">Tutar (₺)</label><input id="gd-tutar" inputmode="decimal" value="' + (g ? esc(g.tutar) : '') + '"></div>' +
        '<div class="field"><label for="gd-tarih">Tarih</label><input id="gd-tarih" type="date" value="' + esc(g ? g.tarih : bugun()) + '"></div></div>' +
        '<div class="field"><label for="gd-aciklama">Açıklama</label><input id="gd-aciklama" placeholder="Örn. 30 ton kömür, kombi tamiri" value="' + esc(g ? g.aciklama || '' : '') + '"></div>' +
        '<button type="button" class="btn block" data-act="gider-kaydet" data-id="' + (g ? g.id : '') + '">Kaydet</button>' +
        (g ? '<button type="button" class="btn danger block" data-act="gider-sil" data-id="' + g.id + '">Sil</button>' : '') + '</div>';
    }
  });
}
function giderKaydet(id) {
  var tutar = sayi($('#gd-tutar').value), tarih = $('#gd-tarih').value || bugun();
  if (!(tutar > 0)) { toast('Tutarı girin'); return; }
  var veri = { kat: S.gdKat || 'diger', tutar: tutar, tarih: tarih, aciklama: $('#gd-aciklama').value.trim() };
  var g = id ? DB.giderler.filter(function (x) { return x.id === id; })[0] : null;
  if (g) Object.assign(g, veri);
  else DB.giderler.push(Object.assign({ id: yeniId(), kim: kimdir(), kayit: new Date().toISOString() }, veri));
  kaydet(); sayfaKapat(); yenile(); toast('Gider kaydedildi');
}

/* Kiracı hesap dökümü */
function dokumVerisi(d) {
  var bas = baslangicAyi(d), giris = d.girisTarihi || (bas ? bas + '-01' : '');
  var l = DB.odemeler.filter(function (o) {
    if (o.daireId !== d.id) return false;
    if ((o.tur === 'kira' || o.tur === 'aidat') && o.donem) return !bas || o.donem >= bas;
    return !giris || (o.tarih || '') >= giris;
  }).sort(function (a, b) { return (b.tarih + b.kayit) < (a.tarih + a.kayit) ? -1 : 1; });
  var top = { kira: 0, aidat: 0, komur: 0, diger: 0 };
  l.forEach(function (o) { top[o.tur in top ? o.tur : 'diger'] += +o.tutar || 0; });
  var borc = kiraBorclari(d).reduce(function (t, b) { return t + b.kalan; }, 0);
  var kSez = komurSezonBul(sezonu(bugun())), kk = komurDurum(d, kSez);
  return { l: l, top: top, borc: borc, komurKalan: kk ? kk.kalan : 0, sezon: kSez ? kSez.sezon : '', giris: giris };
}
function dokumMetni(d) {
  var v = dokumVerisi(d), dep = depozitoDurumu(d);
  var m = 'Elif Apartmanı – Daire ' + d.no + ' hesap dökümü\n' + (d.kiraci || '') + '\n' + tarihAdi(bugun()) + '\n\n' +
    'Giriş: ' + (v.giris ? tarihAdi(v.giris) : '-') + '\nAylık kira: ' + TL(d.kira) + '\n' +
    'Ödenen kira: ' + TL(v.top.kira) + '\nÖdenen aidat: ' + TL(v.top.aidat) + '\nÖdenen kömür: ' + TL(v.top.komur) + '\n' +
    'Kira/aidat borcu: ' + (v.borc ? TL(v.borc) : 'Yok') + '\n' + (v.sezon ? 'Kömür borcu (' + v.sezon + '): ' + (v.komurKalan > 0 ? TL(v.komurKalan) : 'Yok') + '\n' : '') +
    'Depozito: ' + (dep === 'alindi' ? (+d.depozito ? TL(d.depozito) + ' alındı' : 'Alındı') : dep === 'alinmadi' ? 'Alınmadı' : '-') + '\n\nÖdemeler:\n';
  m += v.l.map(function (o) {
    var ne = (TUR[o.tur] || 'Diğer') + ((o.tur === 'kira' || o.tur === 'aidat') && o.donem ? ' ' + ayAdi(o.donem) : o.tur === 'komur' && o.donem ? ' ' + o.donem : '');
    return '• ' + tarihAdi(o.tarih) + ' – ' + ne + ': ' + TL(o.tutar);
  }).join('\n');
  return m;
}
function dokumSayfasi(id) {
  var d = daireBul(id); if (!d) return;
  sayfaAc({
    baslik: function () { return 'Daire ' + d.no + ' hesap dökümü'; },
    ciz: function () {
      var v = dokumVerisi(d), dep = depozitoDurumu(d);
      var h = '<section class="card"><div class="dk-bas"><span class="no">' + esc(d.no) + '</span><span><b>' + esc(d.kiraci || bosAdi(d)) + '</b>' +
        '<small>Giriş ' + (v.giris ? esc(tarihAdi(v.giris)) : '-') + ' · Kira ' + TL(d.kira) + '</small></span></div>' +
        '<div class="dk-kutular">' +
        '<div class="dk-kutu' + (v.borc ? ' kotu' : ' iyi') + '"><small>Kira / aidat borcu</small><b>' + (v.borc ? TL(v.borc) : 'Yok') + '</b></div>' +
        '<div class="dk-kutu' + (v.komurKalan > 0 ? ' kotu' : ' iyi') + '"><small>Kömür borcu</small><b>' + (v.komurKalan > 0 ? TL(v.komurKalan) : 'Yok') + '</b></div></div>' +
        '<dl class="kv"><dt>Ödenen kira</dt><dd>' + TL(v.top.kira) + '</dd><dt>Ödenen aidat</dt><dd>' + TL(v.top.aidat) + '</dd>' +
        '<dt>Ödenen kömür</dt><dd>' + TL(v.top.komur) + '</dd>' + (v.top.diger ? '<dt>Diğer</dt><dd>' + TL(v.top.diger) + '</dd>' : '') +
        '<dt>Depozito</dt><dd>' + (dep === 'alindi' ? (+d.depozito ? TL(d.depozito) : 'Alındı') : dep === 'alinmadi' ? '<span style="color:var(--bad)">Alınmadı</span>' : '–') + '</dd></dl></section>' +
        '<div class="actions">' + (waNumara(d.telefon) ? '<button type="button" class="btn wa-tam" data-act="dokum-wa" data-id="' + d.id + '">WhatsApp ile gönder</button>' : '') +
        '<button type="button" class="btn ghost" data-act="dokum-paylas" data-id="' + d.id + '">Dosya olarak paylaş</button></div>' +
        '<section class="card">' + baslik('saat', 'Ödemeler (' + v.l.length + ')') +
        (v.l.length ? '<div class="list">' + v.l.map(function (o) { return odemeSatiri(o, false); }).join('') + '</div>' : '<p class="empty">Ödeme kaydı yok.</p>') + '</section>';
      return h;
    }
  });
}

Object.assign(EYLEM, {
  'giderler': function () { giderlerSayfasi(); },
  'gider-yeni': function () { giderFormu(null); },
  'gider-duzenle': function (el) { giderFormu(el.dataset.id); },
  'gider-kaydet': function (el) { giderKaydet(el.dataset.id || null); },
  'gider-sil': function (el) {
    var id = el.dataset.id;
    onayla('Bu gider silinecek.', 'Sil', function () {
      DB.giderler = DB.giderler.filter(function (g) { return g.id !== id; });
      kaydet(); YIGIN.pop(); YIGIN.pop(); if (YIGIN.length) sayfaCiz(); else sayfaKapat(); ciz(); toast('Silindi');
    });
  },
  'gd-kat': function (el) {
    S.gdKat = el.dataset.v;
    var l = document.querySelectorAll('.gd-kat');
    for (var i = 0; i < l.length; i++) l[i].classList.toggle('on', l[i] === el);
  },
  'dokum': function (el) { dokumSayfasi(el.dataset.id); },
  'dokum-wa': function (el) {
    var d = daireBul(el.dataset.id), n = waNumara(d && d.telefon);
    if (!n) { toast('Telefon numarası yok'); return; }
    var url = 'https://wa.me/' + n + '?text=' + encodeURIComponent(dokumMetni(d));
    if (BR && BR.openUrl) BR.openUrl(url); else window.open(url);
  },
  'dokum-paylas': function (el) {
    var d = daireBul(el.dataset.id); if (!d) return;
    var ad = 'Daire ' + d.no + ' hesap dokumu ' + bugun() + '.txt';
    if (BR && BR.shareFile) BR.shareFile(dokumMetni(d), ad, 'text/plain');
    else kopyala(dokumMetni(d), 'Hesap dökümü');
  }
});

/* ---------- Makbuz, kira artışı önerisi, yazı boyutu, boş daire, beyanname ---------- */
function makbuzGonder(d, odemeler) {
  var n = waNumara(d && d.telefon);
  if (!n) { toast('Bu dairede telefon numarası yok'); return; }
  var ad = d.kiraci ? d.kiraci.split(' ')[0] : '', top = 0;
  var satir = (odemeler || []).map(function (o) {
    top += +o.tutar || 0;
    var ne = o.tur === 'kira' ? ayAdi(o.donem) + ' kirası' : o.tur === 'aidat' ? ayAdi(o.donem) + ' aidatı' : o.tur === 'komur' ? (o.donem || '') + ' kömür ödemesi' : (o.aciklama || 'Ödeme');
    return '• ' + ne + ': ' + TL(o.tutar);
  });
  var m = 'Merhaba' + (ad ? ' ' + ad : '') + ',\nElif Apartmanı Daire ' + d.no + ' için ödemeniz alınmıştır:\n' + satir.join('\n') +
    (satir.length > 1 ? '\nToplam: ' + TL(top) : '') + '\nTeşekkür ederiz.';
  var url = 'https://wa.me/' + n + '?text=' + encodeURIComponent(m);
  if (BR && BR.openUrl) BR.openUrl(url); else window.open(url);
}
function oneriKira(d) {
  var o = +DB.ayarlar.tufe;
  if (!(o > 0) || !(+d.kira > 0) || d.bos) return 0;
  return Math.round(+d.kira * (1 + o / 100) / 50) * 50;
}
function yaziBoyu() { try { return +localStorage.getItem('elif-yazi') || 1; } catch (e) { return 1; } }
function yaziBoyuUygula() {
  if (typeof document === 'undefined' || !document.body) return;
  var v = yaziBoyu();
  document.body.style.zoom = String(v);
  document.body.classList.toggle('buyuk', v > 1.01);
}
function bosBaslangic(d) {
  if (d.bosBas) return d.bosBas;
  var l = (d.eskiKiracilar || []).filter(function (k) { return k.cikis; }).sort(function (a, b) { return a.cikis < b.cikis ? 1 : -1; });
  return l.length ? ayEkle(l[0].cikis, 1) + '-01' : '';
}
function bosGun(d) {
  if (!d.bos || d.ortak) return null;
  var b = bosBaslangic(d); if (!b) return null;
  var g = gunFark(b, bugun());
  return g >= 0 ? g : null;
}
function bosDaireKarti(d) {
  var b = bosBaslangic(d), g = bosGun(d), kacan = g !== null && +d.kira > 0 ? Math.round(g / 30 * d.kira / 100) * 100 : 0;
  return '<section class="card">' + baslik('ev', 'Boş daire') + '<dl class="kv">' +
    (b ? '<dt>Boşaldığı tarih</dt><dd>' + esc(tarihAdi(b)) + '</dd><dt>Boş geçen süre</dt><dd>' + (g || 0) + ' gün</dd>' +
      (kacan ? '<dt>Kaçan kira</dt><dd style="color:var(--bad)">' + TL(kacan) + '</dd>' : '') : '') + '</dl>' +
    (b ? '' : '<div class="satir-form"><input id="bos-tarih" type="date" aria-label="Boşaldığı tarih"><button type="button" class="btn small" data-act="bos-tarih" data-id="' + d.id + '">Boşaldığı tarihi kaydet</button></div>') +
    '<button type="button" class="btn ghost block" data-act="ilan" data-id="' + d.id + '">Kiralık ilanı hazırla</button></section>';
}
function ilanMetni(d) {
  var A = DB.ayarlar.aidat || {};
  return 'KİRALIK DAİRE\nElif Apartmanı – Daire ' + d.no + '\n' +
    (+d.petek ? '• ' + d.petek + ' petek kalorifer (kömürlü)\n' : '') +
    '• Kira: ' + (+d.kira ? TL(d.kira) : 'görüşülür') + '\n' +
    '• Aidat: kışın ' + TL(A.kis) + ', yazın ' + TL(A.yaz) + '\n' +
    '• Depozito: 1 kira\n\nBilgi için: ' + (DB.ayarlar.ilanTel || '');
}
function ilanSayfasi(id) {
  var d = daireBul(id); if (!d) return;
  sayfaAc({
    baslik: function () { return 'Daire ' + d.no + ' · kiralık ilanı'; },
    ciz: function () {
      return '<div class="form"><div class="field"><label for="ilan-metin">İlan metni</label><textarea id="ilan-metin" class="ilan-metin">' + esc(ilanMetni(d)) + '</textarea></div>' +
        (DB.ayarlar.ilanTel ? '' : '<p class="note">İlandaki telefonu Ayarlar → Kira artışı ve ilan bölümünden bir kez yazın.</p>') +
        '<div class="actions"><button type="button" class="btn wa-tam" data-act="ilan-wa">WhatsApp’ta paylaş</button>' +
        '<button type="button" class="btn ghost" data-act="ilan-kopyala">Kopyala</button></div></div>';
    }
  });
}
function beyanBildirimi(gun0, son) {
  var y = +gun0.slice(0, 4), t = y + '-03-01';
  if (t < gun0 || t > son) return [];
  var onceki = String(y - 1), top = 0;
  DB.odemeler.forEach(function (o) { if (o.tur === 'kira' && (o.tarih || '').slice(0, 4) === onceki) top += +o.tutar || 0; });
  if (!top) return [];
  return [{ tarih: t, tur: 'beyan', baslik: 'Kira geliri beyannamesi', daireler: [],
    metin: onceki + ' yılında tahsil edilen kira geliri: ' + TL(top) + '\nBeyanname için bu tutarı muhasebecinize iletin.' }];
}
function ekAyarlarHtml() {
  var v = yaziBoyu(), A = DB.ayarlar;
  return '<section class="card">' + baslik('kalem', 'Yazı boyutu') +
    '<div class="seg">' + [[1, 'Normal'], [1.12, 'Büyük'], [1.24, 'Çok büyük']].map(function (x) {
      return '<button type="button" data-act="yazi-boyu" data-v="' + x[0] + '" class="' + (Math.abs(v - x[0]) < 0.01 ? 'on' : '') + '">' + x[1] + '</button>';
    }).join('') + '</div><p class="note">Yalnız bu telefonu etkiler.</p></section>' +
    '<section class="card">' + baslik('artis', 'Kira artışı ve ilan') +
    '<div class="grid2"><div class="field"><label for="a-tufe">Yıllık TÜFE (%)</label><input id="a-tufe" inputmode="decimal" placeholder="Örn. 33,5" value="' + (+A.tufe ? esc(String(A.tufe).replace('.', ',')) : '') + '"></div>' +
    '<div class="field"><label for="a-ilantel">İlan telefonu</label><input id="a-ilantel" type="tel" value="' + esc(A.ilanTel || '') + '"></div></div>' +
    '<p class="note">TÜFE oranı, artış günü gelen dairelerde yeni kirayı önermek için kullanılır. Güncel oranı TÜİK’ten kontrol edin.</p>' +
    '<button type="button" class="btn ghost block" data-act="ek-ayar-kaydet">Kaydet</button></section>';
}

Object.assign(EYLEM, {
  'makbuz': function (el) {
    var o = DB.odemeler.filter(function (x) { return x.id === el.dataset.id; })[0];
    if (o) makbuzGonder(daireBul(o.daireId), [o]);
  },
  'yazi-boyu': function (el) {
    try { localStorage.setItem('elif-yazi', el.dataset.v); } catch (e) { /* yoksay */ }
    yaziBoyuUygula(); ciz();
  },
  'ek-ayar-kaydet': function () {
    DB.ayarlar.tufe = sayi($('#a-tufe').value) || 0;
    DB.ayarlar.ilanTel = $('#a-ilantel').value.trim();
    kaydet(); ciz(); toast('Kaydedildi');
  },
  'bos-tarih': function (el) {
    var d = daireBul(el.dataset.id), t = $('#bos-tarih').value;
    if (!t) { toast('Tarihi seçin'); return; }
    d.bosBas = t; kaydet(); yenile(); toast('Kaydedildi');
  },
  'ilan': function (el) { ilanSayfasi(el.dataset.id); },
  'ilan-kopyala': function () { kopyala($('#ilan-metin').value, 'İlan metni'); },
  'ilan-wa': function () {
    var url = 'https://wa.me/?text=' + encodeURIComponent($('#ilan-metin').value);
    if (BR && BR.openUrl) BR.openUrl(url); else window.open(url);
  }
});

if (typeof document !== 'undefined' && document.getElementById('main')) document.addEventListener('DOMContentLoaded', baslat);
if (typeof module !== 'undefined') {
  module.exports = { kurulumAc: kurulumAc, setDB: function (d) { DB = normalize(d); }, kiraDurum: kiraDurum, kiraBorclari: kiraBorclari, hatirlatmaListesi: hatirlatmaListesi, komurDurum: komurDurum, ayEkle: ayEkle, sezonu: sezonu, sayi: sayi, vadeGunu: vadeGunu };
}
