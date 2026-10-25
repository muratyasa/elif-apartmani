'use strict';
/* Elif Apartmanı – ortak kayıt (Firebase eşitleme)
   Kayıtlar Firestore'da tutulur: apartman/elif/{daireler|odemeler|genel}/{id}
   Her belge: json (kaydın kendisi), kim (giren e-posta), silindi, zaman (sunucu saati).
   İstekleri telefon tarafı yapar (Android.http), sayfa sadece JSON hazırlar. */

var FB = {
  apiKey: 'AIzaSyDVMoD8inHUc3hl87P4jj3gmEEDmQl2GKs',
  proje: 'elif-apartmani',
  kok: 'apartman/elif'
};
var FS_URL = 'https://firestore.googleapis.com/v1/projects/' + FB.proje + '/databases/(default)/documents';
var LISTELER = ['daireler', 'odemeler', 'notlar', 'silinenler'];
var KOLLAR = LISTELER.concat(['genel']);
var SENK = { mesgul: false, tekrar: false, zaman: null, hata: '', zamanlayici: null, sonCekim: 0 };

/* ---------- HTTP ---------- */
var HTTP_CB = {}, HTTP_N = 0;
W.onHttp = function (id, code, body) {
  var f = HTTP_CB[id];
  delete HTTP_CB[id];
  if (f) f({ code: code, body: body });
};
function http(method, url, body, headers) {
  return new Promise(function (resolve) {
    if (!(BR && BR.http)) { resolve({ code: 0, body: 'Bu sürümde eşitleme yok' }); return; }
    var id = 'h' + (++HTTP_N);
    HTTP_CB[id] = resolve;
    BR.http(id, method, url, body || '', JSON.stringify(headers || {}));
  });
}
function jsonMu(t) { try { return JSON.parse(t); } catch (e) { return null; } }

/* ---------- Oturum ---------- */
function oturum() { return DB._oturum || null; }
function senkAcik() { return !!(oturum() && BR && BR.http); }
function hataMetni(r) {
  var j = jsonMu(r.body), m = j && j.error && (j.error.message || j.error.status) || '';
  var T = {
    EMAIL_NOT_FOUND: 'Bu e-posta ile kayıtlı hesap yok.',
    INVALID_PASSWORD: 'Şifre yanlış.',
    INVALID_LOGIN_CREDENTIALS: 'E-posta ya da şifre yanlış.',
    USER_DISABLED: 'Bu hesap kapatılmış.',
    TOO_MANY_ATTEMPTS_TRY_LATER: 'Çok fazla deneme yapıldı, biraz sonra tekrar deneyin.',
    INVALID_EMAIL: 'E-posta adresi geçersiz.',
    PERMISSION_DENIED: 'Bu hesabın ortak kayıtlara erişim izni yok.'
  };
  for (var k in T) if (String(m).indexOf(k) === 0) return T[k];
  if (!r.code) return 'İnternete bağlanılamadı.';
  return m || ('Hata ' + r.code);
}
function girisYap(email, sifre) {
  return http('POST', 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + FB.apiKey,
    JSON.stringify({ email: email, password: sifre, returnSecureToken: true }), { 'Content-Type': 'application/json' })
    .then(function (r) {
      var j = jsonMu(r.body);
      if (r.code !== 200 || !j || !j.idToken) throw new Error(hataMetni(r));
      DB._oturum = { email: j.email, uid: j.localId, idToken: j.idToken, refreshToken: j.refreshToken,
        bitis: Date.now() + (parseInt(j.expiresIn, 10) || 3600) * 1000 - 60000 };
      kaydetYerel();
      return ilkEsitleme();
    });
}
function sifreSifirla(email) {
  return http('POST', 'https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=' + FB.apiKey,
    JSON.stringify({ requestType: 'PASSWORD_RESET', email: email }), { 'Content-Type': 'application/json' })
    .then(function (r) { if (r.code !== 200) throw new Error(hataMetni(r)); });
}
function cikisYap() {
  DB._oturum = null; DB._yansi = null; DB._son = null;
  kaydetYerel();
}
function token() {
  var o = oturum();
  if (!o) return Promise.reject(new Error('Giriş yapılmamış'));
  if (o.idToken && Date.now() < o.bitis) return Promise.resolve(o.idToken);
  return http('POST', 'https://securetoken.googleapis.com/v1/token?key=' + FB.apiKey,
    'grant_type=refresh_token&refresh_token=' + encodeURIComponent(o.refreshToken), { 'Content-Type': 'application/x-www-form-urlencoded' })
    .then(function (r) {
      var j = jsonMu(r.body);
      if (r.code !== 200 || !j || !j.id_token) {
        if (r.code === 400) { cikisYap(); throw new Error('Oturum sona erdi, tekrar giriş yapın.'); }
        throw new Error(hataMetni(r));
      }
      o.idToken = j.id_token; o.refreshToken = j.refresh_token;
      o.bitis = Date.now() + (parseInt(j.expires_in, 10) || 3600) * 1000 - 60000;
      kaydetYerel();
      return o.idToken;
    });
}
function fsIstek(method, url, govde) {
  return token().then(function (t) {
    return http(method, url, govde ? JSON.stringify(govde) : '', { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t });
  }).then(function (r) {
    if (r.code === 401) { if (DB._oturum) DB._oturum.bitis = 0; }
    if (r.code !== 200) throw new Error(hataMetni(r));
    return jsonMu(r.body);
  });
}

