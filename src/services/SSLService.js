/**
 * SSL Pinning Guide & Shell
 * 
 * To implement SSL Pinning in Expo, you typically use a custom development client 
 * with a library like 'react-native-ssl-pinning' or 'expo-trust-shield'.
 */

export const getSSLPinnedFetch = () => {
  // If using react-native-ssl-pinning:
  // import { fetch } from 'react-native-ssl-pinning';
  
  // return fetch("https://your-api.com", {
  //   method: "GET",
  //   timeoutInterval: 10000,
  //   pkPinning: true,
  //   sslPinning: {
  //     certs: ["my-server-cert"] // name of .cer file in bundle
  //   }
  // });

  console.info("SSL Pinning: Ensure certificates are bundled in the native project and SSL_PINNING_ENABLED is true in config.");
  return fetch; // Default fetch fallback for development
};

/**
 * SECURITY POLICY: API Key Restriction
 * 
 * 1. Google Maps:
 *    - Go to Google Cloud Console > Credentials.
 *    - Restrict API Key to 'Android apps' and 'iOS apps'.
 *    - Provide your Bundle ID and SHA-1 certificate fingerprint.
 * 
 * 2. Firebase:
 *    - Go to Google Cloud Console > APIs & Services > Credentials.
 *    - Restrict the 'Browser key' to authorized domains only (e.g. your-app.firebaseapp.com).
 *    - Restrict API usage to specific services (Identity Toolkit, Firestore).
 */
