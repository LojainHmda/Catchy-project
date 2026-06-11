import { config } from 'dotenv';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy } from 'firebase/firestore';

config();

const app = initializeApp({
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
});

const db = getFirestore(app);

function resolveProductInventory(data) {
  const sizeStock = {};
  if (data.sizeStock && typeof data.sizeStock === 'object') {
    Object.entries(data.sizeStock).forEach(([k, v]) => {
      sizeStock[k] = Math.max(0, Math.floor(Number(v) || 0));
    });
  }
  if (Object.keys(sizeStock).length > 0) {
    const stock = Object.values(sizeStock).reduce((s, n) => s + n, 0);
    return { sizeStock, stock, sized: true };
  }
  return { sizeStock: {}, stock: Math.max(0, Math.floor(Number(data.stock) || 0)), sized: false };
}

function stockForSelection(sizeStock, totalStock, size, sized) {
  if (sized) return size ? Math.max(0, sizeStock[size] ?? 0) : 0;
  return totalStock;
}

const snap = await getDocs(query(collection(db, 'products'), orderBy('createdAt', 'desc')));
console.log('--- Products inventory ---');
for (const docSnap of snap.docs) {
  const data = docSnap.data();
  const inv = resolveProductInventory(data);
  console.log(`\n${data.name} (${docSnap.id})`);
  console.log(`  stock field: ${data.stock}`);
  if (inv.sized) {
    console.log(`  sizeStock: ${JSON.stringify(inv.sizeStock)}`);
    console.log(`  computed total: ${inv.stock}`);
  } else {
    console.log(`  no per-size map, total: ${inv.stock}`);
  }
}

const jacket = snap.docs.find((d) => String(d.data().name).includes('جاكيت') || String(d.data().name).toLowerCase().includes('jacket'));
if (jacket) {
  const data = jacket.data();
  const inv = resolveProductInventory(data);
  const cart = [
    { size: 'S', quantity: 3 },
    { size: 'M', quantity: 4 },
  ];
  console.log('\n--- Simulate cart: جاكيت S×3, M×4 ---');
  for (const line of cart) {
    const available = stockForSelection(inv.sizeStock, inv.stock, line.size, inv.sized);
    const ok = available >= line.quantity;
    console.log(`  ${line.size}×${line.quantity}: available=${available} => ${ok ? 'OK' : 'FAIL OUT_OF_STOCK'}`);
  }
}

process.exit(0);
