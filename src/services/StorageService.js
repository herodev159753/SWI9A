import { Platform } from 'react-native';

/**
 * Service for data storage with Web fallback.
 * Uses Keychain/Keystore on mobile, localStorage on Web.
 */

const isWeb = Platform.OS === 'web';

export const saveSecurely = async (key, value) => {
  try {
    if (isWeb) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
        return true;
      }
      return false;
    }
    const SecureStore = require('expo-secure-store');
    await SecureStore.setItemAsync(key, value);
    return true;
  } catch (error) {
    console.error("Storage Save Error:", error);
    return false;
  }
};

export const getSecurely = async (key) => {
  try {
    if (isWeb) {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(key);
      }
      return null;
    }
    const SecureStore = require('expo-secure-store');
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    console.error("Storage Read Error:", error);
    return null;
  }
};

export const deleteSecurely = async (key) => {
  try {
    if (isWeb) {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
        return true;
      }
      return false;
    }
    const SecureStore = require('expo-secure-store');
    await SecureStore.deleteItemAsync(key);
    return true;
  } catch (error) {
    console.error("Storage Delete Error:", error);
    return false;
  }
};
