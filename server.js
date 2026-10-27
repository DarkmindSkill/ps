require('dotenv').config();
const express = require('express'), helmet = require('helmet'), compression = require('compression');
const rateLimit = require('express-rate-limit'), path = require('path'), admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore(), FV = admin.firestore.FieldValue;
const app = express();
if (process.env.TRUST_PROXY) app.set('trust proxy', 1);
app.use(helmet({
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", 'https://www.gstatic.com', 'https://cdnjs.cloudflare.com'],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'blob:', 'https://*.googleusercontent.com'],
    connectSrc: ["'self'", 'https://*.googleapis.com'],
    frameSrc: ['https://*.firebaseapp.com', 'https://accounts.google.com'],
    mediaSrc: ["'self'", 'blob:'], objectSrc: ["'none'"] } }
}));
app.use(compression());
app.use(express.json({ limit: '50kb' }));
app.use('/api', rateLimit({ windowMs: 60000, max: 300, standardHeaders: true, legacyHeaders: false }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

const S = uid => db.collection('stores').doc(uid);
const bad = (m, s = 400) => ({ status: s, message: m });
const fail = (res, e) => res.status(e.status || 500).json({ error: e.status ? e.message : 'server' });
const wrap = fn => (req, res) => fn(req, res).catch(e => { if (!e.status) console.error(e); fail(res, e); });

async function auth(req, res, next) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return res.status(401).json({ error: 'auth' });
  try { req.uid = (await admin.auth().verifyIdToken(h.slice(7))).uid; req.user = req.uid; next(); }
  catch { res.status(401).json({ error: 'auth' }); }
}
app.get('/api/config', (req, res) => {
  try { res.json(JSON.parse(process.env.FIREBASE_WEB_CONFIG)); } catch { res.status(500).json({ error: 'config' }); }
});

app.get('/api/me', auth, wrap(async (req, res) => {
  const s = await S(req.uid).get(); res.json({ store: s.exists ? s.data() : null });
}));
app.post('/api/setup', auth, wrap(async (req, res) => {
  const shop = String(req.body.shop || '').trim().slice(0, 60);
  const currency = String(req.body.currency || 'Rs').trim().slice(0, 6);
  const tz = String(req.body.tz || 'Asia/Colombo');
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { throw bad('tz'); }
  if (!shop) throw bad('shop');
  const u = await admin.auth().getUser(req.uid);
  await S(req.uid).set({ shop, currency, tz, owner: u.email || '', name: u.displayName || '', created: FV.serverTimestamp() }, { merge: true });
  res.json({ store: { shop, currency, tz } });
}));

const clean = b => {
  const name = String(b.name || '').trim().slice(0, 80), price = +b.price, stock = Math.floor(+b.stock), low = Math.floor(+b.low);
  if (!name || !(price >= 0 && price < 1e9) || !(stock >= 0 && stock < 1e9) || !(low >= 0 && low < 1e9)) throw bad('invalid');
  return { name, price: Math.round(price * 100) / 100, stock, low };
};
app.get('/api/products', auth, wrap(async (req, res) => {
  const q = await S(req.uid).collection('products').orderBy('name').limit(2000).get();
  res.json({ products: q.docs.map(d => ({ id: d.id, ...d.data() })) });
}));
app.post('/api/products', auth, wrap(async (req, res) => {
  const ref = S(req.uid).collection('products').doc();
  await ref.set({ ...clean(req.body), created: FV.serverTimestamp() }); res.json({ id: ref.id });
}));
app.put('/api/products/:id', auth, wrap(async (req, res) => {
  await S(req.uid).collection('products').doc(req.params.id).update(clean(req.body)); res.json({ ok: 1 });
}));
app.delete('/api/products/:id', auth, wrap(async (req, res) => {
  await S(req.uid).collection('products').doc(req.params.id).delete(); res.json({ ok: 1 });
}));

app.post('/api/sales', auth, wrap(async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items.slice(0, 200) : [], merged = {};
  if (!items.length) throw bad('empty');
  for (const i of items) {
    const q = Math.floor(+i.qty);
    if (typeof i.id !== 'string' || !i.id || i.id.includes('/') || !(q > 0 && q <= 10000)) throw bad('invalid');
    merged[i.id] = (merged[i.id] || 0) + q;
  }
  const ref = S(req.uid), ids = Object.keys(merged);
  const tz = ((await ref.get()).data() || {}).tz || 'Asia/Colombo';
  const day = new Date().toLocaleDateString('en-CA', { timeZone: tz });
  const total = await db.runTransaction(async tx => {
    const snaps = await tx.getAll(...ids.map(id => ref.collection('products').doc(id)));
    let sum = 0; const lines = [];
    for (const s of snaps) {
      if (!s.exists) throw bad('notfound', 404);
      const p = s.data(), q = merged[s.id];
      if (p.stock < q) throw bad('stock:' + p.name, 409);
      sum += p.price * q; lines.push({ id: s.id, name: p.name, price: p.price, qty: q });
      tx.update(s.ref, { stock: p.stock - q });
    }
    sum = Math.round(sum * 100) / 100;
    tx.set(ref.collection('sales').doc(), { lines, total: sum, day, month: day.slice(0, 7), ts: FV.serverTimestamp() });
    return sum;
  });
  res.json({ total });
}));

app.get('/api/reports', auth, wrap(async (req, res) => {
  const { day, month } = req.query, f = day ? 'day' : 'month', v = String(day || month || '');
  if (!(f === 'day' ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}$/).test(v)) throw bad('invalid');
  const q = await S(req.uid).collection('sales').where(f, '==', v).get();
  let total = 0, items = 0; const by = {}, days = {};
  q.forEach(d => {
    const s = d.data(); total += s.total; days[s.day] = (days[s.day] || 0) + s.total;
    s.lines.forEach(l => { items += l.qty; const b = by[l.id] || (by[l.id] = { name: l.name, qty: 0, revenue: 0 }); b.qty += l.qty; b.revenue += l.price * l.qty; });
  });
  res.json({ bills: q.size, total: Math.round(total * 100) / 100, items,
    products: Object.values(by).sort((a, b) => b.revenue - a.revenue),
    days: Object.entries(days).sort().map(([d, t]) => ({ day: d, total: Math.round(t * 100) / 100 })) });
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'notfound' }));
app.listen(process.env.PORT || 3000, () => console.log('POS running on port ' + (process.env.PORT || 3000)));
