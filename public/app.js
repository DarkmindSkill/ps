import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

const T = {
 en: { tag:'Simple point of sale', signin:'Sign in with Google', setup:'First-time setup', shop:'Shop name', cur:'Currency', tz:'Time zone', start:'Start selling',
  logout:'Sign out', sell:'Sell', products:'Products', qrtab:'QR labels', reports:'Reports', search:'Search product by name',
  cart:'Cart', total:'Total', clear:'Clear', pay:'Complete sale', scan:'Start scanner', stop:'Stop scanner', name:'Product name', price:'Price', stock:'Stock', low:'Low-stock level',
  save:'Save', cancel:'Cancel', edit:'Edit', del:'Delete', confirmDel:'Delete this product?', copies:'Labels per product', print:'Print A4', qrhint:'24 labels per A4 sheet. QR codes hold only the product ID, so you can change prices without reprinting.',
  daily:'Daily report', monthly:'Monthly report', bills:'Bills', revenue:'Revenue', items:'Items sold', empty:'Nothing here yet', sold:'Sale complete', lowAlert:'Low stock', outStock:'Not enough stock: ',
  nf:'Product not found', cam:'Cannot open camera (needs HTTPS and permission)', added:'Added', inStock:'in stock', err:'Something went wrong' },
 si: { tag:'සරල විකුණුම් පද්ධතිය', signin:'Google මගින් පිවිසෙන්න', setup:'ආරම්භක සැකසුම', shop:'වෙළඳසැලේ නම', cur:'මුදල් ඒකකය', tz:'වේලා කලාපය', start:'විකිණීම ආරම්භ කරන්න',
  logout:'ඉවත් වන්න', sell:'විකිණීම', products:'භාණ්ඩ', qrtab:'QR ලේබල්', reports:'වාර්තා', search:'නමින් භාණ්ඩය සොයන්න',
  cart:'කූඩය', total:'මුළු මුදල', clear:'හිස් කරන්න', pay:'විකිණීම අවසන් කරන්න', scan:'ස්කෑනරය ආරම්භ කරන්න', stop:'ස්කෑනරය නවත්වන්න', name:'භාණ්ඩයේ නම', price:'මිල', stock:'තොගය', low:'අඩු තොග සීමාව',
  save:'සුරකින්න', cancel:'අවලංගු', edit:'සංස්කරණය', del:'මකන්න', confirmDel:'මෙම භාණ්ඩය මකන්නද?', copies:'භාණ්ඩයකට ලේබල් ගණන', print:'A4 මුද්‍රණය', qrhint:'A4 පත්‍රයකට ලේබල් 24 කි. QR කේතයේ ඇත්තේ භාණ්ඩ අංකය පමණි, එබැවින් මිල වෙනස් කළත් නැවත මුද්‍රණය අවශ්‍ය නැත.',
  daily:'දෛනික වාර්තාව', monthly:'මාසික වාර්තාව', bills:'බිල්පත්', revenue:'ආදායම', items:'විකුණූ ඒකක', empty:'තවම කිසිවක් නැත', sold:'විකිණීම සාර්ථකයි', lowAlert:'තොග අඩුයි', outStock:'තොගය ප්‍රමාණවත් නැත: ',
  nf:'භාණ්ඩය හමු නොවීය', cam:'කැමරාව විවෘත කළ නොහැක (HTTPS සහ අවසරය අවශ්‍යයි)', added:'එක් කළා', inStock:'තොගයේ ඇත', err:'දෝෂයක් සිදු විය' }
};
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
let lang = localStorage.getItem('lang') || 'en', auth, user, store, products = [], cart = [], scanner, last = { c: '', t: 0 }, tab = 'sell';
const t = k => T[lang][k] || k;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const money = n => `${store?.currency || 'Rs'} ${Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: store?.tz || 'Asia/Colombo' });

async function api(path, method = 'GET', body) {
  const r = await fetch('/api/' + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await user.getIdToken() }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'err');
  return d;
}
let tt; function toast(m) { const e = $('#toast'); e.textContent = m; e.classList.remove('hidden'); clearTimeout(tt); tt = setTimeout(() => e.classList.add('hidden'), 2500); }
const errMsg = e => e.message.startsWith('stock:') ? t('outStock') + e.message.slice(6) : (T[lang][e.message] ? t(e.message) : t('err'));
function beep() { try { const c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator(); o.frequency.value = 880; o.connect(c.destination); o.start(); o.stop(c.currentTime + .1); } catch {} }
const show = id => ['login', 'setup', 'app'].forEach(x => $('#' + x).classList.toggle('hidden', x !== id));

function applyLang() {
  document.documentElement.lang = lang; localStorage.setItem('lang', lang);
  $$('[data-i]').forEach(e => e.textContent = t(e.dataset.i));
  $$('[data-p]').forEach(e => e.placeholder = t(e.dataset.p));
  if (store) { $('#shopName').textContent = store.shop; renderAll(); }
}
$$('[data-l]').forEach(b => b.onclick = () => { lang = b.dataset.l; applyLang(); });

function renderAll() { renderBanner(); renderCart(); renderProducts(); renderScanLabel(); if (tab === 'qr') renderQR(); if (tab === 'reports') loadReport(); }
function renderBanner() {
  const l = products.filter(p => p.stock <= p.low), b = $('#banner');
  b.classList.toggle('hidden', !l.length);
  b.innerHTML = l.length ? `⚠ ${t('lowAlert')}: ` + l.map(p => `${esc(p.name)} (${p.stock})`).join(', ') : '';
}
function renderScanLabel() { $('#scanBtn').textContent = scanner?.isScanning ? t('stop') : t('scan'); }

/* ---- sell ---- */
function addToCart(p) {
  const c = cart.find(x => x.id === p.id), q = c ? c.qty + 1 : 1;
  if (q > p.stock) return toast(t('outStock') + p.name);
  c ? c.qty = q : cart.push({ id: p.id, name: p.name, price: p.price, qty: 1 });
  renderCart(); toast(`${t('added')}: ${p.name}`);
}
function renderCart() {
  $('#cart').innerHTML = cart.length ? cart.map(c => `<div class="item"><div class="nm">${esc(c.name)}<small>${money(c.price)}</small></div>
    <button data-d="${esc(c.id)}" aria-label="-">−</button><b>${c.qty}</b><button data-u="${esc(c.id)}" aria-label="+">+</button></div>`).join('') : `<p class="hint">${t('empty')}</p>`;
  $('#tot').textContent = money(cart.reduce((s, c) => s + c.price * c.qty, 0));
}
$('#cart').onclick = e => {
  const id = e.target.dataset.d || e.target.dataset.u; if (!id) return;
  const c = cart.find(x => x.id === id), p = products.find(x => x.id === id);
  if (e.target.dataset.u) { if (c.qty < p.stock) c.qty++; else toast(t('outStock') + p.name); } else if (--c.qty <= 0) cart = cart.filter(x => x !== c);
  renderCart();
};
$('#q').oninput = () => {
  const q = $('#q').value.trim().toLowerCase();
  $('#res').innerHTML = q ? products.filter(p => p.name.toLowerCase().includes(q)).slice(0, 8).map(p =>
    `<button class="item" data-a="${esc(p.id)}"><span class="nm">${esc(p.name)}<small>${money(p.price)} · ${p.stock} ${t('inStock')}</small></span></button>`).join('') : '';
};
$('#res').onclick = e => { const b = e.target.closest('[data-a]'); if (b) { addToCart(products.find(p => p.id === b.dataset.a)); $('#q').value = ''; $('#res').innerHTML = ''; } };
function onScan(text) {
  const now = Date.now(); if (text === last.c && now - last.t < 1500) return; last = { c: text, t: now };
  const p = text.startsWith('POS:') && products.find(x => x.id === text.slice(4));
  if (!p) return toast(t('nf'));
  beep(); addToCart(p);
}
$('#scanBtn').onclick = async () => {
  try {
    if (scanner?.isScanning) await scanner.stop();
    else { scanner = scanner || new Html5Qrcode('reader'); await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 220, height: 220 } }, onScan, () => {}); }
  } catch { toast(t('cam')); }
  renderScanLabel();
};
$('#clear').onclick = () => { cart = []; renderCart(); };
$('#pay').onclick = async () => {
  if (!cart.length) return; $('#pay').disabled = true;
  try { const r = await api('sales', 'POST', { items: cart.map(c => ({ id: c.id, qty: c.qty })) }); cart = []; await loadProducts(); toast(`${t('sold')} · ${money(r.total)}`); }
  catch (e) { toast(errMsg(e)); }
  $('#pay').disabled = false;
};

/* ---- products ---- */
function renderProducts() {
  $('#plist').innerHTML = products.length ? products.map(p => `<div class="item"><div class="nm">${esc(p.name)}<small class="${p.stock <= p.low ? 'low' : ''}">${money(p.price)} · ${p.stock} ${t('inStock')}${p.stock <= p.low ? ' ⚠' : ''}</small></div>
   <button data-e="${esc(p.id)}">${t('edit')}</button><button data-x="${esc(p.id)}" aria-label="${t('del')}">🗑</button></div>`).join('') : `<p class="hint">${t('empty')}</p>`;
}
function resetForm() { $('#pf').reset(); $('#pid').value = ''; $('#pl').value = 5; $('#pcancel').classList.add('hidden'); }
$('#pcancel').onclick = resetForm;
$('#pf').onsubmit = async e => {
  e.preventDefault(); const id = $('#pid').value;
  try { await api(id ? 'products/' + id : 'products', id ? 'PUT' : 'POST', { name: $('#pn').value, price: $('#pp').value, stock: $('#ps').value, low: $('#pl').value }); resetForm(); await loadProducts(); }
  catch (er) { toast(errMsg(er)); }
};
$('#plist').onclick = async e => {
  const id = e.target.dataset.e || e.target.dataset.x; if (!id) return; const p = products.find(x => x.id === id);
  if (e.target.dataset.e) { $('#pid').value = id; $('#pn').value = p.name; $('#pp').value = p.price; $('#ps').value = p.stock; $('#pl').value = p.low; $('#pcancel').classList.remove('hidden'); $('#pn').focus(); scrollTo(0, 0); }
  else if (confirm(t('confirmDel'))) { try { await api('products/' + id, 'DELETE'); cart = cart.filter(c => c.id !== id); await loadProducts(); } catch (er) { toast(errMsg(er)); } }
};
async function loadProducts() { products = (await api('products')).products; renderAll(); }

/* ---- QR sheets (A4: 3 x 8 = 24 labels) ---- */
function renderQR() {
  const n = Math.max(1, Math.min(50, +$('#copies').value || 1)), labels = products.flatMap(p => Array(n).fill(p)), pa = $('#printArea');
  pa.replaceChildren();
  for (let i = 0; i < labels.length; i += 24) {
    const s = document.createElement('div'); s.className = 'sheet';
    labels.slice(i, i + 24).forEach(p => {
      const l = document.createElement('div'), q = document.createElement('div'), nm = document.createElement('span');
      l.className = 'label'; nm.textContent = p.name; l.append(q, nm); s.append(l);
      new QRCode(q, { text: 'POS:' + p.id, width: 120, height: 120, correctLevel: QRCode.CorrectLevel.M });
    });
    pa.append(s);
  }
}
$('#copies').oninput = renderQR;
$('#print').onclick = () => { renderQR(); setTimeout(() => print(), 150); };

/* ---- reports ---- */
function rtypeUI() { const m = $('#rtype').value === 'month'; $('#rday').classList.toggle('hidden', m); $('#rmonth').classList.toggle('hidden', !m); }
async function loadReport() {
  const m = $('#rtype').value === 'month', v = m ? $('#rmonth').value : $('#rday').value; if (!v) return;
  try {
    const r = await api(`reports?${m ? 'month' : 'day'}=${v}`);
    $('#rout').innerHTML = `<div class="stats"><div>${t('revenue')}<b>${money(r.total)}</b></div><div>${t('bills')}<b>${r.bills}</b></div><div>${t('items')}<b>${r.items}</b></div></div>` +
     (r.products.length ? `<table><tr><th>${t('name')}</th><th>${t('items')}</th><th>${t('revenue')}</th></tr>${r.products.map(p => `<tr><td>${esc(p.name)}</td><td>${p.qty}</td><td>${money(p.revenue)}</td></tr>`).join('')}</table>` : `<p class="hint">${t('empty')}</p>`) +
     (m && r.days.length ? `<h2>${t('daily')}</h2><table>${r.days.map(d => `<tr><td>${esc(d.day)}</td><td>${money(d.total)}</td></tr>`).join('')}</table>` : '');
  } catch (e) { toast(errMsg(e)); }
}
$('#rtype').onchange = () => { rtypeUI(); loadReport(); }; $('#rday').onchange = $('#rmonth').onchange = loadReport;

/* ---- tabs & auth ---- */
$$('nav [data-tab]').forEach(b => b.onclick = async () => {
  tab = b.dataset.tab; $$('.panel').forEach(p => p.classList.toggle('on', p.id === tab)); $$('nav [data-tab]').forEach(x => x.classList.toggle('on', x === b));
  if (tab !== 'sell' && scanner?.isScanning) { await scanner.stop(); renderScanLabel(); }
  if (tab === 'qr') renderQR(); if (tab === 'reports') loadReport();
});
$('#gbtn').onclick = () => signInWithPopup(auth, new GoogleAuthProvider()).catch(() => toast(t('err')));
$('#out').onclick = () => signOut(auth);
$('#sf').onsubmit = async e => {
  e.preventDefault();
  try { store = (await api('setup', 'POST', { shop: $('#sh').value, currency: $('#sc').value, tz: $('#stz').value })).store; await enter(); } catch (er) { toast(errMsg(er)); }
};
async function enter() {
  show('app'); $('#rday').value = today(); $('#rmonth').value = today().slice(0, 7);
  $('nav [data-tab=sell]').click(); applyLang(); await loadProducts();
}
(async () => {
  applyLang();
  try {
    auth = getAuth(initializeApp(await (await fetch('/api/config')).json()));
    onAuthStateChanged(auth, async u => {
      user = u; if (!u) { store = null; cart = []; return show('login'); }
      try { store = (await api('me')).store; store ? await enter() : (show('setup'), applyLang()); } catch { show('login'); toast(t('err')); }
    });
  } catch { show('login'); toast(t('err')); }
})();
