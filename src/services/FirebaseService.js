import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, deleteDoc, updateDoc, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { sanitizeInput } from '../utils/validation';
import bcrypt from 'bcryptjs';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBiLbw2dQ0oGxPYoY7z4Vpr8g3E79JGlKc",
  authDomain: "swi9a-a6dfe.firebaseapp.com",
  projectId: "swi9a-a6dfe",
  storageBucket: "swi9a-a6dfe.firebasestorage.app",
  messagingSenderId: "514763332291",
  appId: "1:514763332291:web:4facbac8ea6ec79ee26076"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export const registerUser = async (username, password, phone, name) => {
  if (firebaseConfig.apiKey.startsWith('YOUR_')) {
    console.log("Mocking registration success for demo.");
    return { user: { username, uid: 'mock-uid-' + Date.now(), getIdToken: () => Promise.resolve('mock-token') } };
  }
  try {
    const email = `${username.toLowerCase()}@swi9a.com`;
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Sanitize user inputs before storage
    const sanitizedName = sanitizeInput(name);
    const sanitizedPhone = sanitizeInput(phone);

    // Store user metadata securely in Firestore
    await setDoc(doc(db, "users", user.uid), {
      name: sanitizedName,
      email: user.email,
      phone: sanitizedPhone,
      role: 'user', // Default role
      createdAt: new Date().toISOString()
    });

    return user;
  } catch (error) {
    console.error("Registration Error:", error.message);
    throw error;
  }
};

/**
 * Sign in user.
 */
export const loginUser = async (username, password) => {
  if (firebaseConfig.apiKey.startsWith('YOUR_')) {
    console.log("Mocking login success for demo.");
    return { user: { username, uid: 'mock-uid', getIdToken: () => Promise.resolve('mock-token') } };
  }
  const email = `${username.toLowerCase()}@swi9a.com`;
  return await signInWithEmailAndPassword(auth, email, password);
};

/**
 * Securely store order with GPS location.
 * Accessible only to current user and admin via security rules.
 */
export const placeOrder = async (userId, cartItems, location) => {
  const orderId = `order_${Date.now()}`;
  await setDoc(doc(db, "orders", orderId), {
    userId,
    items: cartItems,
    location, // GPS coordinates (lat, lng)
    status: 'Pending',
    timestamp: new Date().toISOString()
  });
};

export const UI_TRANSLATIONS = {
  "no_logs": "لا توجد سجلات حالياً",
  "coming_soon": "سيتم إضافة منتجات قريباً..."
};

