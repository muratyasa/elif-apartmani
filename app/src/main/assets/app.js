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
    ayarlar: { hatirlatGun: [7, 1], gecikme: true, saat: 10 },
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
function taksitBul(id) { for (var i = 0; i < DB.taksitler.length; i++) if (DB.taksitler[i].id === id) return DB.taksitler[i]; return null; }
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
function kiraDurum(d, ym) {
  if (d.bos || ym < baslangicAyi(d)) return { kod: 'yok', odenen: 0, kalan: 0, beklenen: 0, vade: '' };
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

function komurOdenen(did, tid) { return odenenToplam('komur', did, tid); }
function komurDurum(d, t) {
  if (d.bos) return { kod: 'yok', odenen: 0, kalan: 0, beklenen: 0 };
  var bek = +t.tutar || 0, od = komurOdenen(d.id, t.id), kalan = Math.max(0, bek - od), kod;
  if (kalan <= 0) kod = 'odendi';
  else if (bugun() > t.tarih) kod = 'gecikti';
  else if (od > 0) kod = 'kismi';
  else kod = 'bekliyor';
  return { kod: kod, odenen: od, kalan: kalan, beklenen: bek };
}
function sezonTaksitleri(sz) {
  return DB.taksitler.filter(function (t) { return sezonu(t.tarih) === sz; })
    .sort(function (a, b) { return a.tarih < b.tarih ? -1 : 1; });
}
function taksitAdi(t) { return (t.ad || 'Kömür taksiti') + ' · ' + tarihAdi(t.tarih); }

/* ---------- Bildirim listesi (telefon her gün buradan bakar) ---------- */
function hatirlatmaListesi() {
  var A = DB.ayarlar, gun0 = bugun(), son = gunEkle(gun0, 90), kovalar = {};
  var gunler = (A.hatirlatGun || []).map(Number).filter(function (n) { return n >= 0; });
  function ekle(tarih, tip, gunSayisi, satir) {
    if (tarih < gun0 || tarih > son) return;
    var k = tarih + '|' + tip + '|' + gunSayisi;
    if (!kovalar[k]) kovalar[k] = { tarih: tarih, tip: tip, gun: gunSayisi, satirlar: [] };
    kovalar[k].satirlar.push(satir);
  }
  /* Gecikme: ödeme gününden sonraki gün bir kez, sonra her pazartesi hepsi tek bildirimde */
  var pazartesiler = [];
  for (var t = gun0; t <= son; t = gunEkle(t, 1)) if (toDate(t).getDay() === 1) pazartesiler.push(t);
  function gecikmeGunleri(vade) {
    var ilk = gunEkle(vade, 1), l = [];
    if (ilk >= gun0 && ilk <= son) l.push(ilk);
    pazartesiler.forEach(function (p) { if (p > ilk) l.push(p); });
    return l;
  }
  function kisi(d) { return 'Daire ' + d.no + (d.kiraci ? ' (' + d.kiraci + ')' : ''); }
  var cur = buAy();
  DB.daireler.forEach(function (d) {
    for (var i = -24; i <= 3; i++) {
      var ym = ayEkle(cur, i), k = kiraDurum(d, ym);
      if (k.kalan <= 0) continue;
      gunler.forEach(function (g) { ekle(gunEkle(k.vade, -g), 'kira', g, kisi(d) + ' – ' + TL(k.kalan)); });
      if (A.gecikme) gecikmeGunleri(k.vade).forEach(function (t) { ekle(t, 'kira-gec', 0, kisi(d) + ' – ' + ayAdi(ym) + ', ' + TL(k.kalan)); });
    }
    DB.taksitler.forEach(function (tk) {
      var k = komurDurum(d, tk);
      if (k.kalan <= 0) return;
      gunler.forEach(function (g) { ekle(gunEkle(tk.tarih, -g), 'komur', g, kisi(d) + ' – ' + TL(k.kalan)); });
      if (A.gecikme) gecikmeGunleri(tk.tarih).forEach(function (t) { ekle(t, 'komur-gec', 0, kisi(d) + ' – ' + (tk.ad || 'kömür') + ', ' + TL(k.kalan)); });
    });
  });
  return Object.keys(kovalar).sort().map(function (key) {
    var b = kovalar[key], baslik, ust;
    var n = b.satirlar.map(function (x) { return x.split(' – ')[0]; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
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
    } else {
      baslik = 'Ödenmemiş kömür · ' + n + ' daire';
      ust = 'Ödeme günü geçtiği halde kömür ödemesi girilmemiş daireler:';
    }
    return { tarih: b.tarih, baslik: baslik, metin: ust + '\n' + satirlar.join('\n') };
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
function toast(msg) {
  if (typeof document === 'undefined') return;
  var t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastZamani);
  toastZamani = setTimeout(function () { t.hidden = true; }, 2600);
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
      h += '<button type="button" class="row" data-act="daire-ac" data-id="' + x.d.id + '">' +
        '<span class="no">' + esc(x.d.no) + '</span>' +
        '<span class="row-main"><span class="row-title">' + esc(x.d.kiraci || 'Kiracı girilmemiş') + '</span>' +
        '<span class="row-sub">' + x.b.length + ' ay: ' + esc(aylar) + '</span></span>' +
        '<span class="row-end"><span class="amt bad">' + TL(x.toplam) + '</span></span></button>';
    });
    h += '</div>';
  }
  h += '</section>';

  h += '<section class="card"><h2 class="card-title">Önümüzdeki 7 gün</h2>';
  if (!yaklasan.length) h += '<p class="empty">Bu hafta ödeme günü gelen daire yok.</p>';
  else {
    h += '<div class="list">';
    yaklasan.forEach(function (x) {
      h += '<button type="button" class="row" data-act="daire-ac" data-id="' + x.d.id + '">' +
        '<span class="no">' + esc(x.d.no) + '</span>' +
        '<span class="row-main"><span class="row-title">' + esc(x.d.kiraci || 'Kiracı girilmemiş') + '</span>' +
        '<span class="row-sub">' + esc(tarihAdi(x.k.vade, false)) + ' · ' + kalanGunMetni(x.g) + '</span></span>' +
        '<span class="row-end"><span class="amt">' + TL(x.k.kalan) + '</span></span></button>';
    });
    h += '</div>';
  }
  h += '</section>';

  var sz = sezonu(gun0), tk = sezonTaksitleri(sz);
  if (tk.length) {
    var kb = 0, ko = 0, kGec = 0;
    tk.forEach(function (t) {
      DB.daireler.forEach(function (d) {
        var k = komurDurum(d, t); kb += k.beklenen; ko += Math.min(k.odenen, k.beklenen); if (k.kod === 'gecikti') kGec++;
      });
    });
    var ky = kb ? Math.min(100, Math.round(ko / kb * 100)) : 0;
    h += '<section class="card"><div class="card-head"><h2 class="card-title">Kömür ' + esc(sz) + '</h2>' +
      '<button type="button" class="link" data-act="sekme" data-tab="komur">Ayrıntı</button></div>' +
      '<div class="big">' + TL(ko) + ' <small>/ ' + TL(kb) + '</small></div>' +
      '<div class="bar"><i style="width:' + ky + '%"></i></div>' +
      (kGec ? '<p class="note warn">' + kGec + ' taksit ödemesi gecikmiş.</p>' : '') + '</section>';
  }
  return h;
}

function daireSatiri(d, ay) {
  var k = kiraDurum(d, ay), sag;
  if (k.kod === 'yok') sag = chip('yok');
  else if (k.kod === 'tanimsiz') sag = chip('tanimsiz');
  else sag = chip(k.kod) + '<span class="amt' + (k.kod === 'gecikti' ? ' bad' : '') + '">' + TL(k.kalan > 0 ? k.kalan : k.beklenen) + '</span>';
  var alt = d.bos ? 'Boş daire' : (d.telefon ? esc(d.telefon) : 'Ödeme günü: ayın ' + (parseInt(d.odemeGunu, 10) || 1) + "'i");
  return '<button type="button" class="row" data-act="daire-ac" data-id="' + d.id + '">' +
    '<span class="no">' + esc(d.no) + '</span>' +
    '<span class="row-main"><span class="row-title">' + esc(d.bos ? 'Boş' : (d.kiraci || 'Kiracı girilmemiş')) + '</span>' +
    '<span class="row-sub">' + alt + '</span></span>' +
    '<span class="row-end">' + sag + '</span></button>';
}
function daireFiltreli() {
  var ay = S.ay, q = S.arama.trim().toLocaleLowerCase('tr');
  return daireler().filter(function (d) {
    var k = kiraDurum(d, ay);
    if (S.filtre === 'odemeyen' && !(k.kod === 'gecikti' || k.kod === 'bekliyor' || k.kod === 'kismi')) return false;
    if (S.filtre === 'odeyen' && k.kod !== 'odendi') return false;
    if (S.filtre === 'bos' && k.kod !== 'yok') return false;
    if (q) {
      var metin = (d.no + ' ' + (d.kiraci || '') + ' ' + (d.telefon || '')).toLocaleLowerCase('tr');
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
    '<input id="arama" type="search" placeholder="Daire no, kiracı veya telefon ara" value="' + esc(S.arama) + '" aria-label="Ara">' +
    '<section class="card"><div class="list" id="daire-listesi">' + daireListesiHtml() + '</div></section>' +
    '<button type="button" class="btn ghost block" data-act="daire-yeni">+ Daire ekle</button>';
}

function vKomur() {
  var tk = sezonTaksitleri(S.sezon), h = '';
  h += '<section class="card"><div class="card-head"><h2 class="card-title">' + esc(S.sezon) + ' taksitleri</h2>' +
    '<button type="button" class="link" data-act="taksit-yeni">+ Taksit ekle</button></div>';
  if (!tk.length) {
    h += '<p class="empty">Bu sezon için kömür taksiti girilmemiş. Taksit eklediğinizde her dairenin ödeyip ödemediğini buradan takip edebilirsiniz.</p>';
  } else {
    h += '<div class="list">';
    tk.forEach(function (t) {
      var odeyen = 0, gecikti = 0, toplam = 0, aktif = 0;
      DB.daireler.forEach(function (d) {
        var k = komurDurum(d, t); if (k.kod === 'yok') return;
        aktif++; if (k.kod === 'odendi') odeyen++; if (k.kod === 'gecikti') gecikti++; toplam += Math.min(k.odenen, k.beklenen);
      });
      h += '<button type="button" class="row" data-act="taksit-ac" data-id="' + t.id + '">' +
        '<span class="row-main"><span class="row-title">' + esc(t.ad || 'Kömür taksiti') + '</span>' +
        '<span class="row-sub">' + esc(tarihAdi(t.tarih)) + ' · daire başı ' + TL(t.tutar) + '</span></span>' +
        '<span class="row-end"><span class="amt">' + odeyen + '/' + aktif + ' ödedi</span>' +
        (gecikti ? chip('gecikti') : '<span class="row-sub">' + TL(toplam) + '</span>') + '</span></button>';
    });
    h += '</div>';
  }
  h += '</section>';
  if (tk.length) {
    h += '<section class="card"><h2 class="card-title">Daire bazında</h2><div class="list">';
    daireler().forEach(function (d) {
      if (d.bos) return;
      var bek = 0, od = 0, gec = false;
      tk.forEach(function (t) { var k = komurDurum(d, t); bek += k.beklenen; od += Math.min(k.odenen, k.beklenen); if (k.kod === 'gecikti') gec = true; });
      var kod = od >= bek ? 'odendi' : (gec ? 'gecikti' : (od > 0 ? 'kismi' : 'bekliyor'));
      h += '<button type="button" class="row" data-act="komur-daire" data-id="' + d.id + '">' +
        '<span class="no">' + esc(d.no) + '</span>' +
        '<span class="row-main"><span class="row-title">' + esc(d.kiraci || 'Kiracı girilmemiş') + '</span>' +
        '<span class="row-sub">' + TL(od) + ' / ' + TL(bek) + '</span></span>' +
        '<span class="row-end">' + chip(kod) + '</span></button>';
    });
    h += '</div></section>';
  }
  return h;
}

function odemeSatiri(o, daireGoster) {
  var d = daireBul(o.daireId), donem = '';
  if (o.tur === 'kira' && o.donem) donem = ayAdi(o.donem);
  else if (o.tur === 'komur') { var t = taksitBul(o.donem); donem = t ? (t.ad || 'Kömür') : 'Kömür'; }
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
    '<label class="check"><input id="a-gecikme" type="checkbox" data-change="a-gecikme"' + (A.gecikme ? ' checked' : '') + '> Ödeme gecikirse ertesi gün ve her pazartesi hatırlat</label>' +
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
      var h = '<section class="card">' +
        '<div class="row-title" style="font-size:20px">' + esc(d.bos ? 'Boş daire' : (d.kiraci || 'Kiracı girilmemiş')) + '</div>' +
        '<dl class="kv">' +
        (d.telefon ? '<dt>Telefon</dt><dd>' + esc(d.telefon) + '</dd>' : '') +
        '<dt>Aylık kira</dt><dd>' + TL(d.kira) + '</dd>' +
        '<dt>Ödeme günü</dt><dd>Ayın ' + (parseInt(d.odemeGunu, 10) || 1) + "'i</dd>" +
        (d.baslangic ? '<dt>Kira başlangıcı</dt><dd>' + esc(ayAdi(d.baslangic)) + '</dd>' : '') +
        '<dt>Toplam borç</dt><dd style="color:' + (borcTop ? 'var(--bad)' : 'var(--ok)') + '">' + (borcTop ? TL(borcTop) : 'Yok') + '</dd>' +
        '</dl>' + (d.not ? '<p class="note">' + esc(d.not) + '</p>' : '') +
        '<div class="actions">' +
        (!d.bos ? '<button type="button" class="btn" data-act="odeme-daire" data-id="' + d.id + '">Ödeme gir</button>' : '') +
        (d.telefon ? '<button type="button" class="btn ghost" data-act="ara" data-tel="' + esc(d.telefon) + '">Ara</button>' : '') +
        '<button type="button" class="btn ghost" data-act="daire-duzenle" data-id="' + d.id + '">Düzenle</button>' +
        '</div></section>';

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

      var sz = sezonu(bugun()), tk = sezonTaksitleri(sz);
      if (tk.length && !d.bos) {
        h += '<section class="card"><h2 class="card-title">Kömür ' + esc(sz) + '</h2><div class="list">';
        tk.forEach(function (t) {
          var k = komurDurum(d, t);
          h += '<button type="button" class="row" data-act="komur-ode" data-id="' + d.id + '" data-t="' + t.id + '">' +
            '<span class="row-main"><span class="row-title">' + esc(t.ad || 'Kömür taksiti') + '</span>' +
            '<span class="row-sub">' + esc(tarihAdi(t.tarih)) + '</span></span>' +
            '<span class="row-end">' + chip(k.kod) + '<span class="amt">' + TL(k.kalan > 0 ? k.kalan : k.beklenen) + '</span></span></button>';
        });
        h += '</div></section>';
      }

      var od = DB.odemeler.filter(function (o) { return o.daireId === d.id; })
        .sort(function (a, b) { return (b.tarih + b.kayit) < (a.tarih + a.kayit) ? -1 : 1; });
      h += '<section class="card"><h2 class="card-title">Ödeme geçmişi</h2>';
      if (!od.length) h += '<p class="empty">Bu daire için henüz ödeme girilmemiş.</p>';
      else h += '<div class="list">' + od.slice(0, 60).map(function (o) { return odemeSatiri(o, false); }).join('') + '</div>';
      return h + '</section>';
    }
  });
}

/* Daire ekle / düzenle */
function daireFormu(id) {
  var d = id ? daireBul(id) : null;
  sayfaAc({
    baslik: function () { return d ? 'Daire ' + d.no + ' düzenle' : 'Yeni daire'; },
    ciz: function () {
      var x = d || { no: '', kiraci: '', telefon: '', kira: '', odemeGunu: 1, baslangic: '', bos: false, not: '' };
      return '<div class="form">' +
        '<div class="grid2"><div class="field"><label for="d-no">Daire no</label><input id="d-no" value="' + esc(x.no) + '" placeholder="Örn. 12 veya A-3"></div>' +
        '<div class="field"><label for="d-gun">Ödeme günü</label><input id="d-gun" type="number" inputmode="numeric" min="1" max="31" value="' + esc(x.odemeGunu || 1) + '"></div></div>' +
        '<label class="check"><input id="d-bos" type="checkbox"' + (x.bos ? ' checked' : '') + '> Daire şu an boş</label>' +
        '<div class="field"><label for="d-kiraci">Kiracı adı</label><input id="d-kiraci" value="' + esc(x.kiraci) + '" autocomplete="off"></div>' +
        '<div class="field"><label for="d-tel">Telefon</label><input id="d-tel" type="tel" value="' + esc(x.telefon) + '"></div>' +
        '<div class="grid2"><div class="field"><label for="d-kira">Aylık kira (₺)</label><input id="d-kira" inputmode="decimal" value="' + esc(x.kira || '') + '"></div>' +
        '<div class="field"><label for="d-bas">Kira başlangıcı</label><input id="d-bas" type="month" value="' + esc(x.baslangic || '') + '"></div></div>' +
        '<p class="note">Kira başlangıcı girilirse, o aydan önceki aylar borç olarak sayılmaz. Boş bırakırsanız daireyi eklediğiniz ay başlangıç kabul edilir.</p>' +
        '<div class="field"><label for="d-not">Not</label><textarea id="d-not">' + esc(x.not || '') + '</textarea></div>' +
        '<button type="button" class="btn block" data-act="daire-kaydet" data-id="' + (d ? d.id : '') + '">Kaydet</button>' +
        (d ? '<button type="button" class="btn danger block" data-act="daire-sil" data-id="' + d.id + '">Daireyi sil</button>' : '') +
        '</div>';
    }
  });
}
function daireKaydet(id) {
  var no = $('#d-no').value.trim();
  if (!no) { toast('Daire no girin'); return; }
  var cakisan = DB.daireler.some(function (x) { return x.id !== id && String(x.no).toLocaleLowerCase('tr') === no.toLocaleLowerCase('tr'); });
  if (cakisan) { toast('Bu numarada başka bir daire var'); return; }
  var gun = Math.min(31, Math.max(1, parseInt($('#d-gun').value, 10) || 1));
  var veri = {
    no: no, odemeGunu: gun, bos: $('#d-bos').checked,
    kiraci: $('#d-kiraci').value.trim(), telefon: $('#d-tel').value.trim(),
    kira: sayi($('#d-kira').value), baslangic: $('#d-bas').value || '', not: $('#d-not').value.trim()
  };
  if (id) Object.assign(daireBul(id), veri);
  else DB.daireler.push(Object.assign({ id: yeniId(), olusturma: bugun() }, veri));
  kaydet(); sayfaKapat(); yenile(); toast('Daire kaydedildi');
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
  var taksitId = (b.tur === 'komur' && b.donem) || on.taksitId || '';
  sayfaAc({
    baslik: function () { return mevcut ? 'Ödemeyi düzenle' : 'Ödeme gir'; },
    ciz: function () {
      var tumTaksit = DB.taksitler.slice().sort(function (x, y) { return x.tarih < y.tarih ? 1 : -1; });
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
        '<div class="field" id="f-taksit"><label for="o-taksit">Hangi kömür taksiti?</label>' +
        (tumTaksit.length ? '<select id="o-taksit">' + tumTaksit.map(function (t) {
          return '<option value="' + t.id + '"' + (t.id === taksitId ? ' selected' : '') + '>' + esc(taksitAdi(t)) + '</option>';
        }).join('') + '</select>' : '<p class="note warn">Önce Kömür sekmesinden bir taksit ekleyin.</p>') + '</div>' +
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
    var sel = $('#o-taksit'), t = sel ? taksitBul(sel.value) : null;
    if (t) { var kk = komurDurum(d, t); kalan = kk.kalan; metin = (t.ad || 'Taksit') + ': ' + TL(kk.odenen) + ' ödendi, ' + TL(kk.kalan) + ' kaldı.'; }
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
    if (!donem) { toast('Önce bir kömür taksiti ekleyin'); return; }
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

/* Kömür taksitleri */
function taksitFormu(id) {
  var t = id ? taksitBul(id) : null;
  sayfaAc({
    baslik: function () { return t ? 'Taksiti düzenle' : 'Kömür taksiti ekle'; },
    ciz: function () {
      var sira = sezonTaksitleri(S.sezon).length + 1;
      var x = t || { ad: sira + '. taksit', tarih: '', tutar: '' };
      return '<div class="form">' +
        '<div class="field"><label for="t-ad">Adı</label><input id="t-ad" value="' + esc(x.ad) + '"></div>' +
        '<div class="grid2"><div class="field"><label for="t-tarih">Son ödeme günü</label><input id="t-tarih" type="date" value="' + esc(x.tarih) + '"></div>' +
        '<div class="field"><label for="t-tutar">Daire başı tutar (₺)</label><input id="t-tutar" inputmode="decimal" value="' + esc(x.tutar) + '"></div></div>' +
        '<p class="note">Bu tutar dolu olan her daireden beklenir. Bildirimler bu güne göre gönderilir.</p>' +
        '<button type="button" class="btn block" data-act="taksit-kaydet" data-id="' + (t ? t.id : '') + '">Kaydet</button>' +
        (t ? '<button type="button" class="btn danger block" data-act="taksit-sil" data-id="' + t.id + '">Taksiti sil</button>' : '') +
        '</div>';
    }
  });
}
function taksitKaydet(id) {
  var ad = $('#t-ad').value.trim(), tarih = $('#t-tarih').value, tutar = sayi($('#t-tutar').value);
  if (!tarih) { toast('Son ödeme gününü seçin'); return; }
  if (!(tutar > 0)) { toast('Tutar girin'); return; }
  if (id) Object.assign(taksitBul(id), { ad: ad, tarih: tarih, tutar: tutar });
  else DB.taksitler.push({ id: yeniId(), ad: ad, tarih: tarih, tutar: tutar });
  S.sezon = sezonu(tarih);
  kaydet(); sayfaKapat(); yenile(); toast('Taksit kaydedildi');
}
function taksitSayfasi(id) {
  sayfaAc({
    baslik: function () { var t = taksitBul(id); return t ? (t.ad || 'Kömür taksiti') : 'Taksit'; },
    ciz: function () {
      var t = taksitBul(id);
      if (!t) return '<p class="empty">Bu taksit silinmiş.</p>';
      var h = '<section class="card"><dl class="kv"><dt>Son ödeme günü</dt><dd>' + esc(tarihAdi(t.tarih)) + '</dd>' +
        '<dt>Daire başı</dt><dd>' + TL(t.tutar) + '</dd></dl>' +
        '<button type="button" class="btn ghost block" data-act="taksit-duzenle" data-id="' + t.id + '">Taksiti düzenle</button></section>' +
        '<section class="card"><h2 class="card-title">Daireler</h2><div class="list">';
      daireler().forEach(function (d) {
        if (d.bos) return;
        var k = komurDurum(d, t);
        h += '<button type="button" class="row" data-act="komur-ode" data-id="' + d.id + '" data-t="' + t.id + '">' +
          '<span class="no">' + esc(d.no) + '</span>' +
          '<span class="row-main"><span class="row-title">' + esc(d.kiraci || 'Kiracı girilmemiş') + '</span>' +
          '<span class="row-sub">' + TL(k.odenen) + ' ödendi</span></span>' +
          '<span class="row-end">' + chip(k.kod) + '</span></button>';
      });
      return h + '</div></section>';
    }
  });
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
    else if (o.tur === 'komur') { var t = taksitBul(o.donem); donem = t ? taksitAdi(t) : ''; }
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
  'ara': function (el) { if (BR && BR.dial) BR.dial(el.dataset.tel); else toast(el.dataset.tel); },
  'odeme-yeni': function () {
    var top = YIGIN[YIGIN.length - 1];
    odemeFormu(top && top.daireId ? { daireId: top.daireId } : {});
  },
  'odeme-daire': function (el) { odemeFormu({ daireId: el.dataset.id }); },
  'ay-hucre': function (el) { odemeFormu({ daireId: el.dataset.id, tur: 'kira', ay: el.dataset.ym }); },
  'komur-ode': function (el) { odemeFormu({ daireId: el.dataset.id, tur: 'komur', taksitId: el.dataset.t }); },
  'komur-daire': function (el) {
    var d = daireBul(el.dataset.id), tk = sezonTaksitleri(S.sezon), hedef = null;
    tk.forEach(function (t) { if (!hedef && komurDurum(d, t).kalan > 0) hedef = t; });
    odemeFormu({ daireId: d.id, tur: 'komur', taksitId: (hedef || tk[0]).id });
  },
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
  'taksit-yeni': function () { taksitFormu(null); },
  'taksit-ac': function (el) { taksitSayfasi(el.dataset.id); },
  'taksit-duzenle': function (el) { taksitFormu(el.dataset.id); },
  'taksit-kaydet': function (el) { taksitKaydet(el.dataset.id || null); },
  'taksit-sil': function (el) {
    var id = el.dataset.id, n = DB.odemeler.filter(function (o) { return o.tur === 'komur' && o.donem === id; }).length;
    onayla('Bu taksit ve ona girilmiş ' + n + ' kömür ödemesi silinecek.', 'Taksiti sil', function () {
      DB.taksitler = DB.taksitler.filter(function (t) { return t.id !== id; });
      DB.odemeler = DB.odemeler.filter(function (o) { return !(o.tur === 'komur' && o.donem === id); });
      kaydet(); YIGIN = []; sayfaCiz(); ciz(); toast('Taksit silindi');
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
  'a-gecikme': function (el) { DB.ayarlar.gecikme = el.checked; kaydet(); ciz(); },
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
    if (e.target.id === 'arama') {
      S.arama = e.target.value;
      var l = document.getElementById('daire-listesi');
      if (l) l.innerHTML = daireListesiHtml();
    }
  });
  yukle();
  ciz();
  hatirlatmalariGonder();
  setTimeout(function () { guncellemeKontrol(false); }, 1500);
}

if (typeof document !== 'undefined' && document.getElementById('main')) baslat();
if (typeof module !== 'undefined') {
  module.exports = { setDB: function (d) { DB = normalize(d); }, kiraDurum: kiraDurum, kiraBorclari: kiraBorclari, hatirlatmaListesi: hatirlatmaListesi, komurDurum: komurDurum, ayEkle: ayEkle, sezonu: sezonu, sayi: sayi, vadeGunu: vadeGunu };
}
