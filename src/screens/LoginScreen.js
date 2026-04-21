import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { getSecurely, saveSecurely, deleteSecurely } from '../services/StorageService';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../services/i18n';
import { useAuth } from '../context/AuthContext';
import { loginUser, getUserProfile } from '../services/FirebaseService';

const LoginScreen = ({ navigation, route }) => {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [mfaState, setMfaState] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [targetMfaCode, setTargetMfaCode] = useState('159753'); // Default for owner/fallback
  const [lockoutMsg, setLockoutMsg] = useState('');

  const languages = [
    { code: 'fr', label: 'FR' },
    { code: 'ar', label: 'AR' },
    { code: 'en', label: 'EN' },
  ];

  const { login, verifyMFA, isAuthenticated, userRole, isMfaVerified } = useAuth();

  useEffect(() => {
    checkLockoutStatus();
    // On web, if the path is /admin, default to French
    if (typeof window !== 'undefined' && window.location.pathname.includes('/admin')) {
      changeLanguage('fr');
    }
    if (isAuthenticated && (userRole === 'admin' || userRole === 'owner') && !isMfaVerified) {
      setMfaState(true);
    }
  }, [isAuthenticated, userRole, isMfaVerified]);

  const checkLockoutStatus = async () => {
    try {
      const banUntil = await getSecurely('banUntil');
      if (banUntil && parseInt(banUntil) > Date.now()) {
        const remainingStr = new Date(parseInt(banUntil)).toLocaleString();
        setLockoutMsg(`${t('access_denied')} → ${remainingStr}`);
        return true;
      }
      setLockoutMsg('');
      return false;
    } catch { return false; }
  };

  const handleFailedAttempt = async () => {
    let strikes = await getSecurely('loginStrikes');
    strikes = strikes ? parseInt(strikes) + 1 : 1;
    await saveSecurely('loginStrikes', strikes.toString());

    if (strikes === 10) {
      const tomorrow = Date.now() + (24 * 60 * 60 * 1000);
      await saveSecurely('banUntil', tomorrow.toString());
      checkLockoutStatus();
    } else if (strikes >= 5) {
      const penaltyMins = (strikes - 4) * 2;
      const unlockTime = Date.now() + (penaltyMins * 60 * 1000);
      await saveSecurely('banUntil', unlockTime.toString());
      checkLockoutStatus();
    } else {
      Alert.alert(t('error'), `${t('login_failed')}. ${strikes}/5`);
    }
  };

  const handleAuth = async () => {
    if (await checkLockoutStatus()) return;

    if (!username || !password) {
      Alert.alert(t('error'), t('fill_fields'));
      return;
    }

    setLoading(true);
    try {
      const trimmedUser = username.trim().toLowerCase();
      const trimmedPass = password.trim();

      // Admin Hero (Owner) - Hardcoded fallback
      if (trimmedUser === 'hero' && trimmedPass === 'Abdo@115') {
        const success = await login({
          token: 'admin-hero-token',
          role: 'owner',
          name: 'Hero Admin',
          id: 'hero_owner'
        });
        if (success) {
          setTargetMfaCode('159753'); // Hardcoded for owner Hero
          setMfaState(true);
        }
        setLoading(false);
        return;
      }

      // Authenticate with Firebase
      const userCredential = await loginUser(trimmedUser, trimmedPass);
      const user = userCredential.user;
      
      // Fetch user role and info from Firestore
      const userProfile = await getUserProfile(user.uid);
      
      if (!userProfile) {
        Alert.alert(t('error'), 'No profile found for this user.');
        setLoading(false);
        return;
      }

      const token = await user.getIdToken();
      const role = userProfile.role || 'user';
      const name = userProfile.name || trimmedUser;

      const success = await login({
        token: token,
        role: role,
        name: name,
        id: user.uid
      });

      if (success) {
        if (role === 'admin' || role === 'owner') {
          setTargetMfaCode(userProfile.mfaCode || '159753');
          setMfaState(true);
        } else if (role === 'driver') {
          navigation.reset({ index: 0, routes: [{ name: 'DriverDashboard' }] });
        } else {
          navigation.navigate('Home');
        }
      }
      return;
    } catch (error) {
      console.error('Login Error:', error);
      await handleFailedAttempt();
    } finally {
      setLoading(false);
    }
  };

  const handleMFAVerification = async () => {
    if (mfaCode.trim() === targetMfaCode) {
      verifyMFA();
      navigation.reset({ index: 0, routes: [{ name: 'AdminDashboard' }] });
    } else {
      Alert.alert(t('error'), t('invalid_mfa'));
    }
  };

  if (mfaState) {
    return (
      <View style={styles.mfaContainer}>
        <MaterialCommunityIcons name="shield-lock-outline" size={80} color={COLORS.primary} />
        <Text style={styles.title}>{t('mfa_title')}</Text>
        <Text style={styles.subtitle}>{t('mfa_subtitle')}</Text>
        <TextInput
          style={[styles.input, { textAlign: 'center', letterSpacing: 10, fontSize: 24 }]}
          placeholder="● ● ● ● ● ●"
          keyboardType="number-pad"
          maxLength={6}
          secureTextEntry
          value={mfaCode}
          onChangeText={setMfaCode}
        />
        <TouchableOpacity style={styles.button} onPress={handleMFAVerification}>
          <Text style={styles.buttonText}>{t('verify_code')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <MaterialCommunityIcons name="storefront" size={60} color={COLORS.primary} style={styles.logo} />
      <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>{t('welcome_back')}</Text>
      <Text style={[styles.subtitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('login_subtitle')}</Text>
      
      <TextInput
        style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]}
        placeholder={t('username')}
        autoCapitalize="none"
        value={username}
        onChangeText={setUsername}
      />
      <TextInput
        style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]}
        placeholder={t('password')}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {lockoutMsg ? (
        <View style={{ backgroundColor: '#FFEBEE', padding: 15, borderRadius: 10, marginVertical: 15, width: '100%' }}>
          <Text style={{ color: '#D32F2F', fontWeight: 'bold', textAlign: 'center' }}>🚫 {lockoutMsg}</Text>
        </View>
      ) : (
        <TouchableOpacity style={styles.button} onPress={handleAuth} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('sign_in')}</Text>}
        </TouchableOpacity>
      )}

      <View style={[styles.langRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        {languages.map((lang) => (
          <TouchableOpacity key={lang.code} onPress={() => changeLanguage(lang.code)} style={[styles.langButton, i18n.language === lang.code && styles.langButtonActive]}>
            <Text style={[styles.langText, i18n.language === lang.code && styles.langTextActive]}>{lang.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={{ marginTop: 25 }} onPress={() => navigation.navigate('Home')}>
        <Text style={{ color: COLORS.textGray, textAlign: 'center' }}>← {t('back')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 25, justifyContent: 'center', backgroundColor: '#F8F9FA' },
  mfaContainer: { flex: 1, padding: 30, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F9FA' },
  logo: { alignSelf: 'center', marginBottom: 20 },
  title: { fontSize: 26, fontWeight: 'bold', marginBottom: 10, textAlign: 'center', color: '#333' },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 30 },
  input: { backgroundColor: '#FFF', padding: 15, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#E0E0E0', fontSize: 16 },
  button: { backgroundColor: COLORS.primary, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 10, width: '100%' },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  langRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 35 },
  langButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginHorizontal: 4, backgroundColor: '#FFF', elevation: 1 },
  langButtonActive: { backgroundColor: COLORS.primary },
  langText: { fontSize: 12, fontWeight: 'bold', color: COLORS.textGray },
  langTextActive: { color: COLORS.white },
});

export default LoginScreen;
