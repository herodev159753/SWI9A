import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Platform, Linking, useWindowDimensions
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { getSecurely, saveSecurely, deleteSecurely } from '../services/StorageService';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { changeLanguage } from '../services/i18n';
import { listenToOrders, updateOrderStatusAsync } from '../services/FirebaseService';
import { logAdminAction } from '../services/AuditService';

const DriverDashboardScreen = ({ navigation }) => {
  const { t, i18n } = useTranslation();
  const { logout } = useAuth();
  const { width } = useWindowDimensions();
  const isMobile = width < 480;
  const isRTL = i18n.language === 'ar';

  const [driverName, setDriverName] = useState('');
  const [driverId, setDriverId] = useState('');
  const [orders, setOrders] = useState([]);
  const [myOrders, setMyOrders] = useState([]);
  const [activeTab, setActiveTab] = useState('available'); // available | mine | done
  const [isLoading, setIsLoading] = useState(true);
  const [returnReason, setReturnReason] = useState({});
  const [showReturnInput, setShowReturnInput] = useState({});

  const languages = [
    { code: 'fr', label: 'FR' },
    { code: 'ar', label: 'AR' },
    { code: 'en', label: 'EN' },
  ];

  useEffect(() => {
    const init = async () => {
      const name = await getSecurely('userName');
      const id = await getSecurely('userId');
      setDriverName(name || 'Driver');
      setDriverId(id || 'd_unknown');
    };
    init();

    const unsub = listenToOrders((allOrders) => {
      setOrders(allOrders);
      setIsLoading(false);
    });
    return () => { if (unsub) unsub(); };
  }, []);

  // Orders not yet claimed by anyone
  const availableOrders = orders.filter(
    o => o.status === 'Pending' && !o.driverId
  );

  // Orders claimed by this driver
  const myActiveOrders = orders.filter(
    o => o.driverId === driverId && o.status === 'Out for Delivery'
  );

  // Orders completed or returned by this driver
  const myDoneOrders = orders.filter(
    o => o.driverId === driverId && (o.status === 'Completed' || o.status === 'Returned')
  );

  const handleClaimOrder = async (orderId) => {
    try {
      const { updateOrderStatusAsync: _ , assignOrderDriverAsync } = require('../services/FirebaseService');
      // Update locally via mock
      const users = orders.map(o => {
        if (o.id === orderId) {
          return { ...o, driverId, driver: driverName, status: 'Out for Delivery' };
        }
        return o;
      });
      setOrders(users);

      // Persist to mock store
      const stored = await getSecurely('mock_orders');
      if (stored) {
        const arr = JSON.parse(stored);
        const updated = arr.map(o => o.id === orderId
          ? { ...o, driverId, driver: driverName, status: 'Out for Delivery' }
          : o
        );
        await saveSecurely('mock_orders', JSON.stringify(updated));
      }

      await logAdminAction(driverId, 'CLAIM_ORDER', { orderId, driver: driverName });
      Alert.alert(t('success'), t('order_claimed'));
    } catch (e) {
      Alert.alert(t('error'), e.message);
    }
  };

  const handleMarkDelivered = async (orderId) => {
    try {
      await updateOrderStatusAsync(orderId, 'Completed');
      await logAdminAction(driverId, 'ORDER_DELIVERED', { orderId });
      Alert.alert(t('success'), t('order_delivered'));
    } catch (e) {
      Alert.alert(t('error'), e.message);
    }
  };

  const handleMarkReturned = async (orderId) => {
    const reason = returnReason[orderId];
    if (!reason || reason.trim().length < 3) {
      return Alert.alert(t('error'), t('return_reason_required'));
    }
    try {
      await updateOrderStatusAsync(orderId, 'Returned');
      // Store return reason
      const key = `return_reason_${orderId}`;
      await saveSecurely(key, reason.trim());
      await logAdminAction(driverId, 'ORDER_RETURNED', { orderId, reason });
      setShowReturnInput(prev => ({ ...prev, [orderId]: false }));
      Alert.alert(t('success'), t('order_returned'));
    } catch (e) {
      Alert.alert(t('error'), e.message);
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  const openGPS = (lat, lng) => {
    if (!lat || !lng) return;
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
  };

  const renderAvailableOrder = (order) => (
    <View key={order.id} style={styles.orderCard}>
      <View style={[styles.orderHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Text style={styles.orderId}>{t('order_id')} #{order.id?.slice(-6)}</Text>
        <View style={[styles.badge, { backgroundColor: '#FFF3E0' }]}>
          <Text style={{ color: '#E65100', fontSize: 11, fontWeight: '700' }}>{t('pending')}</Text>
        </View>
      </View>
      <Text style={[styles.customerText, { textAlign: isRTL ? 'right' : 'left' }]}>
        👤 {order.customer || t('customer')}
      </Text>
      <Text style={[styles.itemsText, { textAlign: isRTL ? 'right' : 'left' }]}>
        📦 {(order.items || []).length} {t('items_count')}
      </Text>
      <View style={[styles.cardActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity style={styles.gpsBtn} onPress={() => openGPS(order.location?.lat, order.location?.lng)}>
          <MaterialCommunityIcons name="google-maps" size={16} color="#FFF" />
          <Text style={styles.gpsBtnText}>{t('gps_view')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.claimBtn} onPress={() => handleClaimOrder(order.id)}>
          <MaterialCommunityIcons name="hand-pointing-up" size={16} color="#FFF" />
          <Text style={styles.claimBtnText}>{t('claim_order')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderMyOrder = (order) => (
    <View key={order.id} style={[styles.orderCard, { borderLeftColor: '#FF9800', borderLeftWidth: 4 }]}>
      <View style={[styles.orderHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Text style={styles.orderId}>{t('order_id')} #{order.id?.slice(-6)}</Text>
        <View style={[styles.badge, { backgroundColor: '#E8F5E9' }]}>
          <Text style={{ color: '#2E7D32', fontSize: 11, fontWeight: '700' }}>🚚 {t('out_for_delivery')}</Text>
        </View>
      </View>
      <Text style={[styles.customerText, { textAlign: isRTL ? 'right' : 'left' }]}>
        👤 {order.customer || t('customer')}
      </Text>
      <Text style={[styles.itemsText, { textAlign: isRTL ? 'right' : 'left' }]}>
        📦 {(order.items || []).length} {t('items_count')} — {order.total || ''}
      </Text>

      <View style={[styles.cardActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }, isMobile && { flexDirection: 'column', alignItems: 'stretch' }]}>
        <TouchableOpacity style={styles.gpsBtn} onPress={() => openGPS(order.location?.lat, order.location?.lng)}>
          <MaterialCommunityIcons name="google-maps" size={16} color="#FFF" />
          <Text style={styles.gpsBtnText}>{t('gps_view')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deliveredBtn} onPress={() => handleMarkDelivered(order.id)}>
          <MaterialCommunityIcons name="check-circle" size={16} color="#FFF" />
          <Text style={styles.claimBtnText}>{t('delivered')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.returnBtn} onPress={() => setShowReturnInput(prev => ({ ...prev, [order.id]: !prev[order.id] }))}>
          <MaterialCommunityIcons name="keyboard-return" size={16} color="#FFF" />
          <Text style={styles.claimBtnText}>{t('returned')}</Text>
        </TouchableOpacity>
      </View>

      {showReturnInput[order.id] && (
        <View style={{ marginTop: 10 }}>
          <TextInput
            style={[styles.reasonInput, { textAlign: isRTL ? 'right' : 'left' }]}
            placeholder={t('return_reason_placeholder')}
            value={returnReason[order.id] || ''}
            onChangeText={(text) => setReturnReason(prev => ({ ...prev, [order.id]: text }))}
            multiline
          />
          <TouchableOpacity style={[styles.deliveredBtn, { marginTop: 6 }]} onPress={() => handleMarkReturned(order.id)}>
            <Text style={styles.claimBtnText}>{t('confirm_return')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderDoneOrder = (order) => (
    <View key={order.id} style={[styles.orderCard, { borderLeftColor: order.status === 'Completed' ? '#4CAF50' : '#F44336', borderLeftWidth: 4, opacity: 0.85 }]}>
      <View style={[styles.orderHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Text style={styles.orderId}>{t('order_id')} #{order.id?.slice(-6)}</Text>
        <View style={[styles.badge, { backgroundColor: order.status === 'Completed' ? '#E8F5E9' : '#FFEBEE' }]}>
          <Text style={{ color: order.status === 'Completed' ? '#2E7D32' : '#C62828', fontSize: 11, fontWeight: '700' }}>
            {order.status === 'Completed' ? `✅ ${t('delivered')}` : `↩ ${t('returned')}`}
          </Text>
        </View>
      </View>
      <Text style={[styles.customerText, { textAlign: isRTL ? 'right' : 'left' }]}>
        👤 {order.customer || t('customer')}
      </Text>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.greeting, { textAlign: isRTL ? 'right' : 'left' }]}>
            👋 {t('hello')}, {driverName}
          </Text>
          <Text style={[styles.roleLabel, { textAlign: isRTL ? 'right' : 'left' }]}>
            🚚 {t('driver')}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={styles.langRow}>
            {languages.map(lang => (
              <TouchableOpacity
                key={lang.code}
                onPress={() => changeLanguage(lang.code)}
                style={[styles.langBtn, i18n.language === lang.code && styles.langBtnActive]}
              >
                <Text style={[styles.langTxt, i18n.language === lang.code && styles.langTxtActive]}>{lang.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <MaterialCommunityIcons name="logout" size={20} color="#E53935" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats Bar */}
      <View style={[styles.statsBar, { flexDirection: isRTL ? 'row-reverse' : 'row' }, isMobile && { flexDirection: 'column', gap: 12 }]}>
        <View style={styles.statItem}>
          <Text style={styles.statNum}>{availableOrders.length}</Text>
          <Text style={styles.statLabel}>{t('available')}</Text>
        </View>
        {!isMobile && <View style={[styles.statDivider]} />}
        <View style={styles.statItem}>
          <Text style={[styles.statNum, { color: '#FF9800' }]}>{myActiveOrders.length}</Text>
          <Text style={styles.statLabel}>{t('in_progress')}</Text>
        </View>
        {!isMobile && <View style={[styles.statDivider]} />}
        <View style={styles.statItem}>
          <Text style={[styles.statNum, { color: '#4CAF50' }]}>{myDoneOrders.filter(o => o.status === 'Completed').length}</Text>
          <Text style={styles.statLabel}>{t('delivered')}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={[styles.tabBar, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        {[
          { key: 'available', icon: 'bell-ring', label: t('available_orders') },
          { key: 'mine', icon: 'truck-fast', label: t('my_orders') },
          { key: 'done', icon: 'history', label: t('history') },
        ].map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tabBtn, activeTab === tab.key && styles.tabBtnActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <MaterialCommunityIcons name={tab.icon} size={18} color={activeTab === tab.key ? '#FFF' : COLORS.textGray} />
            <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {activeTab === 'available' && (
          <>
            {availableOrders.length === 0
              ? <Text style={styles.emptyText}>{t('no_available_orders')}</Text>
              : availableOrders.map(renderAvailableOrder)
            }
          </>
        )}
        {activeTab === 'mine' && (
          <>
            {myActiveOrders.length === 0
              ? <Text style={styles.emptyText}>{t('no_active_orders')}</Text>
              : myActiveOrders.map(renderMyOrder)
            }
          </>
        )}
        {activeTab === 'done' && (
          <>
            {myDoneOrders.length === 0
              ? <Text style={styles.emptyText}>{t('no_history')}</Text>
              : myDoneOrders.map(renderDoneOrder)
            }
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6FA' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingTop: Platform.OS === 'web' ? 20 : 50, paddingBottom: 16, alignItems: 'center', justifyContent: 'space-between' },
  greeting: { fontSize: 18, fontWeight: '800', color: '#FFF' },
  roleLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  logoutBtn: { marginLeft: 12, padding: 6, backgroundColor: '#FFF', borderRadius: 20, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  langRow: { flexDirection: 'row', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, overflow: 'hidden' },
  langBtn: { paddingHorizontal: 8, paddingVertical: 5 },
  langBtnActive: { backgroundColor: '#FFF' },
  langTxt: { fontSize: 10, fontWeight: 'bold', color: 'rgba(255,255,255,0.8)' },
  langTxtActive: { color: COLORS.primary },
  statsBar: { backgroundColor: '#FFF', padding: 16, elevation: 3, justifyContent: 'space-around' },
  statItem: { alignItems: 'center' },
  statNum: { fontSize: 28, fontWeight: '900', color: COLORS.primary },
  statLabel: { fontSize: 11, color: COLORS.textGray, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: '#EEEEEE', height: '80%', alignSelf: 'center' },
  tabBar: { backgroundColor: '#FFF', flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, elevation: 2 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 10, marginHorizontal: 3 },
  tabBtnActive: { backgroundColor: COLORS.primary },
  tabLabel: { fontSize: 11, marginLeft: 4, color: COLORS.textGray, fontWeight: '600' },
  tabLabelActive: { color: '#FFF' },
  orderCard: { backgroundColor: '#FFF', padding: 14, borderRadius: 14, marginBottom: 12, elevation: 2 },
  orderHeader: { justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  orderId: { fontWeight: '800', fontSize: 14, color: '#333' },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  customerText: { fontSize: 15, fontWeight: '600', color: '#444', marginBottom: 4 },
  itemsText: { fontSize: 13, color: COLORS.textGray, marginBottom: 10 },
  cardActions: { justifyContent: 'flex-end', gap: 8 },
  gpsBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#34A853', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginRight: 8 },
  gpsBtnText: { color: '#FFF', fontSize: 12, fontWeight: '600', marginLeft: 4 },
  claimBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  deliveredBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4CAF50', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginRight: 6 },
  returnBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F44336', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  claimBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700', marginLeft: 4 },
  reasonInput: { backgroundColor: '#F5F5F5', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#FFCDD2', fontSize: 14 },
  emptyText: { textAlign: 'center', color: COLORS.textGray, marginTop: 40, fontSize: 15, fontStyle: 'italic' },
});

export default DriverDashboardScreen;