const DEFAULT_INVENTORY = [
  { id: 'inv_1', name: 'fresh_tomatoes', names: { ar: 'طماطم طازجة', fr: 'Tomates Fraîches', en: 'Fresh Tomatoes' }, price: '12 MAD', oldPrice: '15 MAD', discount: '20% OFF', category: '1', image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400', vendor: 'Farmer Ahmed', stock: 50, unit: 'kg', saleEndsAt: Date.now() + 3600000 },
  { id: 'inv_2', name: 'organic_carrots', names: { ar: 'جزر عضوي', fr: 'Carottes Bio', en: 'Organic Carrots' }, price: '8 MAD', oldPrice: '10 MAD', discount: '20% OFF', category: '1', image: 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=400', vendor: 'Local Farm', stock: 30, unit: 'kg' },
  { id: 'inv_3', name: 'sweet_oranges', names: { ar: 'برتقال حلو', fr: 'Oranges Sucrées', en: 'Sweet Oranges' }, price: '6 MAD', oldPrice: '8 MAD', discount: '25% OFF', category: '2', image: 'https://images.unsplash.com/photo-1547514701-42782101795e?w=400', vendor: 'Atlas Orchard', stock: 100, unit: 'kg', saleEndsAt: Date.now() + 7200000 },
  { id: 'inv_4', name: 'traditional_djellaba', names: { ar: 'جلابة تقليدية', fr: 'Djellaba Traditionnelle', en: 'Traditional Djellaba' }, price: '350 MAD', oldPrice: '450 MAD', discount: '100 MAD OFF', category: '3', image: 'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=400', vendor: 'Craftsman Omar', stock: 10, unit: 'piece' },
  { id: 'inv_5', name: 'olive_oil_extra', names: { ar: 'زيت زيتون بكر', fr: 'Huile d\'Olive Extra', en: 'Extra Virgin Olive Oil' }, price: '85 MAD', oldPrice: '95 MAD', discount: '10 MAD OFF', category: '4', image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400', vendor: 'Oued Souss', stock: 20, unit: 'litre' },
  { id: 'inv_6', name: 'handmade_tagine', names: { ar: 'طاجين فخاري', fr: 'Tagine en Terre Cuite', en: 'Handmade Clay Tagine' }, price: '45 MAD', oldPrice: '60 MAD', discount: '25% OFF', category: '5', image: 'https://images.unsplash.com/photo-1589923188900-85dae523342b?w=400', vendor: 'Safi Pottery', stock: 15, unit: 'piece' },
  { id: 'inv_7', name: 'fresh_cow_milk', names: { ar: 'حليب بقر طازج', fr: 'Lait de Vache Frais', en: 'Fresh Cow Milk' }, price: '7 MAD', oldPrice: '8 MAD', discount: '1 MAD OFF', category: '11', image: 'https://images.unsplash.com/photo-1550583724-125581fe2f8a?w=400', vendor: 'Village Coop', stock: 25, unit: 'litre' },
  { id: 'inv_8', name: 'bio_honey', names: { ar: 'عسل حر بكر', fr: 'Miel Pur Bio', en: 'Pure Bio Honey' }, price: '120 MAD', oldPrice: '150 MAD', discount: '30 MAD OFF', category: '8', image: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=400', vendor: 'Mountain Apiary', stock: 12, unit: 'piece' },
  { id: 'inv_9', name: 'organic_potatoes', names: { ar: 'بطاطس طبيعية', fr: 'Pommes de Terre Bio', en: 'Organic Potatoes' }, price: '5 MAD', oldPrice: '7 MAD', discount: '2 MAD OFF', category: '1', image: 'https://images.unsplash.com/photo-1518977676601-b53f02ac6d31?w=400', vendor: 'Farmer Ahmed', stock: 80, unit: 'kg' },
  { id: 'inv_10', name: 'berber_carpet_mini', names: { ar: 'زربية أمازيغية صغيرة', fr: 'Mini Tapis Berbère', en: 'Small Berber Carpet' }, price: '250 MAD', oldPrice: '300 MAD', discount: '50 MAD OFF', category: '5', image: 'https://images.unsplash.com/photo-1600166898405-da9535204843?w=400', vendor: 'Women Coop', stock: 5, unit: 'piece' },
  { id: 'inv_11', name: 'natural_lipstick', names: { ar: 'أحمر شفاه طبيعي', fr: 'Rouge à Lèvres Naturel', en: 'Natural Lipstick' }, price: '40 MAD', oldPrice: '55 MAD', discount: '15 MAD OFF', category: '6', image: 'https://images.unsplash.com/photo-1586790170083-2f9ceadc732d?w=400', vendor: 'Bio Beauty', stock: 20, unit: 'piece' },
  { id: 'inv_12', name: 'traditional_soap', names: { ar: 'صابون بلدي أصيل', fr: 'Savon Noir Traditionnel', en: 'Traditional Black Soap' }, price: '15 MAD', oldPrice: '20 MAD', discount: '5 MAD OFF', category: '7', image: 'https://images.unsplash.com/photo-1607006344380-b6775a0824a7?w=400', vendor: 'Local Craft', stock: 50, unit: 'piece' },
];

export const listenToInventory = (callback) => {
  const q = collection(db, 'inventory');
  return onSnapshot(q, async (snapshot) => {
    if (snapshot.empty) {
      console.log('[Firebase] Inventory empty, seeding defaults...');
      try {
        await Promise.all(DEFAULT_INVENTORY.map(item => setDoc(doc(db, 'inventory', item.id), item)));
        callback(DEFAULT_INVENTORY);
      } catch (err) {
        console.error('[Firebase] Seeding inventory failed:', err);
        callback([]);
      }
    } else {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(data);
    }
  }, (error) => {
    console.error('[Firebase] listenToInventory error (likely permissions):', error);
    callback([]);
  });
};

export const addInventoryItemAsync = async (item) => {
  const itemId = `inv_${Date.now()}`;
  await setDoc(doc(db, 'inventory', itemId), {
    ...item,
    createdAt: new Date().toISOString()
  });
};

export const updateInventoryItemAsync = async (itemId, updates) => {
  await updateDoc(doc(db, 'inventory', itemId), updates);
};

export const deleteInventoryItemAsync = async (itemId) => {
  await deleteDoc(doc(db, 'inventory', itemId));
};

export const createOrderAsync = async (orderData) => {
  const orderId = `ord_${Date.now()}`;
  await setDoc(doc(db, 'orders', orderId), {
    ...orderData,
    id: orderId,
    timestamp: new Date().toISOString()
  });
  return orderId;
};

export const listenToOrders = (callback) => {
  const q = collection(db, 'orders');
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(data);
  });
};

export const assignOrderDriverAsync = async (orderId, driverName, driverId) => {
  await updateDoc(doc(db, 'orders', orderId), {
    driver: driverName,
    driverId: driverId,
    status: 'Out for Delivery',
    claimedAt: new Date().toISOString()
  });
};

export const updateOrderStatusAsync = async (orderId, newStatus) => {
  const updates = { status: newStatus };
  if (newStatus === 'Completed') {
    updates.completedAt = new Date().toISOString();
  }
  await updateDoc(doc(db, 'orders', orderId), updates);
};

export const settleOrderAsync = async (orderId, commission, adminId, notes = '') => {
  await updateDoc(doc(db, 'orders', orderId), {
    settlementStatus: 'Settled',
    driverCommission: commission,
    settledAt: new Date().toISOString(),
    settledBy: adminId,
    settlementNotes: notes
  });
};

export const settleMultipleOrdersAsync = async (orderIds, commissionPerOrder, adminId, notes = '') => {
  const settledAt = new Date().toISOString();
  const promises = orderIds.map(orderId => 
    updateDoc(doc(db, 'orders', orderId), {
      settlementStatus: 'Settled',
      driverCommission: commissionPerOrder,
      settledAt,
      settledBy: adminId,
      settlementNotes: notes
    })
  );
  await Promise.all(promises);
};

// ==========================================
// CATEGORIES MANAGEMENT (Firestore-backed)
// ==========================================

const DEFAULT_CATEGORIES = [
  { id: '1', names: { ar: 'خضروات', fr: 'Légumes', en: 'Vegetables' }, icon: 'carrot', color: '#4CAF50', visible: true, order: 1 },
  { id: '2', names: { ar: 'فواكه', fr: 'Fruits', en: 'Fruits' }, icon: 'food-apple', color: '#F44336', visible: true, order: 2 },
  { id: '3', names: { ar: 'ملابس', fr: 'Vêtements', en: 'Clothing' }, icon: 'tshirt-crew', color: '#FF9800', visible: true, order: 3 },
  { id: '4', names: { ar: 'بقالة', fr: 'Épicerie', en: 'Groceries' }, icon: 'basket', color: '#9C27B0', visible: true, order: 4 },
  { id: '5', names: { ar: 'صناعة تقليدية', fr: 'Artisanat', en: 'Local Crafts' }, icon: 'palette', color: '#8E44AD', visible: true, order: 5 },
  { id: '6', names: { ar: 'مستحضرات تجميل', fr: 'Maquillage', en: 'Makeup' }, icon: 'lipstick', color: '#E91E63', visible: true, order: 6 },
  { id: '7', names: { ar: 'تنظيف', fr: 'Nettoyage', en: 'Cleaning' }, icon: 'spray', color: '#00ACC1', visible: true, order: 7 },
  { id: '8', names: { ar: 'منتجات طبيعية', fr: 'Bio', en: 'Bio' }, icon: 'leaf', color: '#66BB6A', visible: true, order: 8 },
  { id: '9', names: { ar: 'منزل وأعمال يدوية', fr: 'Maison & Bricolage', en: 'Home & DIY' }, icon: 'home-variant', color: '#8D6E63', visible: true, order: 9 },
  { id: '10', names: { ar: 'أكل جاهز', fr: 'Plats Préparés', en: 'Ready Food' }, icon: 'food-variant', color: '#FF7043', visible: true, order: 10 },
  { id: '11', names: { ar: 'ألبان', fr: 'Produits Laitiers', en: 'Dairy' }, icon: 'bottle-wine', color: '#2196F3', visible: true, order: 11 },
];

export const listenToCategories = (callback) => {
  const q = collection(db, 'categories');
  return onSnapshot(q, async (snapshot) => {
    if (snapshot.empty) {
      console.log('[Firebase] Categories collection empty, seeding defaults...');
      try {
        await Promise.all(DEFAULT_CATEGORIES.map(cat => setDoc(doc(db, 'categories', cat.id), cat)));
        callback(DEFAULT_CATEGORIES);
      } catch (err) {
        console.error('[Firebase] Seeding categories failed (likely permissions):', err);
        callback(DEFAULT_CATEGORIES);
      }
    } else {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (a.order || 0) - (b.order || 0));
      callback(data);
    }
  }, (error) => {
    console.error('[Firebase] listenToCategories error:', error);
    callback(DEFAULT_CATEGORIES); // Fallback to defaults if permissions missing
  });
};

export const saveCategory = async (categoryData) => {
  await setDoc(doc(db, 'categories', categoryData.id), categoryData);
};

export const deleteCategory = async (categoryId) => {
  await deleteDoc(doc(db, 'categories', categoryId));
};

export const toggleCategoryVisibility = async (categoryId, visible) => {
  await updateDoc(doc(db, 'categories', categoryId), { visible });
};

// ==========================================
// APP USERS MANAGEMENT (Firestore-backed)
// ==========================================

const isFirebaseConfigured = () => !firebaseConfig.apiKey.startsWith('YOUR_');

/**
 * Get all app users from Firestore.
 * Falls back to localStorage if Firebase is not configured.
 */
export const getAppUsers = async () => {
  if (!isFirebaseConfigured()) {
    // Fallback: read from localStorage
    try {
      if (typeof localStorage !== 'undefined') {
        const data = localStorage.getItem('app_users');
        return data ? JSON.parse(data) : [];
      }
    } catch (e) { console.error('getAppUsers localStorage fallback error:', e); }
    return [];
  }
  try {
    const snapshot = await getDocs(collection(db, 'app_users'));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('getAppUsers Error:', error);
    return [];
  }
};

/**
 * Add a new app user to Firestore.
 */
export const addAppUser = async (userData) => {
  if (!isFirebaseConfigured()) {
    // Fallback: save to localStorage
    try {
      if (typeof localStorage !== 'undefined') {
        const existing = localStorage.getItem('app_users');
        const users = existing ? JSON.parse(existing) : [];
        users.push(userData);
        localStorage.setItem('app_users', JSON.stringify(users));
        return userData;
      }
    } catch (e) { console.error('addAppUser localStorage fallback error:', e); }
    return userData;
  }
  try {
    const userId = userData.id || 'user_' + Date.now();
    await setDoc(doc(db, 'app_users', userId), {
      ...userData,
      id: userId
    });
    return { ...userData, id: userId };
  } catch (error) {
    console.error('addAppUser Error:', error);
    throw error;
  }
};

/**
 * Update an existing app user in Firestore.
 */
export const updateAppUser = async (userId, updatedData) => {
  if (!isFirebaseConfigured()) {
    // Fallback: update in localStorage
    try {
      if (typeof localStorage !== 'undefined') {
        const existing = localStorage.getItem('app_users');
        const users = existing ? JSON.parse(existing) : [];
        const updated = users.map(u => u.id === userId ? { ...u, ...updatedData } : u);
        localStorage.setItem('app_users', JSON.stringify(updated));
        return updated.find(u => u.id === userId);
      }
    } catch (e) { console.error('updateAppUser localStorage fallback error:', e); }
    return null;
  }
  try {
    await updateDoc(doc(db, 'app_users', userId), updatedData);
    return { id: userId, ...updatedData };
  } catch (error) {
    console.error('updateAppUser Error:', error);
    throw error;
  }
};

/**
 * Delete an app user from Firestore.
 */
export const deleteAppUser = async (userId) => {
  if (!isFirebaseConfigured()) {
    // Fallback: remove from localStorage
    try {
      if (typeof localStorage !== 'undefined') {
        const existing = localStorage.getItem('app_users');
        const users = existing ? JSON.parse(existing) : [];
        const updated = users.filter(u => u.id !== userId);
        localStorage.setItem('app_users', JSON.stringify(updated));
        return true;
      }
    } catch (e) { console.error('deleteAppUser localStorage fallback error:', e); }
    return false;
  }
  try {
    await deleteDoc(doc(db, 'app_users', userId));
    return true;
  } catch (error) {
    console.error('deleteAppUser Error:', error);
    throw error;
  }
};

/**
 * Find app user by username (for login verification).
 */
export const getAppUserByUsername = async (username) => {
  if (!isFirebaseConfigured()) {
    // Fallback: search in localStorage
    try {
      if (typeof localStorage !== 'undefined') {
        const data = localStorage.getItem('app_users');
        const users = data ? JSON.parse(data) : [];
        return users.find(u => u.username && u.username.toLowerCase() === username.toLowerCase()) || null;
      }
    } catch (e) { console.error('getAppUserByUsername localStorage fallback error:', e); }
    return null;
  }
  try {
    const q = query(collection(db, 'app_users'), where('username', '==', username.toLowerCase()));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const docSnap = snapshot.docs[0];
    return { id: docSnap.id, ...docSnap.data() };
  } catch (error) {
    console.error('getAppUserByUsername Error:', error);
    return null;
  }
};
// ==========================================
// PASSWORD HASHING (bcryptjs)
// ==========================================

const SALT_ROUNDS = 10;

/**
 * Hash a plaintext password.
 */
export const hashPassword = async (plainPassword) => {
  return await bcrypt.hash(plainPassword, SALT_ROUNDS);
};

/**
 * Compare a plaintext password with a hashed password.
 */
export const verifyPassword = async (plainPassword, hashedPassword) => {
  return await bcrypt.compare(plainPassword, hashedPassword);
};

// ==========================================
// OWNER ACCOUNT SEED (runs once)
// ==========================================

/**
 * Ensures the owner account exists in Firestore.
 * Called once on app startup. If the owner doesn't exist, it creates one.
 */
export const ensureOwnerAccount = async () => {
  try {
    const ownerDoc = await getDoc(doc(db, 'app_users', 'hero_owner'));
    if (!ownerDoc.exists()) {
      const hashedPass = await hashPassword('Abdo@115');
      await setDoc(doc(db, 'app_users', 'hero_owner'), {
        id: 'hero_owner',
        name: 'Hero Admin',
        username: 'hero',
        password: hashedPass,
        mfaCode: '159753',
        role: 'owner',
        createdAt: new Date().toISOString()
      });
      console.log('[Firebase] Owner account seeded successfully');
    }
  } catch (error) {
    console.error('ensureOwnerAccount Error:', error);
  }
};

export { auth, db };
