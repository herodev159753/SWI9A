import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, FlatList, TouchableOpacity, Image, TextInput, Linking, Alert, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES } from '../constants/theme';
import { useTranslation } from 'react-i18next';
// RateLimiter removed from checkout button flow to prevent browser popup blockers on Web


import { getSecurely, saveSecurely } from '../services/StorageService';
import { createOrderAsync } from '../services/FirebaseService';

const CartScreen = ({ navigation }) => {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';

  const [cartItems, setCartItems] = useState([]);
  const [allProducts, setAllProducts] = useState([]);

  useEffect(() => {
    const loadCart = async () => {
      try {
        // Check 24h expiration
        const cartTimestamp = await getSecurely('cartTimestamp');
        const now = Date.now();
        if (cartTimestamp && (now - parseInt(cartTimestamp)) > 86400000) {
          // Cart expired — clear it
          await saveSecurely('cartItems', JSON.stringify([]));
          await saveSecurely('cartTimestamp', now.toString());
          setCartItems([]);
          Alert.alert(t('cart'), t('cart_expired'));
        } else {
          const data = await getSecurely('cartItems');
          if (data && data !== 'undefined') {
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed)) setCartItems(parsed);
          }
        }
        
        const invData = await getSecurely('products_v1');
        if (invData) setAllProducts(JSON.parse(invData));
      } catch (e) {
        console.error("Cart load error:", e);
        setCartItems([]);
      }
    };
    loadCart();
  }, []);

  const syncCart = async (newItems) => {
    setCartItems(newItems);
    try {
      await saveSecurely('cartItems', JSON.stringify(newItems));
      await saveSecurely('cartTimestamp', Date.now().toString());
    } catch (e) {
      console.error("Cart save error:", e);
    }
  };

  const [buyerName, setBuyerName] = useState('');
  const [buyerAddress, setBuyerAddress] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [honeypot, setHoneypot] = useState('');
  const [errors, setErrors] = useState({});

  const isDummyData = (str) => {
    if (!str) return false;
    const isRepeated = /^(.)\1+$/.test(str.replace(/\s/g, ''));
    const isSequential = /^(123|abc|asd|qwe|zxc|test|1234|123456)/i.test(str.replace(/\s/g, ''));
    return isRepeated || isSequential;
  };

  const itemTotal = cartItems.reduce((sum, item) => {
    let p = item.numericPrice;
    if (p === undefined || p === null) {
      p = typeof item.price === 'string' ? parseFloat(item.price.replace(/[^\d.]/g, '')) : item.price;
    }
    return sum + ((p || 0) * item.quantity);
  }, 0);

  const shippingFee = itemTotal >= 400 || itemTotal === 0 ? 0 : 15;
  const total = itemTotal + shippingFee;
  const amountToFreeShipping = 400 - itemTotal;

  const updateQuantity = (id, delta) => {
    const newItems = cartItems.map(item => {
      if (item.id === id) {
        const newQty = item.quantity + delta;
        return newQty > 0 ? { ...item, quantity: newQty } : item;
      }
      return item;
    });
    syncCart(newItems);
  };

  const removeItem = (id) => {
    const newItems = cartItems.filter(item => item.id !== id);
    syncCart(newItems);
  };

  const isValidMoroccanPhone = (str) => {
    const cleaned = str.replace(/[\s-]/g, '');
    return /^(05|06|07)\d{8}$/.test(cleaned);
  };

  const isValidName = (str) => {
    // Allows letters (Arabic/English) and spaces, 3-40 chars. No numbers.
    return /^[\p{L}\s]{3,40}$/u.test(str.trim());
  };

  const prepareOrderData = () => {
    const errorDetails = {};
    if (!buyerName.trim()) errorDetails.name = t('required_field');
    else if (!isValidName(buyerName) || isDummyData(buyerName)) errorDetails.name = t('invalid_data');
    
    if (!buyerAddress.trim()) errorDetails.address = t('required_field');
    else if (buyerAddress.trim().length < 10 || isDummyData(buyerAddress)) errorDetails.address = t('invalid_data');
    
    if (!buyerPhone.trim()) errorDetails.phone = t('required_field');
    else if (!isValidMoroccanPhone(buyerPhone)) errorDetails.phone = t('invalid_phone');

    setErrors(errorDetails);
    return Object.keys(errorDetails).length === 0;
  };

  const handleOrderSubmission = async (method) => {
    if (!prepareOrderData()) return;

    if (honeypot) {
      Alert.alert('Error', t('bot_detected'));
      return;
    }

    try {
      // 1. Create Order Object for Firestore
      const orderData = {
        customer: buyerName,
        address: buyerAddress,
        phone: buyerPhone,
        paymentMethod: paymentMethod,
        items: cartItems.map(i => ({ id: i.id, name: i.name, names: i.names || null, quantity: i.quantity, price: i.price, numericPrice: i.numericPrice })),
        total: total,
        status: 'Pending',
        source: method
      };

      // 2. Save to Firestore
      await createOrderAsync(orderData);

      // 3. Clear Cart locally
      await saveSecurely('cartItems', JSON.stringify([]));
      setCartItems([]);

      // 4. Build message for WhatsApp/Email
      let message = `🛒 *${t('order_summary')}*\n`;
      message += `━━━━━━━━━━━━━━━\n`;
      cartItems.forEach((item, i) => {
        const parsedPrice = parseFloat(item.price.replace(/[^\d.]/g, '')) || 0;
        message += `${i + 1}. ${t(item.name)} x${item.quantity} = ${parsedPrice * item.quantity} MAD\n`;
      });
      message += `━━━━━━━━━━━━━━━\n`;
      if (shippingFee > 0) {
        message += `🚚 *${t('shipping')}:* ${shippingFee} MAD\n`;
      } else {
        message += `🚚 *${t('shipping')}:* ${t('free_shipping')}\n`;
      }
      message += `💰 *${t('total')}:* ${total} MAD\n\n`;
      message += `👤 *${t('your_info')}*\n`;
      message += `📛 ${t('buyer_name')}: ${buyerName}\n`;
      message += `📍 ${t('buyer_address')}: ${buyerAddress}\n`;
      message += `📞 ${t('buyer_phone')}: ${buyerPhone}\n\n`;
      message += `💳 *${t('payment_method')}:* ${paymentMethod === 'cash' ? t('cash_on_delivery') : t('online_payment')}\n`;

      const encoded = encodeURIComponent(message);
      
      // 5. Open Communication App
      if (method === 'whatsapp') {
        try {
          await Linking.openURL(`https://wa.me/212654298825?text=${encoded}`);
        } catch (e) {
          Alert.alert(t('success'), t('order_saved_whatsapp_failed') || 'Order saved! We will contact you soon. (WhatsApp could not be opened)');
        }
      } else {
        try {
          await Linking.openURL(`mailto:admin@swi9a.com?subject=New Order&body=${encoded}`);
        } catch (e) {
          Alert.alert(t('success'), t('order_saved_whatsapp_failed') || 'Order saved! We will contact you soon.');
        }
      }
    } catch (error) {
      console.error("Order submission error:", error);
      Alert.alert(t('error'), t('order_submission_failed') || 'Failed to submit order. Please try again.');
    }
  };

  const isWeb = Platform.OS === 'web';

  const getCrossSellItem = () => {
    if (cartItems.length === 0 || allProducts.length === 0) return null;
    const lastItem = cartItems[cartItems.length - 1];
    
    // Find item in same category not in cart
    let related = allProducts.find(p => p.category === lastItem.category && !cartItems.some(ci => ci.id === p.id));
    if (!related) {
      related = allProducts.find(p => !cartItems.some(ci => ci.id === p.id));
    }
    return related ? { ...related, triggerItem: lastItem.name } : null;
  };

  const crossSellItem = getCrossSellItem();

  const handleAddCrossSell = async (item) => {
    const freshCart = [...cartItems, { ...item, quantity: 1, numericPrice: parseFloat(item.price.replace(' MAD', '')) }];
    setCartItems(freshCart);
    await saveSecurely('cartItems', JSON.stringify(freshCart));
  };

  const renderContent = () => (
    <View style={{ padding: SIZES.medium, paddingBottom: 100 }}>
      {cartItems.length > 0 ? (
        <>
          {amountToFreeShipping > 0 && (
             <LinearGradient colors={['#FFD54F', '#FFA000']} style={styles.freeShippingBanner}>
                <MaterialCommunityIcons name="truck-fast-outline" size={20} color={COLORS.black} />
                <Text style={styles.freeShippingText}>{t('add_for_free_shipping').replace('{x}', amountToFreeShipping)}</Text>
             </LinearGradient>
          )}

          {cartItems.map(item => (
            <View key={item.id} style={[styles.cartItem, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Image source={{ uri: item.image }} style={styles.itemImage} />
              <View style={[styles.itemInfo, isRTL ? { marginRight: SIZES.medium } : { marginLeft: SIZES.medium }]}>
                <Text style={[styles.itemName, { textAlign: isRTL ? 'right' : 'left' }]}>{t(item.name)}</Text>
                <Text style={[styles.itemPrice, { textAlign: isRTL ? 'right' : 'left' }]}>{item.price} MAD</Text>
              </View>
              <View style={styles.quantityContainer}>
                <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQuantity(item.id, -1)}>
                  <MaterialCommunityIcons name="minus" size={16} color={COLORS.black} />
                </TouchableOpacity>
                <Text style={styles.qtyText}>{item.quantity}</Text>
                <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQuantity(item.id, 1)}>
                  <MaterialCommunityIcons name="plus" size={16} color={COLORS.black} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => removeItem(item.id)} style={{ padding: 5 }}>
                <MaterialCommunityIcons name="delete-outline" size={22} color="#E53935" />
              </TouchableOpacity>
            </View>
          ))}

          <View style={styles.checkoutForm}>
            <TextInput style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} value={honeypot} onChangeText={setHoneypot} placeholder="Leave empty" />
            
            <Text style={[styles.sectionLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{t('your_info')}</Text>
            
            <TextInput style={[styles.input, errors.name && styles.inputError, { textAlign: isRTL ? 'right' : 'left' }]} placeholder={t('buyer_name')} value={buyerName} onChangeText={setBuyerName} />
            {errors.name && <Text style={[styles.errorText, { textAlign: isRTL ? 'right' : 'left' }]}>{errors.name}</Text>}
            
            <TextInput style={[styles.input, errors.address && styles.inputError, { textAlign: isRTL ? 'right' : 'left' }]} placeholder={t('buyer_address')} value={buyerAddress} onChangeText={setBuyerAddress} />
            {errors.address && <Text style={[styles.errorText, { textAlign: isRTL ? 'right' : 'left' }]}>{errors.address}</Text>}
            
            <TextInput style={[styles.input, errors.phone && styles.inputError, { textAlign: isRTL ? 'right' : 'left' }]} placeholder={t('buyer_phone')} value={buyerPhone} onChangeText={setBuyerPhone} keyboardType="phone-pad" />
            {errors.phone && <Text style={[styles.errorText, { textAlign: isRTL ? 'right' : 'left' }]}>{errors.phone}</Text>}

            {/* Payment Method */}
            <Text style={[styles.sectionLabel, { textAlign: isRTL ? 'right' : 'left', marginTop: SIZES.medium }]}>{t('payment_method')}</Text>
            <View style={[styles.paymentRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <TouchableOpacity style={[styles.paymentOption, paymentMethod === 'cash' && styles.paymentActive]} onPress={() => setPaymentMethod('cash')}>
                <MaterialCommunityIcons name="cash" size={22} color={paymentMethod === 'cash' ? COLORS.white : COLORS.primary} />
                <Text style={[styles.paymentText, paymentMethod === 'cash' && styles.paymentTextActive]}>{t('cash_on_delivery')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.paymentOption, paymentMethod === 'online' && styles.paymentActive]} onPress={() => setPaymentMethod('online')}>
                <MaterialCommunityIcons name="credit-card-outline" size={22} color={paymentMethod === 'online' ? COLORS.white : COLORS.primary} />
                <Text style={[styles.paymentText, paymentMethod === 'online' && styles.paymentTextActive]}>{t('online_payment')}</Text>
              </TouchableOpacity>
            </View>

            {/* Total Area */}
            <View style={{ marginVertical: SIZES.medium, paddingTop: SIZES.small, borderTopWidth: 1, borderTopColor: '#E0E0E0' }}>
              <View style={[styles.summaryRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                 <Text style={styles.summaryLabel}>{t('subtotal')}:</Text>
                 <Text style={styles.summaryValue}>{itemTotal} MAD</Text>
              </View>
              <View style={[styles.summaryRow, { flexDirection: isRTL ? 'row-reverse' : 'row', marginTop: 5 }]}>
                 <Text style={styles.summaryLabel}>{t('shipping_fee')}:</Text>
                 <Text style={styles.summaryValue}>{shippingFee === 0 ? t('free_shipping') : `${shippingFee} MAD`}</Text>
              </View>
              <View style={[styles.totalRow, { flexDirection: isRTL ? 'row-reverse' : 'row', borderTopWidth: 0 }]}>
                 <Text style={styles.totalLabel}>{t('total')}:</Text>
                 <Text style={styles.totalValue}>{total} MAD</Text>
              </View>
            </View>

            <TouchableOpacity onPress={() => handleOrderSubmission('whatsapp')} activeOpacity={0.8}>
              <LinearGradient colors={['#25D366', '#128C7E']} style={styles.whatsappBtn}>
                <MaterialCommunityIcons name="whatsapp" size={24} color={COLORS.white} />
                <Text style={styles.whatsappBtnText}>{t('send_order')}</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => handleOrderSubmission('email')} activeOpacity={0.8} style={{ marginTop: 10 }}>
              <LinearGradient colors={['#4285F4', '#0F9D58']} style={styles.whatsappBtn}>
                <MaterialCommunityIcons name="email-outline" size={24} color={COLORS.white} />
                <Text style={styles.whatsappBtnText}>{t('email_order')}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Cross Selling Block */}
          {crossSellItem && (
            <View style={styles.crossSellContainer}>
               <Text style={[styles.crossSellTitle, { textAlign: isRTL ? 'right' : 'left' }]}>
                  {t('customers_also_bought').replace('{item}', t(crossSellItem.triggerItem))}
               </Text>
               <View style={[styles.crossSellCard, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <Image source={{ uri: crossSellItem.image }} style={styles.csImage} />
                  <View style={[styles.csInfo, isRTL ? { marginRight: 10 } : { marginLeft: 10 }]}>
                     <Text style={[styles.csName, { textAlign: isRTL ? 'right' : 'left' }]}>{t(crossSellItem.name)}</Text>
                     <Text style={[styles.csPrice, { textAlign: isRTL ? 'right' : 'left' }]}>{crossSellItem.price}</Text>
                     <TouchableOpacity style={styles.csAddBtn} onPress={() => handleAddCrossSell(crossSellItem)}>
                        <Text style={styles.csAddText}>{t('add_to_cart')}</Text>
                     </TouchableOpacity>
                  </View>
               </View>
            </View>
          )}

        </>
      ) : (
        <Text style={styles.emptyText}>{t('empty_cart')}</Text>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name={isRTL ? 'arrow-right' : 'arrow-left'} size={28} color={COLORS.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('cart')}</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView style={{ flex: 1, backgroundColor: '#F8F9FA' }} contentContainerStyle={{ flexGrow: 1 }}>
        {renderContent()}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { alignItems: 'center', justifyContent: 'space-between', padding: SIZES.medium, paddingTop: Platform.OS === 'web' ? 25 : 50, backgroundColor: COLORS.white, elevation: 2 },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  emptyText: { textAlign: 'center', marginTop: 50, color: COLORS.textGray, fontSize: 16 },
  cartItem: { alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.9)', padding: 14, borderRadius: SIZES.radius, marginBottom: SIZES.medium, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
  itemImage: { width: 70, height: 70, borderRadius: SIZES.base },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: '700', color: COLORS.black },
  itemPrice: { fontSize: 15, color: COLORS.primary, marginTop: 4, fontWeight: '800' },
  quantityContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F0F0', borderRadius: 20, paddingHorizontal: 4, paddingVertical: 2 },
  qtyBtn: { padding: 8 },
  qtyText: { marginHorizontal: 12, fontWeight: '800', fontSize: 16 },
  checkoutForm: { marginTop: SIZES.large, backgroundColor: 'rgba(255, 255, 255, 0.95)', padding: SIZES.medium, borderRadius: 24, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 15, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.3)' },
  sectionLabel: { fontSize: 16, fontWeight: '800', color: COLORS.black, marginBottom: SIZES.small },
  input: { backgroundColor: '#F5F5F5', borderRadius: SIZES.base, padding: 14, marginBottom: 8, fontSize: 14, borderWidth: 1, borderColor: '#E0E0E0' },
  inputError: { borderColor: '#E53935', borderWidth: 2 },
  errorText: { color: '#E53935', fontSize: 11, marginBottom: 10, fontWeight: '600' },
  paymentRow: { justifyContent: 'space-between', marginBottom: SIZES.medium },
  paymentOption: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: SIZES.base, borderWidth: 2, borderColor: COLORS.primary, marginHorizontal: 4 },
  paymentActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  paymentText: { fontSize: 12, fontWeight: '700', color: COLORS.primary, marginLeft: 6 },
  paymentTextActive: { color: COLORS.white },
  summaryRow: { justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 14, color: COLORS.textGray, fontWeight: '600' },
  summaryValue: { fontSize: 14, color: COLORS.black, fontWeight: 'bold' },
  totalRow: { justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E0E0E0' },
  totalLabel: { fontSize: 18, color: COLORS.black, fontWeight: '800' },
  totalValue: { fontSize: 26, fontWeight: '900', color: COLORS.primary },
  whatsappBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: SIZES.radius, marginTop: 5 },
  whatsappBtnText: { color: COLORS.white, fontSize: 16, fontWeight: 'bold', marginLeft: 10 },
  freeShippingBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 10, borderRadius: SIZES.base, marginBottom: SIZES.medium, elevation: 2 },
  freeShippingText: { fontSize: 13, fontWeight: 'bold', color: COLORS.black, marginLeft: 8 },
  crossSellContainer: { marginTop: SIZES.extraLarge, backgroundColor: '#FFF', padding: SIZES.medium, borderRadius: SIZES.radius, elevation: 2 },
  crossSellTitle: { fontSize: 13, fontWeight: 'bold', color: COLORS.textGray, marginBottom: 10 },
  crossSellCard: { backgroundColor: '#F8F9FA', borderRadius: SIZES.base, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#EEE' },
  csImage: { width: 60, height: 60, borderRadius: SIZES.base },
  csInfo: { flex: 1, justifyContent: 'center' },
  csName: { fontSize: 14, fontWeight: 'bold', color: COLORS.black },
  csPrice: { fontSize: 14, color: COLORS.primary, fontWeight: '800', marginTop: 2, marginBottom: 8 },
  csAddBtn: { backgroundColor: COLORS.black, paddingVertical: 6, paddingHorizontal: 15, borderRadius: SIZES.base, alignSelf: 'flex-start' },
  csAddText: { color: COLORS.white, fontSize: 12, fontWeight: 'bold' }
});

export default CartScreen;