/* ---------- Yerel kayıtları belgeye çevirme ---------- */
function genelVeri() {
  var a = Object.assign({}, DB.ayarlar);
  delete a.bildirimGoruldu;
  return { ayarlar: a, komur: DB.komur, taksitler: DB.taksitler, giderler: DB.giderler || [] };
}
function yerelHarita() {
  var m = { genel: {} }, e = (oturum() || {}).email || '';
  LISTELER.forEach(function (kol) {
    m[kol] = {};
    (DB[kol] || []).forEach(function (x) { if (kol === 'odemeler' && !x.kim && e) x.kim = e; m[kol][x.id] = JSON.stringify(x); });
  });
  m.genel.ayar = JSON.stringify(genelVeri());
  return m;
}
function belgeAdi(kol, id) { return 'projects/' + FB.proje + '/databases/(default)/documents/' + FB.kok + '/' + kol + '/' + id; }

function bosYansi() { var y = { genel: {} }; LISTELER.forEach(function (k) { y[k] = {}; }); return y; }

/* ---------- Gönder: yereldeki değişiklikleri sunucuya yaz ---------- */
function gonder() {
  var y = DB._yansi || bosYansi(), m = yerelHarita(), yazilar = [], izler = [];
  var kim = (oturum() || {}).email || '';
  KOLLAR.forEach(function (kol) {
    var yk = y[kol] || {}, mk = m[kol];
    Object.keys(mk).forEach(function (id) {
      if (yk[id] !== mk[id]) {
        yazilar.push({ update: { name: belgeAdi(kol, id), fields: { json: { stringValue: mk[id] }, kim: { stringValue: kim }, silindi: { booleanValue: false } } },
          updateTransforms: [{ fieldPath: 'zaman', setToServerValue: 'REQUEST_TIME' }] });
        izler.push([kol, id, mk[id]]);
      }
    });
    Object.keys(yk).forEach(function (id) {
      if (!(id in mk)) {
        yazilar.push({ update: { name: belgeAdi(kol, id), fields: { json: { stringValue: '' }, kim: { stringValue: kim }, silindi: { booleanValue: true } } },
          updateTransforms: [{ fieldPath: 'zaman', setToServerValue: 'REQUEST_TIME' }] });
        izler.push([kol, id, null]);
      }
    });
  });
  if (!yazilar.length) return Promise.resolve(0);
  var parcalar = [];
  for (var i = 0; i < yazilar.length; i += 400) parcalar.push([yazilar.slice(i, i + 400), izler.slice(i, i + 400)]);
  return parcalar.reduce(function (p, parca) {
    return p.then(function () {
      return fsIstek('POST', FS_URL + ':commit', { writes: parca[0] }).then(function () {
        var yy = DB._yansi || (DB._yansi = bosYansi());
        parca[1].forEach(function (z) {
          yy[z[0]] = yy[z[0]] || {};
          if (z[2] === null) delete yy[z[0]][z[1]]; else yy[z[0]][z[1]] = z[2];
        });
        kaydetYerel();
      });
    });
  }, Promise.resolve()).then(function () { return yazilar.length; });
}

