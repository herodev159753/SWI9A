import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TextInput, TouchableOpacity, Alert, Linking, Animated, Dimensions, Platform, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { Helmet } from 'react-helmet-async';
import { COLORS, SIZES } from '../constants/theme';
import { getSecurely, saveSecurely } from '../services/StorageService';
import { listenToCategories, listenToInventory } from '../services/FirebaseService';
import { changeLanguage } from '../services/i18n';
import ProductTimer from '../components/ProductTimer';

const HomeScreen = ({ navigation }) => {
  const { t, i18n } = useTranslation();
  const { width } = useWindowDimensions();
  const isMobile = width < 480;
  const isRTL = i18n.language === 'ar';
  
  const [searchQuery, setSearchQuery] = useState('');
  const [cartCount, setCartCount] = useState(0);
  const [selectedCat, setSelectedCat] = useState('all');
  const [timeLeft, setTimeLeft] = useState(0);
  const [dynamicCats, setDynamicCats] = useState([]);
  const [showScrollArrow, setShowScrollArrow] = useState(true);
  const scrollArrowAnim = useRef(new Animated.Value(0)).current;
  const categoryScrollRef = useRef(null);
  const [allProduce, setAllProduce] = useState([]);
  const [featuredProduce, setFeaturedProduce] = useState([]);
  const [userRole, setUserRole] = useState(null);

  const catScaleAnim = useRef(new Animated.Value(1)).current;
  const fadeAnimProducts = useRef(new Animated.Value(1)).current;

  const languages = [
    { code: 'fr', label: 'FR' },
    { code: 'ar', label: 'AR' },
    { code: 'en', label: 'EN' },
  ];

  useEffect(() => {
    if (showScrollArrow) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scrollArrowAnim, { toValue: 10, duration: 800, useNativeDriver: true }),
          Animated.timing(scrollArrowAnim, { toValue: 0, duration: 800, useNativeDriver: true })
        ])
      ).start();
    }
  }, [showScrollArrow]);

  useEffect(() => {
    const timer = setInterval(() => {
      const flashWithEnds = allProduce.filter(p => p.saleEndsAt && p.saleEndsAt > Date.now());
      if (flashWithEnds.length > 0) {
        const maxTime = Math.max(...flashWithEnds.map(p => p.saleEndsAt));
        const diff = Math.floor((maxTime - Date.now()) / 1000);
        setTimeLeft(diff > 0 ? diff : 0);
      } else {
        setTimeLeft(0);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [allProduce]);

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleCategorySelect = (id) => {
    if (selectedCat === id) return;
    Animated.sequence([
      Animated.spring(catScaleAnim, { toValue: 1.3, friction: 3, useNativeDriver: true }),
      Animated.spring(catScaleAnim, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start();
    Animated.timing(fadeAnimProducts, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setSelectedCat(id);
      Animated.spring(fadeAnimProducts, { toValue: 1, friction: 6, useNativeDriver: true }).start();
    });
  };

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
      await saveSecurely('cartTimestamp', Date.now().toString());
      setCartCount(cart.reduce((sum, i) => sum + i.quantity, 0));
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    const loadState = async () => {
      const role = await getSecurely('userRole');
      setUserRole(role);
      const cartData = await getSecurely('cartItems');
      if (cartData) {
        const cart = JSON.parse(cartData);
        setCartCount(cart.reduce((sum, i) => sum + i.quantity, 0));
      }
    };
    loadState();

    const unsubInv = listenToInventory((data) => {
      setAllProduce(data);
    });

    const unsubCats = listenToCategories((data) => {
      setDynamicCats(data);
    });

    return () => {
      if (unsubInv) unsubInv();
      if (unsubCats) unsubCats();
    };
  }, []);

  useEffect(() => {
    let filtered = allProduce;
    if (selectedCat !== 'all') {
      filtered = allProduce.filter(p => p.category === selectedCat);
    }
    if (searchQuery) {
      filtered = filtered.filter(p => {
        const name = p.names ? (p.names[i18n.language] || p.names['fr'] || p.name) : p.name;
        return name.toLowerCase().includes(searchQuery.toLowerCase());
      });
    }
    setFeaturedProduce(filtered);
  }, [selectedCat, searchQuery, allProduce, i18n.language]);

  const categories = [
    { id: 'all', title: t('see_all') || 'All', icon: 'view-grid', color: COLORS.darkGray || '#444' },
    ...dynamicCats
      .filter(c => c.visible !== false)
      .map(c => ({
        id: c.id,
        title: c.names ? (c.names[i18n.language] || c.names['fr'] || c.id) : c.id,
        icon: c.icon || 'tag',
        color: c.color || '#999',
      }))
  ];

  const isWeb = Platform.OS === 'web';
  const Container = isWeb ? View : ScrollView;
  const containerProps = isWeb 
    ? { style: { backgroundColor: '#F8F9FA', flex: 1 } } 
    : { style: styles.masterContainer, contentContainerStyle: styles.scrollContent, showsVerticalScrollIndicator: false };

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      <Container {...containerProps}>
        <View style={isWeb ? { flex: 1, overflow: 'auto' } : { flex: 1 }}>
          <Helmet>
            <title>{t('brand_name')}</title>
          </Helmet>

          <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <View style={[styles.headerTitles, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
              <Text style={[styles.welcomeText, { textAlign: isRTL ? 'right' : 'left' }]}>{t('welcome')} 👋</Text>
              <Text style={[styles.brandName, { textAlign: isRTL ? 'right' : 'left' }]}>{t('brand_name')}</Text>
            </View>
            <View style={[styles.headerRight, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={[styles.langSwitcher, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                {languages.map((lang) => (
                  <TouchableOpacity
                    key={lang.code}
                    onPress={() => changeLanguage(lang.code)}
                    style={[styles.langButton, i18n.language === lang.code && styles.langButtonActive]}
                  >
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
              {(userRole === 'admin' || userRole === 'owner') && (
                <TouchableOpacity style={[styles.cartButton, { marginLeft: 10, backgroundColor: COLORS.secondary }]} onPress={() => navigation.navigate('AdminDashboard')}>
                   <MaterialCommunityIcons name="cog-outline" size={24} color={COLORS.white} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={[styles.searchContainer, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <MaterialCommunityIcons name="magnify" size={24} color={COLORS.textGray} />
            <TextInput
              style={[styles.searchInput, { textAlign: isRTL ? 'right' : 'left' }]}
              placeholder={t('search_placeholder')}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          <View style={styles.sectionContainer}>
            <Text style={[styles.sectionTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('categories')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: SIZES.small }} contentContainerStyle={{ paddingRight: SIZES.medium, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
              {categories.map((item) => (
                <TouchableOpacity key={item.id} style={styles.catWrap} onPress={() => handleCategorySelect(item.id)}>
                  <Animated.View style={selectedCat === item.id ? { transform: [{ scale: catScaleAnim }] } : {}}>
                    <LinearGradient colors={selectedCat === item.id ? [item.color, item.color + 'EE'] : ['#E0E0E0', '#EEEEEE']} style={styles.catIconWrap}>
                      <MaterialCommunityIcons name={item.icon} size={28} color={selectedCat === item.id ? COLORS.white : COLORS.textGray} />
                    </LinearGradient>
                  </Animated.View>
                  <Text style={[styles.catText, selectedCat === item.id && styles.catTextActive]}>{item.title}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.bannerContainer}>
            <TouchableOpacity activeOpacity={0.9} onPress={() => navigation.navigate('FlashDeals')}>
              <LinearGradient colors={COLORS.gradientSale} start={{x: 0, y: 0}} end={{x: 1, y: 1}} style={[styles.bannerGradient, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <View style={[styles.bannerTextColumn, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                  <Text style={[styles.bannerTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('flash_sale')}</Text>
                  <Text style={[styles.bannerSubtitle, { textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={2}>{t('flash_desc')}</Text>
                  <View style={[styles.timerWrap, { alignSelf: isRTL ? 'flex-end' : 'flex-start' }]}>
                    <Text style={styles.timerText}>{t('ends_in')} {formatTime(timeLeft)}</Text>
                  </View>
                </View>
                <View style={styles.bannerImageColumn}>
                   <Image source={{uri: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=200'}} style={styles.bannerImage} />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <View style={styles.sectionContainer}>
            <View style={[styles.sectionHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Text style={styles.sectionTitle}>{t('hot_deals')}</Text>
              <TouchableOpacity onPress={() => handleCategorySelect('all')}><Text style={styles.seeAll}>{t('see_all')}</Text></TouchableOpacity>
            </View>
            <Animated.View style={[styles.productsGrid, { flexDirection: isRTL ? 'row-reverse' : 'row', opacity: fadeAnimProducts }]}>
              {featuredProduce.map((item) => (
                <View key={item.id} style={styles.productCard}>
                  {item.discount && item.discount !== '' && item.discount !== '0%' && (
                    <View style={[styles.discountBadge, isRTL ? { right: 10 } : { left: 10 }]}>
                      <Text style={styles.discountText}>{item.discount.replace(' OFF', '')} {t('discount_label')}</Text>
                    </View>
                  )}
                  {item.saleEndsAt && (
                     <View style={[styles.cardTimerOverlay, isRTL ? { left: 5 } : { right: 5 }]}>
                        <ProductTimer endsAt={item.saleEndsAt} onExpire={() => {}} />
                     </View>
                  )}
                  <Image source={{ uri: item.image }} style={styles.productImage} />
                  <View style={styles.productInfo}>
                    <Text style={[styles.productName, { textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
                      {item.names ? (item.names[i18n.language] || item.names['fr'] || item.name) : t(item.name)}
                    </Text>
                    {item.unit && <Text style={{ fontSize: 10, color: COLORS.textGray, textAlign: isRTL ? 'right' : 'left', marginBottom: 2 }}>{item.unit}</Text>}
                    <Text style={[styles.vendorName, { textAlign: isRTL ? 'right' : 'left' }]}>{item.vendor}</Text>
                    <View style={[styles.priceRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                      <Text style={styles.price}>{item.price}</Text>
                      <Text style={[styles.oldPrice, isRTL ? { marginRight: SIZES.base } : { marginLeft: SIZES.base }]}>{item.oldPrice}</Text>
                    </View>
                    <TouchableOpacity style={styles.addButton} onPress={() => addToCart(item)}>
                      <Text style={styles.addButtonText}>{t('add')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </Animated.View>
          </View>

          <TouchableOpacity style={styles.ctaContainer} onPress={() => Linking.openURL(`https://wa.me/212654298825?text=${encodeURIComponent(t('support_message'))}`)}>
            <LinearGradient colors={['#11998E', '#38EF7D']} start={{x: 0, y: 0}} end={{x: 1, y: 1}} style={[styles.ctaGradient, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
               <MaterialCommunityIcons name="whatsapp" size={32} color={COLORS.white} />
               <View style={[styles.ctaTextWrap, isRTL ? { marginRight: SIZES.medium } : { marginLeft: SIZES.medium }]}>
                  <Text style={[styles.ctaTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('quick_order_whatsapp')}</Text>
                  <Text style={[styles.ctaSub, { textAlign: isRTL ? 'right' : 'left' }]}>{t('order_direct')}</Text>
               </View>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </Container>
      {cartCount > 0 && (
        <TouchableOpacity style={[styles.fab, isRTL ? { left: 20 } : { right: 20 }]} onPress={() => navigation.navigate('Cart')}>
          <MaterialCommunityIcons name="cart-outline" size={28} color={COLORS.white} />
          <View style={styles.fabBadge}><Text style={styles.fabBadgeText}>{cartCount}</Text></View>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  masterContainer: { flex: 1, backgroundColor: COLORS.gray, width: '100%' },
  scrollContent: { paddingBottom: 150 },
  header: { justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SIZES.medium, paddingTop: Platform.OS === 'web' ? 25 : 50, paddingBottom: SIZES.base, backgroundColor: COLORS.gray, zIndex: 10, width: '100%' },
  headerTitles: { flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  welcomeText: { fontSize: 13, color: COLORS.textGray, marginBottom: 2 },
  brandName: { fontSize: 20, fontWeight: '900', color: COLORS.black },
  langSwitcher: { flexDirection: 'row', backgroundColor: COLORS.white, borderRadius: SIZES.base, padding: 2, marginHorizontal: SIZES.small, elevation: 2 },
  langButton: { paddingHorizontal: 6, paddingVertical: 4, borderRadius: 4 },
  langButtonActive: { backgroundColor: COLORS.primary },
  langText: { fontSize: 10, fontWeight: 'bold', color: COLORS.textGray },
  langTextActive: { color: COLORS.white },
  cartButton: { width: 44, height: 44, backgroundColor: COLORS.white, borderRadius: 22, alignItems: 'center', justifyContent: 'center', elevation: 2 },
  cartBadge: { position: 'absolute', top: -2, right: -2, backgroundColor: COLORS.secondary, borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.white },
  cartBadgeText: { color: COLORS.white, fontSize: 10, fontWeight: 'bold' },
  searchContainer: { alignItems: 'center', backgroundColor: COLORS.white, marginHorizontal: SIZES.medium, paddingHorizontal: SIZES.medium, borderRadius: SIZES.radius, height: 55, elevation: 4 },
  searchInput: { flex: 1, marginHorizontal: SIZES.base, fontSize: SIZES.medium, color: COLORS.black },
  sectionContainer: { marginTop: SIZES.large, paddingHorizontal: SIZES.medium },
  sectionHeader: { justifyContent: 'space-between', alignItems: 'center', marginBottom: SIZES.medium },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: COLORS.black },
  seeAll: { color: COLORS.primary, fontWeight: '700', fontSize: 14 },
  catWrap: { alignItems: 'center', marginHorizontal: 8, width: 70 },
  catIconWrap: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 8, elevation: 3 },
  catText: { fontSize: 12, fontWeight: '600', color: COLORS.textGray, textAlign: 'center' },
  catTextActive: { color: COLORS.primary, fontWeight: 'bold' },
  bannerContainer: { marginHorizontal: SIZES.medium, marginTop: SIZES.extraLarge, borderRadius: SIZES.radius, overflow: 'hidden', elevation: 5 },
  bannerGradient: { padding: SIZES.medium, alignItems: 'center', justifyContent: 'space-between', minHeight: 120 },
  bannerTextColumn: { flex: 1.5, paddingHorizontal: 10, justifyContent: 'center' },
  bannerImageColumn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bannerTitle: { color: COLORS.white, fontSize: 20, fontWeight: '900', fontStyle: 'italic', marginBottom: 4 },
  bannerSubtitle: { color: COLORS.white, fontSize: 13, fontWeight: '500', marginBottom: 12 },
  timerWrap: { backgroundColor: 'rgba(0,0,0,0.25)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  timerText: { color: COLORS.white, fontWeight: 'bold', fontSize: 12 },
  bannerImage: { width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(255,255,255,0.2)' },
  productsGrid: { flexWrap: 'wrap', justifyContent: 'space-between' },
  productCard: { width: '48%', backgroundColor: COLORS.white, borderRadius: SIZES.radius, marginBottom: SIZES.medium, paddingBottom: SIZES.small, overflow: 'hidden', elevation: 3 },
  discountBadge: { position: 'absolute', top: 10, backgroundColor: COLORS.danger, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, zIndex: 10 },
  discountText: { color: COLORS.white, fontSize: 10, fontWeight: 'bold' },
  productImage: { width: '100%', height: 130 },
  productInfo: { padding: SIZES.small },
  productName: { fontWeight: '700', fontSize: 14, color: COLORS.black },
  vendorName: { fontSize: 11, color: COLORS.textGray, marginBottom: 4 },
  priceRow: { alignItems: 'center', marginBottom: SIZES.small, flexWrap: 'wrap' },
  price: { fontSize: 14, fontWeight: '900', color: COLORS.primary },
  oldPrice: { fontSize: 11, color: COLORS.textGray, textDecorationLine: 'line-through' },
  addButton: { backgroundColor: COLORS.black, paddingVertical: 8, borderRadius: SIZES.base, alignItems: 'center', marginTop: 'auto' },
  addButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: 12 },
  ctaContainer: { marginHorizontal: SIZES.medium, marginTop: SIZES.large, borderRadius: SIZES.radius, overflow: 'hidden', elevation: 3 },
  ctaGradient: { alignItems: 'center', padding: SIZES.medium },
  ctaTextWrap: { flex: 1 },
  ctaTitle: { color: COLORS.white, fontSize: 16, fontWeight: 'bold' },
  ctaSub: { color: COLORS.white, fontSize: 12, opacity: 0.9 },
  itemTimer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.danger, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#FFF' },
  itemTimerText: { color: '#FFF', fontSize: 12, fontWeight: '900', marginLeft: 4 },
  cardTimerOverlay: { position: 'absolute', top: 10, zIndex: 12 },
  fab: { position: Platform.OS === 'web' ? 'fixed' : 'absolute', bottom: 30, width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', elevation: 8, zIndex: 100 },
  fabBadge: { position: 'absolute', top: -5, right: -5, backgroundColor: COLORS.danger, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.white },
  fabBadgeText: { color: COLORS.white, fontSize: 12, fontWeight: 'bold' }
});

export default HomeScreen;
