import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TextInput, TouchableOpacity, Alert, Linking, Animated, Dimensions, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { Helmet } from 'react-helmet-async';
import { COLORS, SIZES } from '../constants/theme';
import { getSecurely, saveSecurely } from '../services/StorageService';
import { changeLanguage } from '../services/i18n';

const { width } = Dimensions.get('window');

const HomeScreen = ({ navigation }) => {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  
  const [searchQuery, setSearchQuery] = useState('');
  const [cartCount, setCartCount] = useState(0);
  const [selectedCat, setSelectedCat] = useState('all');
  
  const fadeAnimProducts = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [timeLeft, setTimeLeft] = useState(3600 * 2 + 45 * 60);
  const categoryScrollRef = useRef(null);

  // Initial Seed Data
  const initialData = [
    { id: '1', name: 'fresh_tomatoes', price: '45 MAD', oldPrice: '60 MAD', vendor: 'Ait Melloul Farm', discount: '25%', image: 'https://images.unsplash.com/photo-1546473427-e1ad66663f7a?w=400', category: '1', stock: 45 },
    { id: '2', name: 'organic_spinach', price: '15 MAD', oldPrice: '20 MAD', vendor: 'Ourika Organic', discount: '25%', image: 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=400', category: '1', stock: 12 },
    { id: '3', name: 'handmade_tagine', price: '120 MAD', oldPrice: '150 MAD', vendor: 'Safi Potters', discount: '20%', image: 'https://images.unsplash.com/photo-1581006852262-e4307cf6283a?w=400', category: '4', stock: 3 },
    { id: '4', name: 'berber_carpet', price: '850 MAD', oldPrice: '1200 MAD', vendor: 'Atlas Argan Co', discount: '30%', image: 'https://images.unsplash.com/photo-1579546673203-d168c87ed9d2?w=400', category: '4', stock: 1 },
    { id: '5', name: 'pure_argan_oil', price: '180 MAD', oldPrice: '220 MAD', vendor: 'Souss Cooperatives', discount: '18%', image: 'https://images.unsplash.com/photo-1608248597279-f99d160bfcbc?w=400', category: '3', stock: 15 },
    { id: '6', name: 'lipstick_matte', price: '80 MAD', oldPrice: '120 MAD', vendor: 'Beauty Market', discount: '33%', image: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=400', category: '5', stock: 5 },
  ];

  const [allProduce, setAllProduce] = useState(initialData);
  const [featuredProduce, setFeaturedProduce] = useState(initialData);

  useEffect(() => {
    if (Platform.OS === 'web' && categoryScrollRef.current) {
      const el = categoryScrollRef.current;
      const handleWheel = (e) => {
        if (e.deltaY !== 0) {
          el.scrollLeft += e.deltaY;
          e.preventDefault();
        }
      };
      el.addEventListener('wheel', handleWheel, { passive: false });
      return () => el.removeEventListener('wheel', handleWheel);
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handlePressIn = () => Animated.spring(scaleAnim, { toValue: 0.95, useNativeDriver: true }).start();
  const handlePressOut = () => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();

  const catScaleAnim = useRef(new Animated.Value(1)).current;

  const handleCategorySelect = (id) => {
    if (selectedCat === id) return;
    // Bounce the category icon
    Animated.sequence([
      Animated.spring(catScaleAnim, { toValue: 1.3, friction: 3, useNativeDriver: true }),
      Animated.spring(catScaleAnim, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start();
    // Fade products
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
    } catch (e) {
      console.error("Add to cart error:", e);
      // Fallback increment for UI immediate feedback
      setCartCount(prev => prev + 1);
    }
  };


  useEffect(() => {
    const loadCartCount = async () => {
      try {
        const cartData = await getSecurely('cartItems');
        if (cartData) {
          const cart = JSON.parse(cartData);
          setCartCount(cart.reduce((sum, i) => sum + i.quantity, 0));
        }
      } catch (e) {
        console.error("Home Load Cart Error:", e);
      }
    };
    loadCartCount();
  }, []);

  const categories = [
    { id: 'all', title: t('see_all') || 'All', icon: 'view-grid', color: COLORS.darkGray || '#444' },
    { id: '1', title: t('vegetables'), icon: 'carrot', color: COLORS.primary },
    { id: '2', title: t('clothing'), icon: 'tshirt-crew', color: COLORS.secondary },
    { id: '3', title: t('groceries'), icon: 'basket', color: COLORS.accent },
    { id: '4', title: t('local_crafts'), icon: 'palette', color: '#8E44AD' },
    { id: '5', title: t('makeup'), icon: 'lipstick', color: '#E91E63' },
  ];

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState(null);

  const loadData = async () => {
    try {
      const invData = await getSecurely('products_v1');
      const role = await getSecurely('userRole');
      setUserRole(role);
      if (invData) {
        setAllProduce(JSON.parse(invData));
      } else {
        // Seed initial data
        await saveSecurely('products_v1', JSON.stringify(initialData));
      }

      // Cart 24h expiration check
      const cartTimestamp = await getSecurely('cartTimestamp');
      const now = Date.now();
      if (cartTimestamp && (now - parseInt(cartTimestamp)) > 86400000) {
        await saveSecurely('cartItems', JSON.stringify([]));
        await saveSecurely('cartTimestamp', now.toString());
        setCartCount(0);
      } else {
        const cartData = await getSecurely('cartItems');
        if (cartData) {
          const cart = JSON.parse(cartData);
          setCartCount(cart.reduce((sum, i) => sum + i.quantity, 0));
        }
      }
    } catch (e) {
      console.error("Home Load Error:", e);
    }
  };

  useEffect(() => {
    let filtered = allProduce;
    if (selectedCat !== 'all') {
      filtered = allProduce.filter(p => p.category === selectedCat);
    }
    if (searchQuery) {
      filtered = filtered.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    setFeaturedProduce(filtered);
  }, [selectedCat, searchQuery, allProduce]);

  useEffect(() => {
    loadData();
    // Refresh data when screen is focused (for Web navigation)
    const interval = setInterval(loadData, 3000); 
    return () => clearInterval(interval);
  }, []);

  const languages = [
    { code: 'fr', label: 'FR' },
    { code: 'ar', label: 'AR' },
    { code: 'en', label: 'EN' },
  ];

  const isWeb = Platform.OS === 'web';
  const Container = isWeb ? View : ScrollView;
  const containerProps = isWeb 
    ? { style: { backgroundColor: '#F8F9FA' } } 
    : { style: styles.masterContainer, contentContainerStyle: styles.scrollContent, showsVerticalScrollIndicator: false, bounces: true };

  return (
    <Container {...containerProps}>
      <View style={isWeb ? { flex: 0 } : { flex: 1 }}>
        <Helmet>
          <title>{t('brand_name')} - {t('welcome')}</title>
          <meta name="description" content="Shop fresh vegetables, local clothing, and daily groceries at the best prices with Swi9a." />
        </Helmet>

        {/* Header */}
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

            {userRole === 'admin' && (
              <TouchableOpacity style={[styles.cartButton, { marginLeft: 10, backgroundColor: COLORS.secondary }]} onPress={() => navigation.navigate('AdminDashboard')}>
                 <MaterialCommunityIcons name="cog-outline" size={24} color={COLORS.white} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Search Bar */}
        <View style={[styles.searchContainer, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <MaterialCommunityIcons name="magnify" size={24} color={COLORS.textGray} />
          <TextInput
            style={[styles.searchInput, { textAlign: isRTL ? 'right' : 'left' }]}
            placeholder={t('search_placeholder')}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Categories Section */}
        <View style={styles.sectionContainer}>
          <Text style={[styles.sectionTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('categories')}</Text>
          <ScrollView 
             ref={categoryScrollRef}
             horizontal 
             showsHorizontalScrollIndicator={false} 
             style={{ marginTop: SIZES.small }} 
             contentContainerStyle={{ paddingRight: SIZES.medium, flexDirection: isRTL ? 'row-reverse' : 'row' }}
          >
            {categories.map((item) => (
              <TouchableOpacity key={item.id} style={styles.catWrap} onPress={() => handleCategorySelect(item.id)}>
                  <Animated.View style={selectedCat === item.id ? { transform: [{ scale: catScaleAnim }] } : {}}>
                    <LinearGradient 
                       colors={selectedCat === item.id ? [item.color, item.color + 'EE'] : ['#E0E0E0', '#EEEEEE']} 
                       style={styles.catIconWrap}
                    >
                       <MaterialCommunityIcons name={item.icon} size={28} color={selectedCat === item.id ? COLORS.white : COLORS.textGray} />
                    </LinearGradient>
                  </Animated.View>
                  <Text style={[styles.catText, selectedCat === item.id && styles.catTextActive]}>{item.title}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Flash Sale Banner - navigates to Flash Deals page */}
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

        {/* Dynamic Featured Section */}
        <View style={styles.sectionContainer}>
          <View style={[styles.sectionHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Text style={styles.sectionTitle}>{t('hot_deals')}</Text>
            <TouchableOpacity onPress={() => handleCategorySelect('all')}><Text style={styles.seeAll}>{t('see_all')}</Text></TouchableOpacity>
          </View>
          
          <Animated.View style={[styles.productsGrid, { flexDirection: isRTL ? 'row-reverse' : 'row', opacity: fadeAnimProducts, transform: [{ translateY: fadeAnimProducts.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
            {featuredProduce.length > 0 ? featuredProduce.map((item) => (
              <View key={item.id} style={styles.productCard}>
                <View style={[styles.discountBadge, isRTL ? { right: 10 } : { left: 10 }]}>
                  <Text style={styles.discountText}>{item.discount}</Text>
                </View>
                <Image source={{ uri: item.image }} style={styles.productImage} />
                <View style={styles.productInfo}>
                  <Text style={[styles.productName, { textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>{t(item.name)}</Text>
                  <Text style={[styles.vendorName, { textAlign: isRTL ? 'right' : 'left' }]}>{item.vendor}</Text>
                  <View style={[styles.priceRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <Text style={styles.price}>{item.price}</Text>
                    <Text style={[styles.oldPrice, isRTL ? { marginRight: SIZES.base } : { marginLeft: SIZES.base }]}>{item.oldPrice}</Text>
                  </View>
                  {item.stock !== undefined && item.stock <= 5 && (
                     <Text style={{ color: '#E53935', fontSize: 10, fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left', marginBottom: 6 }}>
                        ⏳ {t('only_x_left').replace('{x}', item.stock)}
                     </Text>
                  )}
                  <TouchableOpacity style={styles.addButton} onPress={() => addToCart(item)}>
                    <Text style={styles.addButtonText}>{t('add')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )) : (
              <Text style={{ textAlign: 'center', width: '100%', marginVertical: 30, color: COLORS.textGray }}>No items found for this category.</Text>
            )}
          </Animated.View>
        </View>
        
        {/* Call to Action CTA */}
        <TouchableOpacity style={styles.ctaContainer} onPress={() => Linking.openURL(`https://wa.me/212654298825?text=${encodeURIComponent(t('support_message'))}`)}>
          <LinearGradient colors={COLORS.gradientFresh || ['#11998E', '#38EF7D']} start={{x: 0, y: 0}} end={{x: 1, y: 1}} style={[styles.ctaGradient, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
             <MaterialCommunityIcons name="whatsapp" size={32} color={COLORS.white} />
             <View style={[styles.ctaTextWrap, isRTL ? { marginRight: SIZES.medium } : { marginLeft: SIZES.medium }]}>
                <Text style={[styles.ctaTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('quick_order_whatsapp')}</Text>
                <Text style={[styles.ctaSub, { textAlign: isRTL ? 'right' : 'left' }]}>{t('order_direct')}</Text>
             </View>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </Container>
  );
};

const styles = StyleSheet.create({
  masterContainer: { 
    flex: 1, 
    backgroundColor: COLORS.gray, 
    width: '100%',
  },
  scrollArea: { 
    flex: 1,
  },
  scrollContent: { 
    paddingBottom: 150, 
  },
  header: { 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: SIZES.medium, 
    paddingTop: Platform.OS === 'web' ? 25 : 50, 
    paddingBottom: SIZES.base, 
    backgroundColor: COLORS.gray, 
    zIndex: 10,
    width: '100%'
  },
  headerTitles: { flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  welcomeText: { fontSize: 13, color: COLORS.textGray, marginBottom: 2 },
  brandName: { fontSize: 20, fontWeight: '900', color: COLORS.black, letterSpacing: -0.5 },
  langSwitcher: { flexDirection: 'row', backgroundColor: COLORS.white, borderRadius: SIZES.base, padding: 2, marginHorizontal: SIZES.small, elevation: 2, flexShrink: 0 },
  langButton: { paddingHorizontal: 6, paddingVertical: 4, borderRadius: 4 },
  langButtonActive: { backgroundColor: COLORS.primary },
  langText: { fontSize: 10, fontWeight: 'bold', color: COLORS.textGray },
  langTextActive: { color: COLORS.white },
  cartButton: { width: 44, height: 44, backgroundColor: COLORS.white, borderRadius: 22, alignItems: 'center', justifyContent: 'center', elevation: 2 },
  cartBadge: { position: 'absolute', top: -2, right: -2, backgroundColor: COLORS.secondary, borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.white },
  cartBadgeText: { color: COLORS.white, fontSize: 10, fontWeight: 'bold' },
  searchContainer: { alignItems: 'center', backgroundColor: COLORS.white, marginHorizontal: SIZES.medium, paddingHorizontal: SIZES.medium, borderRadius: SIZES.radius, height: 55, elevation: 4, shadowColor: '#000', shadowOffset: {width:0, height:2}, shadowOpacity: 0.05, shadowRadius: 5 },
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
  // Harden text column to prevent overlap
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
  addButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: 12, letterSpacing: 0.5 },
  ctaContainer: { marginHorizontal: SIZES.medium, marginTop: SIZES.large, borderRadius: SIZES.radius, overflow: 'hidden', elevation: 3 },
  ctaGradient: { alignItems: 'center', padding: SIZES.medium },
  ctaTextWrap: { flex: 1 },
  ctaTitle: { color: COLORS.white, fontSize: 16, fontWeight: 'bold' },
  ctaSub: { color: COLORS.white, fontSize: 12, opacity: 0.9 }
});

export default HomeScreen;