/* ---------- Çek: sunucudaki yeni değişiklikleri al ---------- */
function sorgu(kol, son) {
  var q = { from: [{ collectionId: kol }], orderBy: [{ field: { fieldPath: 'zaman' } }] };
  if (son) q.where = { fieldFilter: { field: { fieldPath: 'zaman' }, op: 'GREATER_THAN', value: { timestampValue: son } } };
  return fsIstek('POST', FS_URL + '/' + FB.kok + ':runQuery', { structuredQuery: q }).then(function (r) {
    return (r || []).filter(function (x) { return x.document; }).map(function (x) {
      var f = x.document.fields || {};
      return { id: x.document.name.split('/').pop(), json: f.json ? f.json.stringValue : '', silindi: !!(f.silindi && f.silindi.booleanValue),
        zaman: f.zaman ? f.zaman.timestampValue : '' };
    });
  });
}
function uygula(kol, belgeler) {
  if (!belgeler.length) return false;
  var y = DB._yansi || (DB._yansi = bosYansi());
  y[kol] = y[kol] || {};
  belgeler.forEach(function (b) {
    if (kol === 'genel') {
      if (b.silindi || !b.json) return;
      var g = jsonMu(b.json); if (!g) return;
      var gor = DB.ayarlar.bildirimGoruldu;
      DB.ayarlar = Object.assign(bosVeri().ayarlar, g.ayarlar || {}, { bildirimGoruldu: gor });
      DB.komur = g.komur || []; DB.taksitler = g.taksitler || [];
      if (Array.isArray(g.giderler)) DB.giderler = g.giderler; /* eski sürümün yazdığı kayıtta gider yoksa yerel giderler korunur */
      y.genel[b.id] = JSON.stringify(genelVeri());
      return;
    }
    var liste = DB[kol] || (DB[kol] = []), i = -1;
    for (var k = 0; k < liste.length; k++) if (liste[k].id === b.id) { i = k; break; }
    if (b.silindi || !b.json) {
      if (i >= 0) liste.splice(i, 1);
      delete y[kol][b.id];
    } else {
      var o = jsonMu(b.json); if (!o) return;
      if (i >= 0) liste[i] = o; else liste.push(o);
      y[kol][b.id] = b.json;
    }
  });
  var son = belgeler[belgeler.length - 1].zaman;
  DB._son = DB._son || {};
  if (son) DB._son[kol] = son;
  return true;
}
function cek() {
  var degisti = false;
  return KOLLAR.reduce(function (p, kol) {
    return p.then(function () {
      return sorgu(kol, (DB._son || {})[kol]).then(function (b) { if (uygula(kol, b)) degisti = true; });
    });
  }, Promise.resolve()).then(function () {
    if (degisti) { IDX = null; kaydetYerel(); hatirlatmalariGonder(); if (!YIGIN.length && typeof document !== 'undefined') ciz(); }
    return degisti;
  });
}

