import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../services/i18n';
import { COLORS, SIZES } from '../constants/theme';
import { getSecurely, saveSecurely } from '../services/StorageService';
import ProductTimer from '../components/ProductTimer';

const FlashDealsScreen = ({ navigation }) => {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const [timeLeft, setTimeLeft] = useState(3600 * 2 + 45 * 60);
  const [cartCount, setCartCount] = useState(0);

  const languages = [
    { code: 'fr', label: 'FR' },
    { code: 'ar', label: 'AR' },
    { code: 'en', label: 'EN' },
  ];

  const loadCartCount = async () => {
    try {
      const cartData = await getSecurely('cartItems');
      if (cartData && cartData !== 'undefined') {
        const parsedCart = JSON.parse(cartData);
        if (Array.isArray(parsedCart)) {
          setCartCount(parsedCart.reduce((sum, item) => sum + (item.quantity || 1), 0));
        }
      }
    } catch {}
  };

  useEffect(() => {
    const timer = setInterval(() => setTimeLeft(prev => (prev > 0 ? prev - 1 : 0)), 1000);
    const cartPoller = setInterval(loadCartCount, 2000);
    loadCartCount();
    return () => {
      clearInterval(timer);
      clearInterval(cartPoller);
    };
  }, []);

  const formatTime = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}`;
  };

  const [deals, setDeals] = useState([]);

  useEffect(() => {
    const loadDeals = async () => {
      const data = await getSecurely('products_v1');
      if (data) {
        let products = JSON.parse(data);
        let changed = false;
        const now = Date.now();

        const updated = products.map(p => {
          if (p.saleEndsAt && now > p.saleEndsAt) {
            changed = true;
            return {
              ...p,
              discount: '',
              price: p.oldPrice || p.price,
              oldPrice: null,
              saleEndsAt: null
            };
          }
          return p;
        });

        if (changed) {
          await saveSecurely('products_v1', JSON.stringify(updated));
          products = updated;
        }

        const flashDeals = products.filter(p => p.discount && p.discount.length > 0 && p.discount !== '0%');
        setDeals(flashDeals);
      }
    };
    loadDeals();
    const interval = setInterval(loadDeals, 5000); // Polling for updates
    return () => clearInterval(interval);
  }, []);

  const addToCart = async (item) => {
    try {
      const cartData = await getSecurely('cartItems');
      let cart = cartData ? JSON.parse(cartData) : [];
      const existing = cart.find(i => i.id === item.id);
      if (existing) {
        existing.quantity += 1;
      } else {
        cart.push({ ...item, quantity: 1, numericPrice: parseFloat(item.price.replace(' MAD', '')) });
      }
      await saveSecurely('cartItems', JSON.stringify(cart));
      await loadCartCount();
      Alert.alert('✅', t('added_to_cart'));
    } catch (e) {
      console.error("Flash add error:", e);
    }
  };

  const isWeb = Platform.OS === 'web';
  const Container = isWeb ? View : ScrollView;
  const containerProps = isWeb
    ? { style: { backgroundColor: '#F8F9FA', minHeight: '100vh' } }
    : { style: styles.container, contentContainerStyle: { paddingBottom: 100 } };

  return (
    <Container {...containerProps}>
      <View style={isWeb ? { flex: 0 } : { flex: 1 }}>
        {/* Header */}
        <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <MaterialCommunityIcons name={isRTL ? 'arrow-right' : 'arrow-left'} size={28} color={COLORS.black} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { flex: 1, textAlign: 'center' }]}>{t('flash_sale')}</Text>
          <View style={[styles.headerRight, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <View style={[styles.langSwitcher, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              {languages.map((lang) => (
                <TouchableOpacity key={lang.code} onPress={() => changeLanguage(lang.code)} style={[styles.langButton, i18n.language === lang.code && styles.langButtonActive]}>
                  <Text style={[styles.langText, i18n.language === lang.code && styles.langTextActive]}>{lang.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[styles.cartButton, { marginLeft: 10 }]} onPress={() => navigation.navigate('Cart')}>
               <MaterialCommunityIcons name="cart-outline" size={24} color={COLORS.black} />
               {cartCount > 0 && (
                 <View style={styles.cartBadge}><Text style={styles.cartBadgeText}>{cartCount}</Text></View>
               )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Timer Banner */}
        <LinearGradient colors={COLORS.gradientSale || ['#FF416C', '#FF4B2B']} style={styles.timerBanner}>
          <Text style={styles.timerLabel}>{t('flash_sale')}</Text>
          <View style={styles.timerBox}>
            <Text style={styles.timerText}>{t('ends_in')} {formatTime(timeLeft)}</Text>
          </View>
        </LinearGradient>

        {/* Deals Grid */}
        <View style={[styles.grid, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {deals.map(item => (
            <View key={item.id} style={styles.card}>
              <View style={[styles.badge, isRTL ? { right: 8 } : { left: 8 }]}>
                <Text style={styles.badgeText}>-{item.discount.replace(' OFF', '')} {t('discount_label')}</Text>
              </View>
              {item.saleEndsAt && (
                <View style={[styles.cardTimerOverlay, isRTL ? { left: 5 } : { right: 5 }]}>
                   <ProductTimer endsAt={item.saleEndsAt} onExpire={loadDeals} />
                </View>
              )}
              <Image source={{ uri: item.image }} style={styles.cardImage} />
              <View style={styles.cardInfo}>
                <Text style={[styles.cardName, { textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
                  {item.names ? (item.names[i18n.language] || item.names['fr'] || item.name) : (t(item.name) || item.name)}
                </Text>
                {item.unit && (
                  <Text style={{ fontSize: 10, color: '#888', marginBottom: 2, textAlign: isRTL ? 'right' : 'left' }}>
                    {item.unit}
                  </Text>
                )}
                <View style={[styles.priceRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <Text style={styles.price}>{item.price}</Text>
                  {item.oldPrice && <Text style={styles.oldPrice}>{item.oldPrice}</Text>}
                </View>
                <TouchableOpacity style={styles.addBtn} onPress={() => addToCart(item)}>
                  <Text style={styles.addBtnText}>{t('add')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      </View>
    </Container>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { alignItems: 'center', justifyContent: 'space-between', padding: SIZES.medium, paddingTop: Platform.OS === 'web' ? 25 : 50, backgroundColor: COLORS.white, elevation: 2 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.black },
  headerRight: { alignItems: 'center' },
  langSwitcher: { backgroundColor: '#F0F0F0', borderRadius: 8, padding: 2 },
  langButton: { paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6 },
  langButtonActive: { backgroundColor: COLORS.primary },
  langText: { fontSize: 10, fontWeight: 'bold', color: COLORS.textGray },
  langTextActive: { color: COLORS.white },
  cartButton: { backgroundColor: '#F0F0F0', padding: 8, borderRadius: 50, position: 'relative' },
  cartBadge: { position: 'absolute', top: -5, right: -5, backgroundColor: '#E53935', borderRadius: 10, width: 18, height: 18, justifyContent: 'center', alignItems: 'center' },
  cartBadgeText: { color: COLORS.white, fontSize: 10, fontWeight: 'bold' },
  timerBanner: { margin: SIZES.medium, padding: SIZES.medium, borderRadius: SIZES.radius, alignItems: 'center' },
  timerLabel: { color: COLORS.white, fontSize: 22, fontWeight: '900', marginBottom: 8 },
  timerBox: { backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20 },
  timerText: { color: COLORS.white, fontWeight: 'bold', fontSize: 16 },
  grid: { flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: SIZES.medium },
  card: { width: '48%', backgroundColor: COLORS.white, borderRadius: SIZES.radius, marginBottom: SIZES.medium, overflow: 'hidden', elevation: 3 },
  badge: { position: 'absolute', top: 8, backgroundColor: '#E53935', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, zIndex: 10 },
  badgeText: { color: COLORS.white, fontSize: 11, fontWeight: 'bold' },
  cardImage: { width: '100%', height: 140 },
  cardInfo: { padding: SIZES.small },
  cardName: { fontWeight: '700', fontSize: 14, color: COLORS.black, marginBottom: 4 },
  priceRow: { alignItems: 'center', marginBottom: 8 },
  price: { fontSize: 15, fontWeight: '900', color: COLORS.primary },
  oldPrice: { fontSize: 11, color: COLORS.textGray, textDecorationLine: 'line-through', marginHorizontal: 6 },
  addBtnText: { color: COLORS.white, fontWeight: 'bold', fontSize: 12 },
  cardTimerOverlay: { position: 'absolute', top: 5, zIndex: 12 },
});

export default FlashDealsScreen;
