'use strict';
/* Elif Apartmanı – kira ve kömür takibi
   Veriler telefonda saklanır (Android köprüsü), tarayıcıda denerken localStorage kullanılır. */

var W = (typeof window !== 'undefined') ? window : {};
var BR = (typeof window !== 'undefined' && window.Android) ? window.Android : null;
var APK_URL = 'https://github.com/muratyasa/elif-apartmani/releases/latest/download/ElifApartmani.apk';

var AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
var AYK = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
var DURUM = { odendi: 'Ödendi', gecikti: 'Gecikti', kismi: 'Kısmi', bekliyor: 'Bekliyor', yok: 'Boş', tanimsiz: 'Kira yok' };
var TUR = { kira: 'Kira', komur: 'Kömür', diger: 'Diğer' };

/* ---------- Veri ---------- */
function bosVeri() {
  return {
    surum: 1,
    daireler: [],
    odemeler: [],
    taksitler: [],
    komur: [],
    ayarlar: { hatirlatGun: [7, 1], gecikme: true, gecikmeSiklik: 1, saat: 10, bildirimGoruldu: '' },
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
  if (!Array.isArray(d.daireler)) d.daireler = [];
  if (!Array.isArray(d.odemeler)) d.odemeler = [];
  if (!Array.isArray(d.taksitler)) d.taksitler = [];
  if (!Array.isArray(d.komur)) d.komur = [];
  IDX = null;
  return d;
}
function kaydet() {
  IDX = null;
  var s = JSON.stringify(DB);
  try {
    if (BR) BR.save(s); else localStorage.setItem('elif-db', s);
  } catch (e) { toast('Kaydedilemedi'); }
  hatirlatmalariGonder();
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
  var n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

/* ---------- Hesaplar ---------- */
function daireSirala(a, b) { return String(a.no).localeCompare(String(b.no), 'tr', { numeric: true }); }
function daireler() { return DB.daireler.slice().sort(daireSirala); }
function daireBul(id) { for (var i = 0; i < DB.daireler.length; i++) if (DB.daireler[i].id === id) return DB.daireler[i]; return null; }
function daireAdi(d) { return d ? 'Daire ' + d.no : 'Silinmiş daire'; }

function vadeGunu(d, ym) {
  var g = Math.min(Math.max(1, parseInt(d.odemeGunu, 10) || 1), aydakiGun(ym));
  return ym + '-' + pad(g);
}
function baslangicAyi(d) { return d.baslangic || (d.olusturma ? d.olusturma.slice(0, 7) : '2000-01'); }
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
function kiraDurum(d, ym) {
  if (!kiraciDonemi(d, ym)) return { kod: 'yok', odenen: 0, kalan: 0, beklenen: 0, vade: '' };
  var bek = +d.kira || 0, od = kiraOdenen(d.id, ym), kalan = Math.max(0, bek - od), vade = vadeGunu(d, ym), kod;
  if (bek <= 0) kod = od > 0 ? 'odendi' : 'tanimsiz';
  else if (kalan <= 0) kod = 'odendi';
  else if (bugun() > vade) kod = 'gecikti';
  else if (od > 0) kod = 'kismi';
  else kod = 'bekliyor';
  return { kod: kod, odenen: od, kalan: kalan, beklenen: bek, vade: vade };
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
function komurDurum(d, sez) {
  if (!sez) return null;
  var e = (sez.daireler || {})[d.id];
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
  return { kod: kod, kg: +e.kg || 0, beklenen: bek, odenen: od, kalan: kalan, elle: e.tutar !== null && e.tutar !== undefined && e.tutar !== '' };
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
  /* Gecikme: ödeme gününün ertesi günü, sonra seçilen sıklıkta (her gün / 3 günde bir / pazartesi) hepsi tek bildirimde */
  var siklik = +A.gecikmeSiklik || 1, topluGunler = [];
  for (var t = gun0; t <= son; t = gunEkle(t, 1)) {
    var dd = toDate(t);
    if (siklik === 1 || (siklik === 7 && dd.getDay() === 1) || (siklik === 3 && Math.floor(dd.getTime() / 86400000) % 3 === 0)) topluGunler.push(t);
  }
  function gecikmeGunleri(vade) {
    var ilk = gunEkle(vade, 1), l = [];
    if (ilk >= gun0 && ilk <= son) l.push(ilk);
    topluGunler.forEach(function (p) { if (p > ilk) l.push(p); });
    return l;
  }
  function kisi(d) { return 'Daire ' + d.no + (d.kiraci ? ' (' + d.kiraci + ')' : ''); }
  var cur = buAy();
  DB.daireler.forEach(function (d) {
    for (var i = -24; i <= 3; i++) {
      var ym = ayEkle(cur, i), k = kiraDurum(d, ym);
      if (k.kalan <= 0) continue;
      gunler.forEach(function (g) { ekle(gunEkle(k.vade, -g), 'kira', g, d, TL(k.kalan)); });
      if (A.gecikme) gecikmeGunleri(k.vade).forEach(function (t) { ekle(t, 'kira-gec', 0, d, ayAdi(ym) + ', ' + TL(k.kalan)); });
    }
    DB.komur.forEach(function (sez) {
      if (!sez.sonOdeme) return;
      var k = komurDurum(d, sez);
      if (!k || k.kalan <= 0) return;
      gunler.forEach(function (g) { ekle(gunEkle(sez.sonOdeme, -g), 'komur', g, d, TL(k.kalan)); });
      if (A.gecikme) gecikmeGunleri(sez.sonOdeme).forEach(function (t) { ekle(t, 'komur-gec', 0, d, sez.sezon + ' kömürü, ' + TL(k.kalan)); });
    });
    if (!d.bos && d.sozlesmeBit) {
      [30, 7, 0].forEach(function (g) { ekle(gunEkle(d.sozlesmeBit, -g), 'sozlesme', g, d, tarihAdi(d.sozlesmeBit)); });
    }
  });
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
    } else {
      baslik = (b.gun === 0 ? 'Bugün sözleşmesi bitiyor' : 'Sözleşme ' + b.gun + ' gün sonra bitiyor') + ' · ' + n + ' daire';
      ust = 'Kira sözleşmesi bitenler:';
    }
    return { tarih: b.tarih, tur: b.tip, baslik: baslik, metin: ust + '\n' + satirlar.join('\n'), daireler: b.ids };
  });
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
function toast(msg, geriAl) {
  if (typeof document === 'undefined') return;
  var t = $('#toast');
  toastGeriAl = geriAl || null;
  t.innerHTML = '<span>' + esc(msg) + '</span>' + (geriAl ? '<button type="button" class="toast-btn" data-act="geri-al">Geri al</button>' : '');
  t.hidden = false;
  clearTimeout(toastZamani);
  toastZamani = setTimeout(function () { t.hidden = true; toastGeriAl = null; }, geriAl ? 6000 : 2600);
}
function chip(kod) { return '<span class="chip ' + kod + '">' + DURUM[kod] + '</span>'; }

var S = { tab: 'ozet', ay: buAy(), sezon: sezonu(bugun()), filtre: 'hepsi', arama: '', gTur: 'hepsi', gDaire: '', guncelleme: null, elleKontrol: false };

/* ---------- Ana görünüm ---------- */
function ciz() {
  var tabs = document.querySelectorAll('#tabs button');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('on', tabs[i].dataset.tab === S.tab);
  var nav = $('#periodnav');
  if (S.tab === 'ozet' || S.tab === 'daireler') { nav.hidden = false; $('#donem-label').textContent = ayAdi(S.ay); }
  else if (S.tab === 'komur') { nav.hidden = false; $('#donem-label').textContent = S.sezon; }
  else nav.hidden = true;
  if (!DB.daireler.length && S.tab !== 'ayarlar') nav.hidden = true;
  $('#top-sub').textContent = {
    ozet: 'Kira ve kömür takibi', daireler: DB.daireler.length + ' daire', komur: 'Kömür sezonu',
    gecmis: 'Girilen ödemeler', ayarlar: 'Bildirim, yedek, sürüm'
  }[S.tab];
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
    '<h2 class="card-title">Başlangıç</h2>' +
    '<p class="note">Önce daireleri oluşturalım. Kiracı adı, telefon ve kira tutarını sonra her dairenin içinden tek tek girebilirsiniz.</p>' +
    '<div class="form">' +
    '<div class="grid2">' +
    '<div class="field"><label for="k-sayi">Daire sayısı</label><input id="k-sayi" type="number" inputmode="numeric" value="40" min="1" max="500"></div>' +
    '<div class="field"><label for="k-gun">Kira ödeme günü</label><input id="k-gun" type="number" inputmode="numeric" value="1" min="1" max="31"></div>' +
    '</div>' +
    '<div class="field"><label for="k-kira">Aylık kira (hepsi için, boş bırakılabilir)</label><input id="k-kira" inputmode="decimal" placeholder="Örn. 6000"></div>' +
    '<button type="button" class="btn block" data-act="kurulum">Daireleri oluştur</button>' +
    '</div></section>' +
    '<section class="card"><h2 class="card-title">Yedeğiniz var mı?</h2>' +
    '<p class="note">Daha önce aldığınız bir yedek dosyasını yükleyebilirsiniz.</p>' +
    '<button type="button" class="btn ghost block" data-act="yedek-yukle">Yedekten geri yükle</button></section>';
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

  var h = '<section class="card">' +
    '<h2 class="card-title">' + esc(ayAdi(ay)) + ' kirası</h2>' +
    '<div class="big">' + TL(od) + ' <small>/ ' + TL(bek) + '</small></div>' +
    '<div class="bar" role="img" aria-label="Yüzde ' + yuzde + ' toplandı"><i style="width:' + yuzde + '%"></i></div>' +
    '<div class="counts"><span><b>' + c.odendi + '</b> ödedi</span>' +
    (c.gecikti ? '<span><b>' + c.gecikti + '</b> gecikti</span>' : '') +
    (c.kismi ? '<span><b>' + c.kismi + '</b> kısmi</span>' : '') +
    '<span><b>' + c.bekliyor + '</b> bekliyor</span>' +
    (c.yok ? '<span><b>' + c.yok + '</b> boş</span>' : '') +
    (c.tanimsiz ? '<span><b>' + c.tanimsiz + '</b> kira girilmemiş</span>' : '') + '</div>' +
    '</section>';

  h += '<section class="card"><div class="card-head"><h2 class="card-title">Ödemesi geciken</h2>' +
    (geciken.length ? '<span class="amt bad">' + TL(geciken.reduce(function (t, x) { return t + x.toplam; }, 0)) + '</span>' : '') + '</div>';
  if (!geciken.length) h += '<p class="empty">Ödemesi geciken daire yok.</p>';
  else {
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

  h += '<section class="card"><h2 class="card-title">Önümüzdeki 7 gün</h2>';
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

  var sz = sezonu(gun0), sez = komurSezonBul(sz);
  if (sez) {
    var kb = 0, ko = 0, kGec = 0, kBorclu = 0;
    DB.daireler.forEach(function (d) {
      var k = komurDurum(d, sez); if (!k) return;
      kb += k.beklenen; ko += Math.min(k.odenen, k.beklenen);
      if (k.kalan > 0) kBorclu++; if (k.kod === 'gecikti') kGec++;
    });
    var ky = kb ? Math.min(100, Math.round(ko / kb * 100)) : 0;
    h += '<section class="card"><div class="card-head"><h2 class="card-title">Kömür ' + esc(sz) + '</h2>' +
      '<button type="button" class="link" data-act="sekme" data-tab="komur">Ayrıntı</button></div>' +
      '<div class="big">' + TL(ko) + ' <small>/ ' + TL(kb) + '</small></div>' +
      '<div class="bar"><i style="width:' + ky + '%"></i></div>' +
      '<div class="counts"><span><b>' + kBorclu + '</b> dairenin kömür borcu var</span>' + (kGec ? '<span><b>' + kGec + '</b> gecikti</span>' : '') + '</div></section>';
  }
  return h;
}

function daireSatiri(d, ay) {
  var k = kiraDurum(d, ay), durum;
  if (k.kod === 'yok') durum = chip('yok');
  else if (k.kod === 'tanimsiz') durum = chip('tanimsiz');
  else durum = chip(k.kod) + ' <span class="amt' + (k.kod === 'gecikti' ? ' bad' : '') + '">' + TL(k.kalan > 0 ? k.kalan : k.beklenen) + '</span>';
  var hizli = (k.kod === 'bekliyor' || k.kod === 'gecikti' || k.kod === 'kismi') && k.kalan > 0
    ? '<button type="button" class="paid-btn" data-act="hizli-odendi" data-id="' + d.id + '" aria-label="Daire ' + esc(d.no) + ' ' + esc(ayAdi(ay)) + ' kirası ödendi">✓</button>' : '';
  return satirSar(d, '<button type="button" class="row" data-act="daire-ac" data-id="' + d.id + '">' +
    '<span class="no">' + esc(d.no) + '</span>' +
    '<span class="row-main"><span class="row-title">' + esc(d.bos ? 'Boş' : (d.kiraci || 'Kiracı girilmemiş')) + '</span>' +
    '<span class="row-sub row-status">' + durum + '</span></span></button>' + hizli);
}
function daireFiltreli() {
  var ay = S.ay, q = S.arama.trim().toLocaleLowerCase('tr');
  return daireler().filter(function (d) {
    var k = kiraDurum(d, ay);
    if (S.filtre === 'odemeyen' && !(k.kod === 'gecikti' || k.kod === 'bekliyor' || k.kod === 'kismi')) return false;
    if (S.filtre === 'odeyen' && k.kod !== 'odendi') return false;
    if (S.filtre === 'bos' && k.kod !== 'yok') return false;
    if (q) {
      var metin = (d.no + ' ' + (d.kiraci || '') + ' ' + (d.telefon || '') + ' ' + (d.elkAbone || '') + ' ' + (d.elkTesisat || '') + ' ' + (d.telefon2 || '') + ' ' + (d.kefilAd || '') + ' ' + (d.eskiKiracilar || []).map(function (k) { return k.ad; }).join(' ')).toLocaleLowerCase('tr');
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
    if (k.kod === 'yok') say.bos++;
  });
  var f = [['hepsi', 'Hepsi'], ['odemeyen', 'Ödemeyen'], ['odeyen', 'Ödeyen'], ['bos', 'Boş']];
  return '<div class="filters">' + f.map(function (x) {
    return '<button type="button" class="filter' + (S.filtre === x[0] ? ' on' : '') + '" data-act="filtre" data-v="' + x[0] + '">' + x[1] + ' <b>' + say[x[0]] + '</b></button>';
  }).join('') + '</div>' +
    '<input id="arama" type="search" placeholder="Daire no, kiracı, telefon veya abone no ara" value="' + esc(S.arama) + '" aria-label="Ara">' +
    '<p class="note">Kirası tam ödenen dairede yeşil ✓ işaretine dokunun; ' + esc(ayAdi(S.ay)) + ' kirası bugünün tarihiyle kaydedilir.</p>' +
    '<section class="card"><div class="list" id="daire-listesi">' + daireListesiHtml() + '</div></section>' +
    '<div class="actions"><button type="button" class="btn ghost" data-act="abonelikler">Elektrik abonelikleri</button>' +
    '<button type="button" class="btn ghost" data-act="daire-yeni">+ Daire ekle</button></div>';
}

function vKomur() {
  var sez = komurSezonBul(S.sezon), h = '';
  h += '<section class="card"><div class="card-head"><h2 class="card-title">' + esc(S.sezon) + ' sezonu</h2>' +
    '<button type="button" class="link" data-act="komur-ayar">' + (sez ? 'Fiyatı düzenle' : 'Sezonu başlat') + '</button></div>';
  if (!sez) {
    h += '<p class="empty">Bu sezon için kömür fiyatı girilmemiş. “Sezonu başlat” ile ton fiyatını girin, sonra her daireye kaç kilo yazıldığını ekleyin.</p></section>';
    return h;
  }
  var bek = 0, od = 0, kg = 0, borclu = 0;
  DB.daireler.forEach(function (d) {
    var k = komurDurum(d, sez); if (!k) return;
    bek += k.beklenen; od += Math.min(k.odenen, k.beklenen); kg += k.kg; if (k.kalan > 0) borclu++;
  });
  h += '<dl class="kv"><dt>Ton fiyatı</dt><dd>' + TL(sez.tonFiyati) + '</dd>' +
    '<dt>Toplam yazılan</dt><dd>' + kgMetni(kg) + '</dd>' +
    '<dt>Toplanan</dt><dd>' + TL(od) + ' / ' + TL(bek) + '</dd>' +
    '<dt>Kalan</dt><dd style="color:' + (bek - od > 0 ? 'var(--bad)' : 'var(--ok)') + '">' + TL(Math.max(0, bek - od)) + '</dd>' +
    (sez.sonOdeme ? '<dt>Son ödeme</dt><dd>' + esc(tarihAdi(sez.sonOdeme)) + '</dd>' : '') +
    '</dl>' + (borclu ? '<p class="note">' + borclu + ' dairenin kömür borcu var.</p>' : '') + '</section>';

  h += '<section class="card"><div class="card-head"><h2 class="card-title">Daireler</h2></div>' +
    '<p class="note">Daireye dokunarak kilo girin veya değiştirin. Ödeme almak için yanındaki yeşil düğmeye basın.</p><div class="list">';
  daireler().forEach(function (d) {
    var k = komurDurum(d, sez);
    var alt, durum;
    if (!k) { alt = 'Kömür yazılmamış'; durum = '<span class="row-sub">–</span>'; }
    else {
      alt = (k.kg ? kgMetni(k.kg) + ' · ' : '') + TL(k.odenen) + ' / ' + TL(k.beklenen);
      durum = chip(k.kod) + (k.kalan > 0 ? ' <span class="amt' + (k.kod === 'gecikti' ? ' bad' : '') + '">' + TL(k.kalan) + '</span>' : '');
    }
    var ode = k && k.kalan > 0 ? '<button type="button" class="paid-btn" data-act="komur-ode" data-id="' + d.id + '" aria-label="Daire ' + esc(d.no) + ' kömür ödemesi gir">₺</button>' : '';
    h += satirSar(d, '<button type="button" class="row" data-act="komur-kg" data-id="' + d.id + '">' +
      '<span class="no">' + esc(d.no) + '</span>' +
      '<span class="row-main"><span class="row-title">' + esc(d.bos ? 'Boş' : (d.kiraci || 'Kiracı girilmemiş')) + '</span>' +
      '<span class="row-sub">' + esc(alt) + '</span>' +
      '<span class="row-sub row-status">' + durum + '</span></span></button>' + ode);
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
        '<div class="field"><label for="ks-son">Son ödeme günü (isteğe bağlı)</label><input id="ks-son" type="date" value="' + esc(x.sonOdeme || '') + '"></div>' +
        '<p class="note">Son ödeme günü girilirse, borcu kalan daireler için o güne göre hatırlatma gelir.</p>' +
        '<button type="button" class="btn block" data-act="komur-ayar-kaydet">Kaydet</button></div>';
    },
    hazir: function () {
      var ornek = function () {
        var f = sayi($('#ks-fiyat').value), y = +$('#ks-yuv').value;
        $('#ks-ornek').textContent = f ? 'Örnek: 1800 kg → ' + TL(yuvarla(1.8 * f, y)) : '';
      };
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
  sez.tonFiyati = f; sez.yuvarla = +$('#ks-yuv').value; sez.sonOdeme = $('#ks-son').value || '';
  kaydet(); sayfaKapat(); yenile(); toast('Kömür fiyatı kaydedildi');
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

function odemeSatiri(o, daireGoster) {
  var d = daireBul(o.daireId), donem = '';
  if (o.tur === 'kira' && o.donem) donem = ayAdi(o.donem);
  else if (o.tur === 'komur') donem = /^\d{4}-\d{4}$/.test(o.donem || '') ? o.donem + ' sezonu' : 'Kömür';
  else donem = o.aciklama || 'Diğer';
  var baslik = daireGoster ? daireAdi(d) + (d && d.kiraci ? ' · ' + d.kiraci : '') : TUR[o.tur] + ' · ' + donem;
  var alt = daireGoster ? TUR[o.tur] + ' · ' + donem : tarihAdi(o.tarih);
  alt += o.sekil ? ' · ' + o.sekil : '';
  return '<button type="button" class="row" data-act="odeme-duzenle" data-id="' + o.id + '">' +
    (daireGoster ? '<span class="no">' + esc(d ? d.no : '?') + '</span>' : '') +
    '<span class="row-main"><span class="row-title">' + esc(baslik) + '</span>' +
    '<span class="row-sub">' + esc(alt) + (o.not ? ' · ' + esc(o.not) : '') + '</span></span>' +
    '<span class="row-end"><span class="amt">' + TL(o.tutar) + '</span></span></button>';
}
function vGecmis() {
  var l = DB.odemeler.filter(function (o) {
    if (S.gTur !== 'hepsi' && o.tur !== S.gTur) return false;
    if (S.gDaire && o.daireId !== S.gDaire) return false;
    return true;
  }).sort(function (a, b) { return (b.tarih + b.kayit) < (a.tarih + a.kayit) ? -1 : 1; });
  var toplam = l.reduce(function (t, o) { return t + (+o.tutar || 0); }, 0);
  var h = '<div class="grid2">' +
    '<div class="field"><label for="g-tur">Tür</label><select id="g-tur" data-change="g-tur">' +
    [['hepsi', 'Hepsi'], ['kira', 'Kira'], ['komur', 'Kömür'], ['diger', 'Diğer']].map(function (x) {
      return '<option value="' + x[0] + '"' + (S.gTur === x[0] ? ' selected' : '') + '>' + x[1] + '</option>';
    }).join('') + '</select></div>' +
    '<div class="field"><label for="g-daire">Daire</label><select id="g-daire" data-change="g-daire"><option value="">Hepsi</option>' +
    daireler().map(function (d) {
      return '<option value="' + d.id + '"' + (S.gDaire === d.id ? ' selected' : '') + '>Daire ' + esc(d.no) + (d.kiraci ? ' · ' + esc(d.kiraci) : '') + '</option>';
    }).join('') + '</select></div></div>';
  h += '<section class="card"><div class="card-head"><h2 class="card-title">' + l.length + ' ödeme</h2><span class="amt">' + TL(toplam) + '</span></div>';
  if (!l.length) h += '<p class="empty">Henüz ödeme girilmemiş. Sağ alttaki “Ödeme Gir” ile ilk ödemeyi ekleyebilirsiniz.</p>';
  else {
    h += '<div class="list">';
    var son = '';
    l.slice(0, 400).forEach(function (o) {
      if (o.tarih !== son) { h += '<div class="date-head">' + esc(tarihAdi(o.tarih)) + '</div>'; son = o.tarih; }
      h += odemeSatiri(o, true);
    });
    h += '</div>';
    if (l.length > 400) h += '<p class="note">Son 400 ödeme gösteriliyor. Daha eskileri için daire veya tür seçin.</p>';
  }
  return h + '</section>';
}

function vAyarlar() {
  var A = DB.ayarlar, izin = BR && BR.notificationsAllowed ? BR.notificationsAllowed() : true;
  var secenek = [[0, 'Ödeme günü'], [1, '1 gün önce'], [3, '3 gün önce'], [7, '7 gün önce'], [15, '15 gün önce']];
  var h = '<section class="card"><h2 class="card-title">Bildirimler</h2>';
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
    [['0', 'Hatırlatma yapma'], ['1', 'Her gün (ödenene kadar)'], ['3', '3 günde bir'], ['7', 'Haftada bir (pazartesi)']].map(function (o) {
      var sec = A.gecikme ? String(+A.gecikmeSiklik || 1) : '0';
      return '<option value="' + o[0] + '"' + (sec === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('') + '</select></div>' +
    '<div class="field"><label for="a-saat">Bildirim saati</label><select id="a-saat" data-change="a-saat">';
  for (var s = 7; s <= 21; s++) h += '<option value="' + s + '"' + (+A.saat === s ? ' selected' : '') + '>' + pad(s) + ':00</option>';
  h += '</select></div>' +
    '<button type="button" class="btn ghost block" data-act="bildirim-dene">Deneme bildirimi gönder</button>';
  var yak = hatirlatmaListesi().slice(0, 3);
  if (yak.length) {
    h += '<p class="note">Sıradaki bildirimler: ' + yak.map(function (x) { return esc(tarihAdi(x.tarih, false)) + ' – ' + esc(x.baslik); }).join('; ') + '</p>';
  }
  h += '</section>';

  h += '<section class="card"><h2 class="card-title">Yedek</h2>' +
    '<p class="note">Kayıtlar sadece bu telefonda durur. Telefon kaybolursa ya da değişirse kayıtlar gider. Ayda bir yedek alıp Google Drive\'a kaydetmeniz önerilir.</p>' +
    (DB.sonYedek ? '<p class="note">Son yedek: ' + esc(tarihAdi(DB.sonYedek)) + '</p>' : '<p class="note warn">Henüz yedek alınmadı.</p>') +
    '<div class="actions"><button type="button" class="btn" data-act="yedek-al">Yedek al</button>' +
    '<button type="button" class="btn ghost" data-act="yedek-yukle">Yedekten yükle</button></div>' +
    '<button type="button" class="btn ghost block" data-act="csv">Excel için ödemeleri dışa aktar</button></section>';

  var surum = BR && BR.versionName ? BR.versionName() : 'tarayıcı';
  h += '<section class="card"><h2 class="card-title">Uygulama</h2>' +
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
  return '<div class="row-wrap">' + satirHtml + (d && !d.bos && d.telefon ? araDugmesi(d.telefon, d.kiraci) : '') + '</div>';
}
/* Değeri gösteren satır: yanında kopyala düğmesi, değere basılı tutunca da kopyalar; telefonsa arama düğmesi de */
function kopyaSatiri(ad, deger, telefon) {
  return '<dt>' + esc(ad) + '</dt><dd class="kopya-dd"><span class="kopya" data-kopya="' + esc(deger) + '" data-ad="' + esc(ad) + '">' + esc(deger) + '</span>' +
    '<button type="button" class="kopya-btn" data-act="kopyala" data-v="' + esc(deger) + '" data-ad="' + esc(ad) + '" aria-label="' + esc(ad) + ' kopyala">' + KOPYA_IKON + '</button>' + (telefon ? araDugmesi(deger, ad) : '') + '</dd>';
}
var KOPYA_IKON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>';

function abonelikSayfasi() {
  sayfaAc({
    baslik: function () { return 'Elektrik abonelikleri'; },
    ciz: function () {
      var l = daireler(), eksik = 0;
      var h = '<p class="note">Numaranın yanındaki düğmeye dokunarak ya da numaraya basılı tutarak kopyalayabilirsiniz.</p>' +
        '<section class="card"><div class="list">';
      l.forEach(function (d) {
        if (!d.elkAbone && !d.elkTesisat) eksik++;
        h += '<div class="row abone-row">' +
          '<button type="button" class="no" data-act="daire-ac" data-id="' + d.id + '">' + esc(d.no) + '</button>' +
          '<span class="row-main"><span class="row-title">' + esc(d.bos ? 'Boş' : (d.kiraci || 'Kiracı girilmemiş')) + '</span>' +
          aboneSatiri('Abone', 'Elektrik abone no', d.elkAbone) + aboneSatiri('Tesisat', 'Elektrik tesisat no', d.elkTesisat) +
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
      var h = '<section class="card">' +
        '<h2 class="card-title">' + (d.bos ? 'Daire boş' : 'Kiracı') + '</h2>' +
        (d.bos ? '<p class="note">Şu an kiracı yok. Yeni kiracı geldiğinde “Yeni kiracı” ile bilgilerini girin.</p>' :
          '<div class="tenant-head"><div class="row-title" style="font-size:20px">' + esc(d.kiraci || 'Kiracı adı girilmemiş') + '</div>' + araDugmesi(d.telefon, d.kiraci) + '</div>' +
          '<dl class="kv">' +
          (d.telefon ? kopyaSatiri('Telefon', d.telefon, true) : '') +
          (d.telefon2 ? kopyaSatiri('Yakını / 2. telefon', d.telefon2, true) : '') +
          (d.tc ? kopyaSatiri('TC kimlik no', d.tc) : '') +
          '<dt>Giriş</dt><dd>' + esc(ayAdi(baslangicAyi(d))) + '</dd>' +
          (d.sozlesmeBas ? '<dt>Sözleşme başlangıcı</dt><dd>' + esc(tarihAdi(d.sozlesmeBas)) + '</dd>' : '') +
          (d.sozlesmeBit ? '<dt>Sözleşme bitişi</dt><dd' + (sozKalan !== null && sozKalan <= 30 ? ' style="color:var(--bad)"' : '') + '>' + esc(tarihAdi(d.sozlesmeBit)) +
            (sozKalan !== null && sozKalan >= 0 && sozKalan <= 60 ? ' (' + kalanGunMetni(sozKalan) + ')' : '') + '</dd>' : '') +
          '<dt>Depozito</dt><dd>' + (d.depozito ? TL(d.depozito) : 'Tutar girilmemiş') + '</dd>' +
          (d.kefilAd ? '<dt>Kefil</dt><dd>' + esc(d.kefilAd) + '</dd>' : '') +
          (d.kefilTel ? kopyaSatiri('Kefil telefonu', d.kefilTel, true) : '') +
          '</dl>' + (d.kiraciNot ? '<p class="note">' + esc(d.kiraciNot) + '</p>' : '')) +
        '<div class="actions">' +
        (!d.bos ? '<button type="button" class="btn" data-act="odeme-daire" data-id="' + d.id + '">Ödeme gir</button>' : '') +
        (d.bos ? '<button type="button" class="btn" data-act="kiraci-yeni" data-id="' + d.id + '">Yeni kiracı</button>' : '') +
        '<button type="button" class="btn ghost" data-act="daire-duzenle" data-id="' + d.id + '">Düzenle</button>' +
        (!d.bos ? '<button type="button" class="btn ghost" data-act="kiraci-cikis" data-id="' + d.id + '">Kiracı çıktı</button>' : '') +
        '<button type="button" class="btn ghost" data-act="toplu-ac" data-id="' + d.id + '">Geçmişi toplu gir</button>' +
        '</div></section>' +
        '<section class="card"><h2 class="card-title">Daire</h2><dl class="kv">' +
        '<dt>Aylık kira</dt><dd>' + TL(d.kira) + '</dd>' +
        '<dt>Ödeme günü</dt><dd>Ayın ' + (parseInt(d.odemeGunu, 10) || 1) + "'i</dd>" +
        '<dt>Toplam borç</dt><dd style="color:' + (borcTop ? 'var(--bad)' : 'var(--ok)') + '">' + (borcTop ? TL(borcTop) : 'Yok') + '</dd>' +
        (d.elkAbone ? kopyaSatiri('Elektrik abone no', d.elkAbone) : '') +
        (d.elkTesisat ? kopyaSatiri('Elektrik tesisat no', d.elkTesisat) : '') +
        '</dl>' + (d.not ? '<p class="note">' + esc(d.not) + '</p>' : '') + '</section>';

      var cur = buAy(), hucreler = '';
      for (var i = -10; i <= 1; i++) {
        var ym = ayEkle(cur, i), k = kiraDurum(d, ym);
        var alt = k.kod === 'yok' ? '–' : (k.kod === 'odendi' ? '✓' : (k.kod === 'tanimsiz' ? '–' : TL(k.kalan)));
        hucreler += '<button type="button" class="mcell ' + k.kod + (ym === cur ? ' simdi' : '') + '" data-act="ay-hucre" data-id="' + d.id + '" data-ym="' + ym + '"' +
          (k.kod === 'yok' ? ' disabled' : '') + ' aria-label="' + esc(ayAdi(ym) + ': ' + DURUM[k.kod]) + '">' +
          '<b>' + AYK[+ym.slice(5) - 1] + '</b>' + esc(alt) + '</button>';
      }
      h += '<section class="card"><h2 class="card-title">Son 12 ay kira</h2><div class="months">' + hucreler + '</div>' +
        '<p class="note">Ödenmemiş bir aya dokunarak o ayın ödemesini girebilirsiniz.</p></section>';

      var kSez = komurSezonBul(sezonu(bugun())), kk = komurDurum(d, kSez);
      if (kk) {
        h += '<section class="card"><div class="card-head"><h2 class="card-title">Kömür ' + esc(kSez.sezon) + '</h2>' + chip(kk.kod) + '</div><dl class="kv">' +
          (kk.kg ? '<dt>Yazılan</dt><dd>' + kgMetni(kk.kg) + '</dd>' : '') +
          '<dt>Borç</dt><dd>' + TL(kk.beklenen) + '</dd><dt>Ödenen</dt><dd>' + TL(kk.odenen) + '</dd>' +
          '<dt>Kalan</dt><dd style="color:' + (kk.kalan > 0 ? 'var(--bad)' : 'var(--ok)') + '">' + TL(kk.kalan) + '</dd></dl>' +
          (kk.kalan > 0 ? '<button type="button" class="btn ghost block" data-act="komur-ode" data-id="' + d.id + '">Kömür ödemesi gir</button>' : '') + '</section>';
      }

      var od = DB.odemeler.filter(function (o) { return o.daireId === d.id; })
        .sort(function (a, b) { return (b.tarih + b.kayit) < (a.tarih + a.kayit) ? -1 : 1; });
      h += '<section class="card"><h2 class="card-title">Ödeme geçmişi</h2>';
      if (!od.length) h += '<p class="empty">Bu daire için henüz ödeme girilmemiş.</p>';
      else h += '<div class="list">' + od.slice(0, 60).map(function (o) { return odemeSatiri(o, false); }).join('') + '</div>';
      h += '</section>';
      var eski = (d.eskiKiracilar || []).slice().reverse();
      if (eski.length) {
        h += '<section class="card"><h2 class="card-title">Eski kiracılar</h2><div class="list">';
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
        '<label class="check"><input id="d-bos" type="checkbox"' + (x.bos ? ' checked' : '') + '> Daire şu an boş</label>' +
        '<div id="kiraci-alanlari" class="form">' +
        alan('d-kiraci', 'Ad soyad', x.kiraci, ' autocomplete="off"') +
        '<div class="grid2">' + alan('d-tel', 'Telefon', x.telefon, ' type="tel"') + alan('d-tel2', 'Yakını / 2. telefon', x.telefon2, ' type="tel"') + '</div>' +
        alan('d-tc', 'TC kimlik no', x.tc, ' inputmode="numeric" maxlength="11"') +
        '<div class="grid2">' + alan('d-bas', 'Giriş ayı (kira bu aydan itibaren)', yeniKiraci ? buAy() : (x.baslangic || ''), ' type="month"') +
        alan('d-depozito', 'Depozito (₺)', x.depozito || '', ' inputmode="decimal" placeholder="Bilinmiyorsa boş bırakın"') + '</div>' +
        '<div class="grid2">' + alan('d-sozbas', 'Sözleşme başlangıcı', x.sozlesmeBas, ' type="date"') + alan('d-sozbit', 'Sözleşme bitişi', x.sozlesmeBit, ' type="date"') + '</div>' +
        '<p class="note">Sözleşme bitişinden 30 gün ve 7 gün önce bildirim gelir.</p>' +
        '<div class="grid2">' + alan('d-kefil', 'Kefil adı', x.kefilAd) + alan('d-kefiltel', 'Kefil telefonu', x.kefilTel, ' type="tel"') + '</div>' +
        '<div class="field"><label for="d-kiracinot">Kiracı notu</label><textarea id="d-kiracinot">' + esc(x.kiraciNot || '') + '</textarea></div>' +
        '</div>' +
        '<h3 class="section-title">Daire</h3>' +
        '<div class="grid2">' + alan('d-no', 'Daire no', x.no, ' placeholder="Örn. 12"') +
        alan('d-gun', 'Kira ödeme günü', x.odemeGunu || 1, ' type="number" inputmode="numeric" min="1" max="31"') + '</div>' +
        alan('d-kira', 'Aylık kira (₺)', x.kira || '', ' inputmode="decimal"') +
        '<div class="grid2">' + alan('d-abone', 'Elektrik abone no', x.elkAbone, ' inputmode="numeric"') + alan('d-tesisat', 'Elektrik tesisat no', x.elkTesisat, ' inputmode="numeric"') + '</div>' +
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
  var tc = $('#d-tc').value.replace(/\s/g, '');
  if (tc && !/^\d{11}$/.test(tc)) { toast('TC kimlik no 11 haneli olmalı'); return; }
  var sozBas = $('#d-sozbas').value, sozBit = $('#d-sozbit').value;
  if (sozBas && sozBit && sozBit < sozBas) { toast('Sözleşme bitişi başlangıçtan önce olamaz'); return; }
  var mevcut = id ? daireBul(id) : null, bos = $('#d-bos').checked;
  var veri = {
    no: no, odemeGunu: Math.min(31, Math.max(1, parseInt($('#d-gun').value, 10) || 1)), kira: sayi($('#d-kira').value),
    elkAbone: $('#d-abone').value.trim(), elkTesisat: $('#d-tesisat').value.trim(), not: $('#d-not').value.trim(), bos: bos
  };
  var kiraciVeri = {
    kiraci: $('#d-kiraci').value.trim(), telefon: $('#d-tel').value.trim(), telefon2: $('#d-tel2').value.trim(), tc: tc,
    baslangic: $('#d-bas').value || '', depozito: sayi($('#d-depozito').value), sozlesmeBas: sozBas, sozlesmeBit: sozBit,
    kefilAd: $('#d-kefil').value.trim(), kefilTel: $('#d-kefiltel').value.trim(), kiraciNot: $('#d-kiracinot').value.trim()
  };
  if (!bos) {
    var eski = (mevcut && mevcut.eskiKiracilar) || [];
    if (!kiraciVeri.baslangic && eski.length) kiraciVeri.baslangic = buAy();
    var sonCikis = eski.length ? eski[eski.length - 1].cikis : '';
    if (sonCikis && kiraciVeri.baslangic && kiraciVeri.baslangic <= sonCikis) { toast('Giriş ayı, önceki kiracının çıkış ayından sonra olmalı'); return; }
    Object.assign(veri, kiraciVeri);
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
    if (k.kalan > 0) l.push({ ym: ym, tutar: k.kalan, vade: k.vade });
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
      return '<section class="card"><p class="note">Seçtiğiniz aylar arasında kirası tam ödenmiş sayılacak aylar tek seferde kaydedilir. ' +
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
    DB.odemeler.push({ id: yeniId(), kayit: simdi, toplu: tid, daireId: d.id, tur: 'kira', donem: x.ym, tutar: x.tutar,
      tarih: x.vade > gun0 ? gun0 : x.vade, sekil: S.topluSekil || 'Nakit', aciklama: '', not: 'Toplu giriş' });
  });
  kaydet(); sayfaKapat(); yenile();
  toast(l.length + ' ayın kirası kaydedildi', function () {
    DB.odemeler = DB.odemeler.filter(function (o) { return o.toplu !== tid; });
    kaydet(); yenile(); toast('Toplu giriş geri alındı');
  });
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
  ['kiraci', 'telefon', 'telefon2', 'tc', 'baslangic', 'sozlesmeBas', 'sozlesmeBit', 'kefilAd', 'kefilTel', 'kiraciNot'].forEach(function (k) { d[k] = ''; });
  d.depozito = 0; d.bos = true;
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
function bildirimKartiHtml(x, zamanMetni) {
  var satirlar = String(x.metin || '').split('\n');
  var ust = satirlar.shift();
  var ids = x.daireler || [];
  return '<section class="card notif">' +
    '<div class="notif-time">' + esc(zamanMetni) + '</div>' +
    '<div class="row-title">' + esc(x.baslik) + '</div>' +
    '<p class="note">' + esc(ust) + '</p>' +
    (satirlar.length ? '<ul class="notif-lines">' + satirlar.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' : '') +
    (ids.length ? '<div class="daychips">' + ids.map(function (id) {
      var d = daireBul(id); if (!d) return '';
      return '<button type="button" class="filter" data-act="daire-ac" data-id="' + d.id + '">Daire ' + esc(d.no) + '</button>' +
        (d.telefon && !d.bos ? araDugmesi(d.telefon, d.kiraci) : '');
    }).join('') + '</div>' : '') +
    '</section>';
}
function bildirimListesiHtml() {
  var q = (S.bAra || '').trim().toLocaleLowerCase('tr');
  var uyar = function (x) { return !q || (x.baslik + ' ' + x.metin).toLocaleLowerCase('tr').indexOf(q) >= 0; };
  if (S.bSekme === 'yaklasan') {
    var y = hatirlatmaListesi().filter(uyar).slice(0, 60);
    if (!y.length) return '<p class="empty">Önümüzdeki 90 gün için planlanmış bildirim yok.</p>';
    return y.map(function (x) { return bildirimKartiHtml(x, tarihAdi(x.tarih) + ', ' + pad(DB.ayarlar.saat) + ':00'); }).join('');
  }
  var l = bildirimKaydi().filter(uyar);
  if (!l.length) return '<p class="empty">' + (q ? 'Aramaya uyan bildirim yok.' : 'Henüz gönderilmiş bildirim yok. Gelen her bildirim burada saklanır.') + '</p>';
  return l.map(function (x) {
    var z = x.zaman || '';
    return bildirimKartiHtml(x, tarihAdi(z.slice(0, 10)) + (z.length > 11 ? ', ' + z.slice(11, 16) : ''));
  }).join('');
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
        '<input id="b-ara" type="search" placeholder="Bildirimlerde ara (daire no, isim, ay)" aria-label="Bildirimlerde ara">' +
        '<div id="b-liste" class="stack">' + bildirimListesiHtml() + '</div>';
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
  var ay = (b.tur === 'kira' && b.donem) || on.ay || (daireId && daireBul(daireId) ? ilkOdenmemisAy(daireBul(daireId)) : buAy());
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
        ['kira', 'komur', 'diger'].map(function (t) {
          return '<button type="button" data-act="o-tur" data-v="' + t + '" class="' + (FORM.tur === t ? 'on' : '') + '">' + TUR[t] + '</button>';
        }).join('') + '</div></div>' +
        '<div class="field" id="f-ay"><label for="o-ay">Hangi ayın kirası?</label><input id="o-ay" type="month" value="' + esc(ay) + '"></div>' +
        '<div class="field" id="f-taksit"><label for="o-taksit">Hangi sezonun kömürü?</label><select id="o-taksit">' +
        sezonlar.map(function (z) { return '<option value="' + z + '"' + (z === sezonSec ? ' selected' : '') + '>' + z + '</option>'; }).join('') + '</select></div>' +
        '<div class="field" id="f-aciklama"><label for="o-aciklama">Açıklama</label><input id="o-aciklama" value="' + esc(b.aciklama || '') + '" placeholder="Örn. aidat, tamir"></div>' +
        '<div class="grid2"><div class="field"><label for="o-tutar">Tutar (₺)</label><input id="o-tutar" inputmode="decimal" value="' + esc(b.tutar || '') + '"></div>' +
        '<div class="field"><label for="o-tarih">Ödeme tarihi</label><input id="o-tarih" type="date" value="' + esc(b.tarih || bugun()) + '"></div></div>' +
        '<p class="note" id="o-ipucu"></p>' +
        '<div class="field"><span class="lbl">Nasıl ödendi?</span><div class="seg" id="o-sekil">' +
        ['Nakit', 'Banka'].map(function (s) {
          return '<button type="button" data-act="o-sekil" data-v="' + s + '" class="' + (FORM.sekil === s ? 'on' : '') + '">' + s + '</button>';
        }).join('') + '</div></div>' +
        '<div class="field"><label for="o-not">Not</label><input id="o-not" value="' + esc(b.not || '') + '"></div>' +
        '<button type="button" class="btn block" data-act="odeme-kaydet">Kaydet</button>' +
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
  $('#f-ay').hidden = FORM.tur !== 'kira';
  $('#f-taksit').hidden = FORM.tur !== 'komur';
  $('#f-aciklama').hidden = FORM.tur !== 'diger';
}
function tutarOner() {
  var d = daireBul($('#o-daire').value), ipucu = $('#o-ipucu'), kalan = null, metin = '';
  if (d && FORM.tur === 'kira') {
    var ym = $('#o-ay').value;
    if (ym) {
      var k = kiraDurum(d, ym);
      if (k.kod === 'yok') metin = 'Bu daire o ay boş görünüyor.';
      else if (k.beklenen) { kalan = k.kalan; metin = ayAdi(ym) + ': ' + TL(k.odenen) + ' ödendi, ' + TL(k.kalan) + ' kaldı.'; }
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
  if (FORM.tur === 'kira') { donem = $('#o-ay').value; if (!donem) { toast('Hangi ayın kirası olduğunu seçin'); return; } }
  if (FORM.tur === 'komur') {
    var sel = $('#o-taksit'); donem = sel ? sel.value : '';
    if (!donem) { toast('Sezonu seçin'); return; }
  }
  var veri = {
    daireId: did, tur: FORM.tur, donem: donem, tutar: tutar, tarih: tarih, sekil: FORM.sekil,
    aciklama: FORM.tur === 'diger' ? $('#o-aciklama').value.trim() : '', not: $('#o-not').value.trim()
  };
  if (FORM.id) {
    var o = DB.odemeler.filter(function (x) { return x.id === FORM.id; })[0];
    if (o) Object.assign(o, veri);
  } else {
    DB.odemeler.push(Object.assign({ id: yeniId(), kayit: new Date().toISOString() }, veri));
  }
  kaydet(); sayfaKapat(); yenile();
  toast(FORM.id ? 'Ödeme güncellendi' : 'Ödeme kaydedildi');
}

/* ---------- Yedek, dışa aktarma, güncelleme ---------- */
function dosyaKaydet(icerik, ad, tur) {
  if (BR && BR.exportData) { BR.exportData(icerik, ad, tur); return; }
  toast('Dosya kaydetme sadece telefonda çalışır');
}
function yedekAl() {
  S.bekleyenYedek = true;
  dosyaKaydet(JSON.stringify(DB, null, 1), 'elif-apartmani-yedek-' + bugun() + '.json', 'application/json');
}
W.onExportDone = function (ok) {
  if (ok && S.bekleyenYedek) { DB.sonYedek = bugun(); kaydet(); }
  S.bekleyenYedek = false;
  toast(ok ? 'Dosya kaydedildi' : 'Dosya kaydedilmedi');
  yenile();
};
W.onImport = function (text) {
  var o;
  try { o = JSON.parse(text); } catch (e) { o = null; }
  if (!o || !Array.isArray(o.daireler)) { toast('Bu dosya bir Elif Apartmanı yedeği değil'); return; }
  onayla('Şu anki kayıtların yerine bu yedek yüklenecek: ' + o.daireler.length + ' daire, ' + (o.odemeler || []).length + ' ödeme. Şu anki kayıtlar silinir.',
    'Yedeği yükle', function () { DB = normalize(o); kaydet(); YIGIN = []; sayfaCiz(); ciz(); toast('Yedek yüklendi'); });
};
function csvAktar() {
  function hucre(v) { var s = String(v == null ? '' : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  var satirlar = [['Ödeme tarihi', 'Daire', 'Kiracı', 'Tür', 'Dönem', 'Tutar', 'Ödeme şekli', 'Not']];
  DB.odemeler.slice().sort(function (a, b) { return a.tarih < b.tarih ? -1 : 1; }).forEach(function (o) {
    var d = daireBul(o.daireId), donem = '';
    if (o.tur === 'kira') donem = o.donem ? ayAdi(o.donem) : '';
    else if (o.tur === 'komur') donem = (o.donem || '') + ' kömür';
    else donem = o.aciklama || '';
    satirlar.push([o.tarih, d ? d.no : '', d ? d.kiraci : '', TUR[o.tur], donem, String(o.tutar).replace('.', ','), o.sekil || '', o.not || '']);
  });
  dosyaKaydet('﻿' + satirlar.map(function (r) { return r.map(hucre).join(';'); }).join('\r\n'), 'elif-apartmani-odemeler-' + bugun() + '.csv', 'text/csv');
}
function guncellemeKontrol(elle) {
  S.elleKontrol = !!elle;
  if (BR && BR.checkUpdate) BR.checkUpdate();
  else if (elle) toast('Güncelleme kontrolü sadece telefonda çalışır');
}
W.onUpdateInfo = function (body) {
  var info = null;
  try { info = body ? JSON.parse(body) : null; } catch (e) { info = null; }
  var mevcut = BR && BR.versionCode ? BR.versionCode() : 0;
  var n = info && info.tag_name ? parseInt(String(info.tag_name).replace(/\D/g, ''), 10) : 0;
  if (n && n > mevcut) {
    var url = APK_URL;
    (info.assets || []).forEach(function (a) { if (/\.apk$/i.test(a.name)) url = a.browser_download_url; });
    S.guncelleme = { surum: '1.0.' + n, notlar: info.body || '', url: url };
  } else {
    S.guncelleme = null;
    if (S.elleKontrol) toast(info ? 'Uygulama güncel' : 'İnternete bağlanılamadı');
  }
  S.elleKontrol = false;
  guncellemeBandi();
};
function guncellemeBandi() {
  var el = $('#update-banner'), g = S.guncelleme;
  if (!g) { el.hidden = true; return; }
  el.innerHTML = '<div><b>Yeni sürüm hazır (' + esc(g.surum) + ')</b>' + (g.notlar ? '<br>' + esc(g.notlar.split('\n')[0]) : '') + '</div>' +
    '<button type="button" class="btn small" data-act="guncelle">Güncelle</button>';
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
      DB.odemeler = DB.odemeler.filter(function (o) { return o.toplu !== tid; });
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
    var oid = yeniId();
    DB.odemeler.push({ id: oid, kayit: new Date().toISOString(), daireId: d.id, tur: 'kira', donem: ym, tutar: k.kalan,
      tarih: bugun(), sekil: 'Nakit', aciklama: '', not: '' });
    kaydet(); ciz();
    toast('Daire ' + d.no + ' · ' + ayAdi(ym) + ' kirası ödendi (' + TL(k.kalan) + ')', function () {
      DB.odemeler = DB.odemeler.filter(function (o) { return o.id !== oid; });
      kaydet(); yenile(); toast('Geri alındı');
    });
  },
  'geri-al': function () { var f = toastGeriAl; toastGeriAl = null; $('#toast').hidden = true; if (f) f(); },
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
      DB.odemeler = DB.odemeler.filter(function (o) { return o.daireId !== id; });
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
      DB.odemeler = DB.odemeler.filter(function (o) { return o.id !== id; });
      kaydet(); YIGIN.pop(); YIGIN.pop(); sayfaCiz(); ciz(); toast('Ödeme silindi');
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
  'yedek-yukle': function () { if (BR && BR.importData) BR.importData(); else toast('Yedek yükleme sadece telefonda çalışır'); },
  'csv': csvAktar,
  'guncelleme-kontrol': function () { guncellemeKontrol(true); },
  'guncelle': function () {
    var url = S.guncelleme ? S.guncelleme.url : APK_URL;
    if (BR && BR.openUrl) BR.openUrl(url);
    toast('İndirme başladı. Bitince dosyaya dokunup “Güncelle”yi seçin.');
  }
};
var DEGISIM = {
  'g-tur': function (el) { S.gTur = el.value; ciz(); },
  'g-daire': function (el) { S.gDaire = el.value; ciz(); },
  'a-gecikme': function (el) { var v = +el.value; DB.ayarlar.gecikme = v > 0; if (v) DB.ayarlar.gecikmeSiklik = v; kaydet(); ciz(); },
  'a-saat': function (el) { DB.ayarlar.saat = +el.value; kaydet(); toast('Bildirimler her gün ' + pad(el.value) + ':00 civarında gelir'); }
};

W.onBack = function () {
  if (YIGIN.length) { sayfaKapat(); yenile(); return true; }
  if (S.tab !== 'ozet') { S.tab = 'ozet'; ciz(); return true; }
  return false;
};
W.onAppResume = function () {
  if (!YIGIN.length) ciz();
  hatirlatmalariGonder();
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
  yukle();
  ciz();
  hatirlatmalariGonder();
  setTimeout(function () { guncellemeKontrol(false); }, 1500);
}

if (typeof document !== 'undefined' && document.getElementById('main')) baslat();
if (typeof module !== 'undefined') {
  module.exports = { setDB: function (d) { DB = normalize(d); }, kiraDurum: kiraDurum, kiraBorclari: kiraBorclari, hatirlatmaListesi: hatirlatmaListesi, komurDurum: komurDurum, ayEkle: ayEkle, sezonu: sezonu, sayi: sayi, vadeGunu: vadeGunu };
}
