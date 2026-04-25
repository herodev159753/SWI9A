import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, deleteDoc, updateDoc, query, where } from 'firebase/firestore';
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

import { onSnapshot } from 'firebase/firestore';

export const listenToInventory = (callback) => {
  const q = collection(db, 'inventory');
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(data);
  });
};

export const addInventoryItemAsync = async (item) => {
  const itemId = `inv_${Date.now()}`;
  await setDoc(doc(db, 'inventory', itemId), {
    ...item,
    createdAt: new Date().toISOString()
  });
};

export const deleteInventoryItemAsync = async (itemId) => {
  await deleteDoc(doc(db, 'inventory', itemId));
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
    status: 'Out for Delivery'
  });
};

export const updateOrderStatusAsync = async (orderId, newStatus) => {
  await updateDoc(doc(db, 'orders', orderId), {
    status: newStatus
  });
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
