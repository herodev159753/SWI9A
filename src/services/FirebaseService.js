import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import { sanitizeInput } from '../utils/validation';

// Firebase configuration (Placeholder)
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
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
    console.log("Mocking login success for demo. Please add real Firebase keys.");
    // We still return mock so the app doesn't crash completely, but real usage requires keys
    return { user: { email: username + '@swi9a.com', uid: 'mock-uid', getIdToken: () => Promise.resolve('mock-token') } };
  }
  const email = `${username.toLowerCase()}@swi9a.com`;
  return await signInWithEmailAndPassword(auth, email, password);
};

/**
 * Get user profile from Firestore (Role, Name, etc.)
 */
export const getUserProfile = async (uid) => {
  if (firebaseConfig.apiKey.startsWith('YOUR_')) {
    return { role: 'admin', name: 'Mock Admin', mfaCode: '159753' };
  }
  const docRef = doc(db, 'users', uid);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() };
  }
  return null;
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

import { collection, onSnapshot, deleteDoc, updateDoc } from 'firebase/firestore';

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

export { auth, db };
