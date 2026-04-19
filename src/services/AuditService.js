import { db } from './FirebaseService';
import { doc, setDoc, collection, addDoc } from 'firebase/firestore';

/**
 * Service to log sensitive administrative actions for accountability.
 */
export const logAdminAction = async (adminId, actionType, details) => {
  try {
    const logEntry = {
      adminId,
      action: actionType, // e.g., 'PRICE_UPDATE', 'ORDER_DELETE', 'DRIVER_ASSIGN'
      details,
      timestamp: new Date().toISOString(),
      platform: 'AdminDashboard'
    };

    console.log(`[AUDIT] Action: ${actionType} by ${adminId}`);
    
    // Store in 'audit_logs' collection
    await addDoc(collection(db, "audit_logs"), logEntry);
    
    return true;
  } catch (error) {
    console.error("Audit Logging Failed:", error);
    return false;
  }
};