/* ---------- İlk eşitleme: sunucuda kayıt varsa onlar esas, yoksa bu telefondakiler yüklenir ---------- */
function ilkEsitleme() {
  DB._son = {}; DB._yansi = bosYansi();
  var gelen = {};
  return KOLLAR.reduce(function (p, kol) {
    return p.then(function () { return sorgu(kol, '').then(function (b) { gelen[kol] = b; }); });
  }, Promise.resolve()).then(function () {
    var dolu = (gelen.daireler || []).some(function (b) { return !b.silindi && b.json; });
    if (dolu) {
      LISTELER.forEach(function (k) { DB[k] = []; });
      KOLLAR.forEach(function (kol) { uygula(kol, gelen[kol] || []); });
      IDX = null; kaydetYerel(); hatirlatmalariGonder();
      return 'cekildi';
    }
    return gonder().then(function () {
      KOLLAR.forEach(function (kol) { var b = gelen[kol] || []; if (b.length) { DB._son[kol] = b[b.length - 1].zaman; } });
      kaydetYerel();
      return 'yuklendi';
    });
  });
}

/* ---------- Yedekten yükleme sonrası: sunucuyu bu telefondakiyle aynı yap ---------- */
function tamGonder() {
  var y = bosYansi();
  return KOLLAR.reduce(function (p, kol) {
    return p.then(function () {
      return sorgu(kol, '').then(function (b) { b.forEach(function (x) { if (!x.silindi) y[kol][x.id] = '__sunucu__'; }); });
    });
  }, Promise.resolve()).then(function () { DB._yansi = y; return gonder(); });
}

/* ---------- Döngü ---------- */
function esitle(neden) {
  if (!senkAcik()) return Promise.resolve();
  if (SENK.mesgul) { SENK.tekrar = true; return Promise.resolve(); }
  SENK.mesgul = true;
  return gonder().then(function () { return cek(); }).then(function () {
    SENK.zaman = new Date(); SENK.hata = ''; SENK.sonCekim = Date.now();
  }).catch(function (e) {
    SENK.hata = e && e.message || 'Eşitlenemedi';
  }).then(function () {
    SENK.mesgul = false;
    senkDurumuGoster();
    if (SENK.tekrar) { SENK.tekrar = false; setTimeout(function () { esitle('tekrar'); }, 300); }
  });
}
function gonderZamanla() {
  if (!senkAcik()) return;
  clearTimeout(SENK.zamanlayici);
  SENK.zamanlayici = setTimeout(function () { esitle('kayit'); }, 1500);
}
function senkDurumuGoster() {
  if (typeof document === 'undefined') return;
  var el = document.getElementById('senk-durum');
  if (el) el.innerHTML = senkDurumHtml();
}
function senkDurumHtml() {
  if (!oturum()) return '';
  if (SENK.hata) return '<span class="warn">Son eşitleme olmadı: ' + esc(SENK.hata) + '</span>';
  if (SENK.zaman) return 'Son eşitleme: ' + pad(SENK.zaman.getHours()) + ':' + pad(SENK.zaman.getMinutes());
  return 'Eşitleniyor…';
}
/* İşlemi yapanın e-postası yerine adı görünür (depo herkese açık: e-postalar değil, parmak izleri yazılı) */
var KISI_ADLARI = { '18m771t': 'Umut', '1x526px': 'Umut', '16e1x7u': 'Murat', '4ch6hl': 'Ömer' };
function epostaIzi(e) {
  e = String(e || '').trim().toLowerCase();
  var x = 5381;
  for (var i = 0; i < e.length; i++) x = ((x * 33) ^ e.charCodeAt(i)) >>> 0;
  return x.toString(36);
}
function kisaKim(e) {
  if (!e) return '';
  var ad = (DB.ayarlar.kisiler || {})[e] || KISI_ADLARI[epostaIzi(e)];
  return ad || e.split('@')[0];
}
setInterval(function () {
  if (senkAcik() && !(typeof document !== 'undefined' && document.hidden)) esitle('periyot');
}, 30000);
