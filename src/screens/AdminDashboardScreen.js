import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, FlatList, Alert, Linking, ActivityIndicator, useWindowDimensions, Modal, Animated, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants/theme';
import { getSecurely, saveSecurely } from '../services/StorageService';
import { logAdminAction, listenToAuditLogs } from '../services/AuditService';
import { changeLanguage } from '../services/i18n';
import { registerUser, listenToOrders, assignOrderDriverAsync, updateOrderStatusAsync, getAppUsers, addAppUser, updateAppUser, deleteAppUser, hashPassword, settleOrderAsync, settleMultipleOrdersAsync, listenToCategories, saveCategory, deleteCategory, toggleCategoryVisibility } from '../services/FirebaseService';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import ProductTimer from '../components/ProductTimer';
import { formatTimeAgo, formatDuration } from '../utils/timeUtils';

const AdminDashboardScreen = () => {
  const { t, i18n } = useTranslation();
  const { logout, userRole, userId } = useAuth();
  const { width } = useWindowDimensions();
  const isMobile = width < 480;
  const isRTL = i18n.language === 'ar';
  
  const languages = [
    { code: 'fr', label: 'FR' },
    { code: 'ar', label: 'AR' },
    { code: 'en', label: 'EN' },
  ];

  // Tabs: inventory, orders, finance, users, archive
  const [activeTab, setActiveTab] = useState('inventory');
  const [role, setRole] = useState(userRole || 'admin'); // owner, admin, driver
  const [isLoading, setIsLoading] = useState(true);

  // --- Real-time State ---
  const [inventory, setInventory] = useState([]);
  const [orders, setOrders] = useState([]);
  const [dynamicCategories, setDynamicCategories] = useState([]);
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [newItem, setNewItem] = useState({ 
    name_ar: '', 
    name_fr: '', 
    name_en: '', 
    category: '1', 
    price: '', 
    discount: '0', 
    unit: 'piece',
    unitValue: '',
    saleDuration: '30', // Default 30 minutes
    image: '' 
  });
  const [inventoryCatFilter, setInventoryCatFilter] = useState('all');
  const [editingValues, setEditingValues] = useState({}); // { [id]: { price: '0', discount: '0' } }
  const [settleNotes, setSettleNotes] = useState({}); // { [id]: 'notes...' }
  const [editingProduct, setEditingProduct] = useState(null);

  // Users Management State
  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserMfaCode, setNewUserMfaCode] = useState('159753'); // Default for new users
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState('admin');
  const [newUserCanSettle, setNewUserCanSettle] = useState(false);
  const [newUserCanManageCats, setNewUserCanManageCats] = useState(false);
  const [usersList, setUsersList] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Edit User State
  const [editingUser, setEditingUser] = useState(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editCanSettle, setEditCanSettle] = useState(false);
  const [editCanManageCats, setEditCanManageCats] = useState(false);
  const [editPassword, setEditPassword] = useState('');
  const [editMfaCode, setEditMfaCode] = useState('');

  // Settlements & Audit State
  const [auditLogs, setAuditLogs] = useState([]);
  const [expandedDriverId, setExpandedDriverId] = useState(null);
  const [commissions, setCommissions] = useState({}); // { [orderId]: string }
  const [showScrollArrow, setShowScrollArrow] = useState(true);
  const scrollArrowAnim = useRef(new Animated.Value(0)).current;

  // Animate the scroll arrow
  useEffect(() => {
    if (showScrollArrow && isMobile) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(scrollArrowAnim, { toValue: 8, duration: 600, useNativeDriver: true }),
          Animated.timing(scrollArrowAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [showScrollArrow, isMobile]);

  const categoryMap = [
    { id: 'all', label: t('all_categories'), icon: 'view-grid' },
    ...dynamicCategories.map(c => ({
      id: c.id,
      label: c.names ? (c.names[i18n.language] || c.names['fr'] || c.id) : c.id,
      icon: c.icon || 'tag',
      visible: c.visible !== false,
    }))
  ];

  const loadInventory = async () => {
    const data = await getSecurely('products_v1');
    if (data) setInventory(JSON.parse(data));
  };

  const saveInventory = async (newInv) => {
    try {
      setInventory(newInv);
      const success = await saveSecurely('products_v1', JSON.stringify(newInv));
      if (!success) {
         console.warn("Storage write failed, may exceed limits or web quota");
         // We still keep the state update so the user sees it in session
      }
    } catch (e) {
      console.error("saveInventory Error:", e);
    }
  };

  const loadUsers = async () => {
    try {
      const users = await getAppUsers();
      setUsersList(users);
    } catch (e) {
      console.error('loadUsers Error:', e);
    }
  };

  const deleteUser = async (userId) => {
    try {
      await deleteAppUser(userId);
      setUsersList(prev => prev.filter(u => u.id !== userId));
      await handleAdminAction('DELETE_USER', { userId });
      Alert.alert(t('success'), t('user_deleted') || 'User deleted');
    } catch (e) {
      Alert.alert(t('error'), e.message);
    }
  };

  const startEditUser = (user) => {
    setEditingUser(user);
    setEditName(user.name);
    setEditEmail(user.email || '');
    setEditPhone(user.phone || '');
    setEditRole(user.role);
    setEditCanSettle(user.permissions?.canSettleDrivers || false);
    setEditCanManageCats(user.permissions?.canManageCategories || false);
    setEditPassword(''); 
    setEditMfaCode(user.mfaCode || '159753');
  };

  const handleUpdateUser = async () => {
    if (!editName) return Alert.alert(t('error'), t('fill_fields'));
    
    try {
      const updatedData = {
        name: editName,
        email: editEmail,
        phone: editPhone,
        role: editRole,
        mfaCode: editMfaCode || '159753',
        permissions: { canSettleDrivers: editCanSettle, canManageCategories: editCanManageCats }
      };
      if (editPassword) {
        updatedData.password = await hashPassword(editPassword);
      }
      
      await updateAppUser(editingUser.id, updatedData);
      setUsersList(prev => prev.map(u => u.id === editingUser.id ? { ...u, ...updatedData } : u));
      await handleAdminAction('EDIT_USER', { userId: editingUser.id, name: editName });
      Alert.alert(t('success'), t('update_success') || 'Updated ✓');
      setEditingUser(null);
    } catch (e) {
      Alert.alert(t('error'), e.message);
    }
  };

  useEffect(() => {
    // Force French as default for Admin Dashboard
    changeLanguage('fr');

    const fetchRole = async () => {
      const storedRole = await getSecurely('userRole');
      if (storedRole) setRole(storedRole);
    };
    fetchRole();
    loadInventory();
    loadUsers();

    const unsubscribeOrders = listenToOrders(setOrders);
    const unsubscribeAudit = listenToAuditLogs(setAuditLogs);
    const unsubscribeCats = listenToCategories(setDynamicCategories);
    
    setTimeout(() => setIsLoading(false), 800);
    return () => {
      if (unsubscribeOrders) unsubscribeOrders();
      if (unsubscribeAudit) unsubscribeAudit();
      if (unsubscribeCats) unsubscribeCats();
    };
  }, []);

  // --- Handlers ---
  const handleAdminAction = async (action, details) => {
    if (role !== 'owner' && role !== 'admin') return Alert.alert(t('access_denied'), t('drivers_cannot_manage'));
    await logAdminAction('admin_001', action, details);
  };

  const handleLogout = async () => {
    await logout();
  };

  const addInventoryItem = async () => {
    if (!newItem.name_fr || !newItem.name_ar || !newItem.price) return Alert.alert(t('error'), t('fill_fields'));
    
    try {
      const currencySuffix = t('currency') || 'MAD';
      let cleanPrice = String(newItem.price).replace(/[^\d.]/g, '');
      const formattedPrice = `${cleanPrice} ${currencySuffix}`;

      let discVal = parseInt(newItem.discount) || 0;
      let durationHours = parseFloat(newItem.saleDuration) || 0;
      let finalDiscount = discVal > 0 ? `${discVal}%` : '';

      const itemToAdd = {
        id: 'p' + Date.now(),
        name: newItem.name_fr, // Legacy support
        names: {
          ar: newItem.name_ar || newItem.name_fr,
          fr: newItem.name_fr,
          en: newItem.name_en || newItem.name_fr
        },
        unit: newItem.unitValue ? `${newItem.unitValue} ${t(newItem.unit)}` : newItem.unit,
        price: formattedPrice,
        discount: finalDiscount,
        oldPrice: discVal > 0 ? formattedPrice : null, 
        saleEndsAt: (discVal > 0 && durationHours > 0) ? (Date.now() + durationHours * 60000) : null,
        image: newItem.image || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=400',
        vendor: 'Admin',
        stock: 100,
        sold: 0,
        category: newItem.category || '1'
      };

      // If discounted, calculate the new price
      if (discVal > 0) {
        const salePrice = (parseFloat(cleanPrice) * (1 - discVal / 100)).toFixed(2);
        itemToAdd.price = `${salePrice} ${currencySuffix}`;
        itemToAdd.oldPrice = formattedPrice;
      }

      const newInv = [itemToAdd, ...inventory];
      await saveInventory(newInv);
      
      handleAdminAction('ADD_PRODUCT', { name: newItem.name_fr, category: newItem.category }).catch(err => {});

      setNewItem({ name_ar: '', name_fr: '', name_en: '', category: '1', price: '', discount: '0', unit: 'piece', unitValue: '', saleDuration: '30', image: '' });
      setIsAddModalVisible(false);
      Alert.alert(t('success'), t('add_product') + ' ✓');
    } catch (err) {
      console.error("Add Product Crash:", err);
      Alert.alert(t('error'), "Failed to add product: " + err.message);
    }
  };

  const deleteInventoryItem = async (id) => {
    const newInv = inventory.filter(i => i.id !== id);
    await saveInventory(newInv);
    await handleAdminAction('DELETE_PRODUCT', { id });
  };

  const applyInventoryEdits = async (id, edits) => {
    if (!edits) return;

    const newInv = inventory.map(i => {
      if (i.id === id) {
        let updated = { ...i };
        const currencySuffix = t('currency') || 'MAD';
        
        let basePriceRaw = edits.price ? edits.price : 
                           (i.oldPrice ? String(i.oldPrice).replace(/[^\d.]/g, '') : String(i.price).replace(/[^\d.]/g, ''));
        let basePriceStr = `${basePriceRaw} ${currencySuffix}`;
        
        let discountPercent = edits.discount !== undefined ? (parseInt(edits.discount) || 0) : 
                              (i.discount ? parseInt(String(i.discount).replace('%', '')) : 0);

        if (discountPercent > 0) {
           const salePrice = (parseFloat(basePriceRaw) * (1 - discountPercent / 100)).toFixed(2);
           updated.price = `${salePrice} ${currencySuffix}`;
           updated.oldPrice = basePriceStr;
           updated.discount = `${discountPercent}%`;
           
           if (edits.saleDuration !== undefined) {
              const minutes = parseFloat(edits.saleDuration) || 30;
              updated.saleEndsAt = Date.now() + minutes * 60000;
           } else if (!i.saleEndsAt) { 
              updated.saleEndsAt = Date.now() + 30 * 60000;
           }
        } else {
           updated.price = basePriceStr;
           updated.oldPrice = null;
           updated.discount = '';
           updated.saleEndsAt = null;
        }

        return updated;
      }
      return i;
    });
    
    await saveInventory(newInv);
    await handleAdminAction('UPDATE_PRODUCT_FIELDS', { id, edits });
    setEditingValues(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    Alert.alert(t('success'), t('update_success') || 'Updated ✓');
  };

  const adjustStock = async (id, delta) => {
    const newInv = inventory.map(i => {
      if (i.id === id) {
        const currentStock = i.stock !== undefined ? i.stock : 100;
        const newStock = Math.max(0, currentStock + delta);
        return { ...i, stock: newStock };
      }
      return i;
    });
    await saveInventory(newInv);
  };

  const setStockDirect = async (id, value) => {
    const num = parseInt(value) || 0;
    const newInv = inventory.map(i => i.id === id ? { ...i, stock: Math.max(0, num) } : i);
    await saveInventory(newInv);
  };

  const openGPS = (lat, lng) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    Linking.openURL(url);
  };

  const resetStock = async (id) => {
    if (role !== 'owner') return Alert.alert(t('access_denied'), t('only_owner_reset'));
    const newInv = inventory.map(i => i.id === id ? { ...i, stock: 100, sold: 0 } : i);
    await saveInventory(newInv);
    Alert.alert(t('success'), t('stock_reset_success'));
  };

  const assignDriver = async (orderId) => {
    try {
      await assignOrderDriverAsync(orderId, 'Express Driver A', 'd2');
      handleAdminAction('DRIVER_ASSIGN', { orderId, driver: 'Express Driver A' });
      Alert.alert(t('assigned'), t('order_assigned_success'));
    } catch (e) {
      Alert.alert(t('assign_failed'), e.message);
    }
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      await updateOrderStatusAsync(orderId, newStatus);
      Alert.alert(t('success'), `${t('orders')} → ${newStatus}`);
    } catch (e) {
      Alert.alert(t('error'), e.message);
    }
  };

  const handleAddUser = async () => {
    if (!newUserUsername || !newUserPassword || !newUserName) {
      return Alert.alert(t('error'), t('fill_fields'));
    }
    try {
      const existing = usersList.find(u => u.username && u.username.toLowerCase() === newUserUsername.trim().toLowerCase());
      if (existing) return Alert.alert(t('error'), t('user_already_exists'));

      const newUser = {
        id: 'user_' + Date.now(),
        name: newUserName.trim(),
        username: newUserUsername.trim().toLowerCase(),
        email: newUserEmail.trim().toLowerCase(),
        phone: newUserPhone.trim(),
        password: await hashPassword(newUserPassword),
        mfaCode: newUserMfaCode.trim() || '159753',
        role: newUserRole,
        permissions: { canSettleDrivers: newUserCanSettle, canManageCategories: newUserCanManageCats },
        createdAt: new Date().toISOString()
      };
      
      await addAppUser(newUser);
      setUsersList(prev => [...prev, newUser]);
      await handleAdminAction('ADD_USER', { username: newUserUsername, role: newUserRole });
      Alert.alert(t('success'), t('user_added_success'));
      setNewUserUsername('');
      setNewUserEmail('');
      setNewUserPhone('');
      setNewUserPassword('');
      setNewUserName('');
      setNewUserMfaCode('159753');
      setNewUserRole('admin');
      setNewUserCanSettle(false);
      setNewUserCanManageCats(false);
    } catch (e) {
      Alert.alert(t('error'), e.message);
    }
  };

  const handleSettleOrder = async (orderId, totalCashStr) => {
    const comm = commissions[orderId] || '10';
    const note = settleNotes[orderId] || '';
    const numComm = parseFloat(comm);
    if (isNaN(numComm) || numComm < 0) return Alert.alert(t('error'), 'Invalid commission amount');
    try {
      await settleOrderAsync(orderId, numComm, userId, note);
      await handleAdminAction('SETTLE_DRIVER_ORDER', { orderId, commission: numComm, totalCash: totalCashStr, notes: note });
      Alert.alert(t('success'), 'Order settled ✓');
    } catch (e) {
      Alert.alert(t('error'), e.message);
    }
  };

  const handleSettleAll = async (driverId, ordersArray, defaultComm) => {
    const comm = commissions[driverId] || defaultComm || '10';
    const note = settleNotes[driverId] || '';
    const numComm = parseFloat(comm);
    if (isNaN(numComm) || numComm < 0) return Alert.alert(t('error'), 'Invalid commission amount');
    
    try {
      const ids = ordersArray.map(o => o.id);
      await settleMultipleOrdersAsync(ids, numComm, userId, note);
      await handleAdminAction('SETTLE_DRIVER_BULK', { driverId, count: ids.length, commissionPerOrder: numComm, notes: note });
      Alert.alert(t('success'), `Settled ${ids.length} orders ✓`);
    } catch (e) {
      Alert.alert(t('error'), e.message);
    }
  };

  // --- Filtered Views for RBAC ---
  const isAdmin = role === 'owner' || role === 'admin';
  const filteredOrders = isAdmin ? orders : orders.filter(o => o.driverId === 'd1');
  const completedOrders = orders.filter(o => o.status === 'Completed');

  // Settlements logic
  const currentUserObj = usersList.find(u => u.id === userId);
  const canSettle = userRole === 'owner' || (userRole === 'admin' && currentUserObj?.permissions?.canSettleDrivers);
  const canManageCats = userRole === 'owner' || (userRole === 'admin' && currentUserObj?.permissions?.canManageCategories);

  const unsettledOrdersByDriver = completedOrders
    .filter(o => o.settlementStatus !== 'Settled')
    .reduce((acc, order) => {
       const dId = order.driverId || 'unknown';
       if (!acc[dId]) acc[dId] = { driverName: order.driver || 'Unknown Driver', orders: [] };
       acc[dId].orders.push(order);
       return acc;
    }, {});

  // Inventory filtered by search and category
  const filteredInventory = inventory.filter(i => {
    const productName = i.names ? (i.names[i18n.language] || i.names['fr'] || '') : (i.name || '');
    const matchesSearch = productName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = inventoryCatFilter === 'all' || i.category === inventoryCatFilter;
    return matchesSearch && matchesCat;
  });

  // --- Render Functions ---

  const renderCategoryFilter = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
      {categoryMap.map(cat => (
        <TouchableOpacity
          key={cat.id}
          style={[styles.catFilterBtn, inventoryCatFilter === cat.id && styles.catFilterBtnActive]}
          onPress={() => setInventoryCatFilter(cat.id)}
        >
          <MaterialCommunityIcons name={cat.icon} size={16} color={inventoryCatFilter === cat.id ? COLORS.white : COLORS.textGray} />
          <Text style={[styles.catFilterText, inventoryCatFilter === cat.id && styles.catFilterTextActive]}>{cat.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderInventory = () => (
    <View style={styles.tabContent}>
      <View style={{ marginBottom: 15, flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', backgroundColor: '#F5F5F5', borderRadius: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#EEE' }}>
        <MaterialCommunityIcons name="magnify" size={24} color={COLORS.primary} />
        <TextInput 
          style={{ flex: 1, height: 45, paddingHorizontal: 10, textAlign: isRTL ? 'right' : 'left', fontSize: 16 }}
          placeholder={t('search_product') || 'Search...'}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <MaterialCommunityIcons name="close-circle" size={20} color={COLORS.textGray} />
          </TouchableOpacity>
        )}
      </View>

      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
        <Text style={[styles.tabTitle, { marginBottom: 0 }]}>{t('inventory_management')}</Text>
        {isAdmin && (
          <TouchableOpacity style={[styles.addBtn, { paddingVertical: 8, paddingHorizontal: 15 }]} onPress={() => setIsAddModalVisible(true)}>
            <MaterialCommunityIcons name="plus-circle" size={20} color="#FFF" />
            <Text style={[styles.addBtnText, { marginLeft: 5 }]}>{t('add_product')}</Text>
          </TouchableOpacity>
        )}
      </View>
      
      {renderCategoryFilter()}
      {/* Add Product Modal */}
      <Modal visible={isAddModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            <View style={styles.modalCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
                <Text style={styles.modalTitle}>{t('add_new_product_title')}</Text>
                <TouchableOpacity onPress={() => setIsAddModalVisible(false)}>
                  <MaterialCommunityIcons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>{t('name_fr')}</Text>
              <TextInput style={styles.input} value={newItem.name_fr} onChangeText={t => setNewItem({...newItem, name_fr: t})} placeholder="Nom du produit..." />
              
              <Text style={styles.inputLabel}>{t('name_ar')}</Text>
              <TextInput style={[styles.input, { textAlign: 'right' }]} value={newItem.name_ar} onChangeText={t => setNewItem({...newItem, name_ar: t})} placeholder="اسم المنتج..." />
              
              <Text style={styles.inputLabel}>{t('name_en')}</Text>
              <TextInput style={styles.input} value={newItem.name_en} onChangeText={t => setNewItem({...newItem, name_en: t})} placeholder="Product name..." />

              <View style={{ flexDirection: 'row', gap: 15, marginBottom: 15 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>{t('price')} (MAD)</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={newItem.price} onChangeText={t => setNewItem({...newItem, price: t})} placeholder="0.00" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>{t('discount')} (%)</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={newItem.discount} onChangeText={t => setNewItem({...newItem, discount: t})} placeholder="0" />
                </View>
              </View>

              {parseInt(newItem.discount) > 0 && (
                 <View style={{ marginBottom: 15 }}>
                   <Text style={styles.inputLabel}>{t('sale_duration_mins')}</Text>
                   <TextInput style={styles.input} keyboardType="numeric" value={newItem.saleDuration} onChangeText={t => setNewItem({...newItem, saleDuration: t})} placeholder="30" />
                 </View>
              )}

              <Text style={styles.inputLabel}>{t('unit')}</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                {['piece', 'kg', 'litre', 'other'].map(u => (
                  <TouchableOpacity 
                    key={u} 
                    style={[styles.unitBtn, newItem.unit === u && styles.unitBtnActive]} 
                    onPress={() => setNewItem({...newItem, unit: u})}
                  >
                    <Text style={[styles.unitText, newItem.unit === u && styles.unitTextActive]}>{t(u)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {newItem.unit && (
                <View style={{ marginBottom: 20 }}>
                  <Text style={styles.inputLabel}>{t('unit_value')}</Text>
                  <TextInput 
                    style={styles.input} 
                    value={newItem.unitValue} 
                    onChangeText={t => setNewItem({...newItem, unitValue: t})} 
                    placeholder={newItem.unit === 'other' ? "Nom de l'unité..." : "1, 500, 2.5..."}
                  />
                </View>
              )}

              <Text style={styles.inputLabel}>{t('category')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                {categoryMap.filter(c => c.id !== 'all').map(cat => (
                  <TouchableOpacity key={cat.id} style={[styles.catFilterBtn, newItem.category === cat.id && styles.catFilterBtnActive]} onPress={() => setNewItem({...newItem, category: cat.id})}>
                    <Text style={[styles.catFilterText, newItem.category === cat.id && styles.catFilterTextActive]}>{cat.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.inputLabel}>{t('image_url')} <Text style={{ fontSize: 10, color: COLORS.textGray }}>{t('image_size_hint')}</Text></Text>
              <TextInput style={styles.input} value={newItem.image} onChangeText={t => setNewItem({...newItem, image: t})} placeholder="https://..." />

              <TouchableOpacity style={styles.saveBtn} onPress={addInventoryItem}>
                <Text style={styles.saveBtnText}>{t('add_product')}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Edit Product Modal */}
      <Modal visible={editingProduct !== null} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            <View style={styles.modalCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
                <Text style={styles.modalTitle}>{t('edit_product')}</Text>
                <TouchableOpacity onPress={() => setEditingProduct(null)}>
                  <MaterialCommunityIcons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>{t('name_fr')}</Text>
              <TextInput style={styles.input} value={newItem.name_fr} onChangeText={t => setNewItem({...newItem, name_fr: t})} placeholder="Nom du produit..." />
              
              <Text style={styles.inputLabel}>{t('name_ar')}</Text>
              <TextInput style={[styles.input, { textAlign: 'right' }]} value={newItem.name_ar} onChangeText={t => setNewItem({...newItem, name_ar: t})} placeholder="اسم المنتج..." />
              
              <Text style={styles.inputLabel}>{t('name_en')}</Text>
              <TextInput style={styles.input} value={newItem.name_en} onChangeText={t => setNewItem({...newItem, name_en: t})} placeholder="Product name..." />

              <Text style={styles.inputLabel}>{t('category')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                {dynamicCategories.map(cat => (
                  <TouchableOpacity key={cat.id} style={[styles.catFilterBtn, newItem.category === cat.id && styles.catFilterBtnActive]} onPress={() => setNewItem({...newItem, category: cat.id})}>
                    <Text style={[styles.catFilterText, newItem.category === cat.id && styles.catFilterTextActive]}>{cat.names?.[i18n.language] || cat.names?.fr || cat.id}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.inputLabel}>{t('image_url')}</Text>
              <TextInput style={styles.input} value={newItem.image} onChangeText={t => setNewItem({...newItem, image: t})} placeholder="https://..." />

              <TouchableOpacity style={styles.saveBtn} onPress={async () => {
                try {
                  await updateInventoryItemAsync(editingProduct.id, {
                    names: { ar: newItem.name_ar, fr: newItem.name_fr, en: newItem.name_en },
                    category: newItem.category,
                    image: newItem.image
                  });
                  await handleAdminAction('EDIT_PRODUCT_BASIC', { id: editingProduct.id, name: newItem.name_fr });
                  Alert.alert(t('success'), t('update_success') || 'Updated ✓');
                  setEditingProduct(null);
                } catch (e) {
                  Alert.alert(t('error'), e.message);
                }
              }}>
                <Text style={styles.saveBtnText}>{t('save')}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <FlatList
        data={filteredInventory}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={[styles.listItem, isMobile && { flexDirection: 'column', alignItems: 'stretch' }]}>
            <View style={{ flex: 1, marginBottom: isMobile ? 12 : 0 }}>
              <Text style={[styles.itemName, { textAlign: isRTL ? 'right' : 'left' }]}>
                {item.names ? (item.names[i18n.language] || item.names['fr']) : (t(item.name) || item.name)}
              </Text>
              <Text style={[styles.itemSub, { textAlign: isRTL ? 'right' : 'left' }]}>
                {categoryMap.find(c => c.id === item.category)?.label || item.category} - {item.price} {item.oldPrice ? `(${t('was')} ${item.oldPrice})` : ''} 
                {item.unit ? ` - ${t(item.unit)}` : ''}
              </Text>
              {item.discount && <Text style={{ fontSize: 10, color: '#E53935', fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('sale')}: {item.discount}</Text>}
              <Text style={{fontSize: 12, color: COLORS.primary, fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left', marginTop: 4}}>
                 {t('stock_remaining')}: {item.stock !== undefined ? item.stock : 100} | {t('sold')}: {item.sold || 0}
              </Text>
              {item.saleEndsAt && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                  <ProductTimer endsAt={item.saleEndsAt} onExpire={loadInventory} />
                </View>
              )}
            </View>
            
            <View style={[styles.itemControlRow, isMobile && { flexDirection: 'column', alignItems: 'stretch', borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 10 }]}>
              {/* Stock Controls: - [input] + */}
              <View style={{ alignItems: 'center', marginRight: isMobile ? 0 : 10, marginBottom: isMobile ? 10 : 0 }}>
                <Text style={styles.controlLabel}>{t('stock')}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <TouchableOpacity onPress={() => adjustStock(item.id, -1)} style={styles.stockBtn}>
                    <MaterialCommunityIcons name="minus" size={16} color="#E53935" />
                  </TouchableOpacity>
                  <TextInput
                    style={[styles.smallInput, { width: 50, textAlign: 'center' }]}
                    keyboardType="numeric"
                    value={String(item.stock !== undefined ? item.stock : 100)}
                    onChangeText={(val) => setStockDirect(item.id, val)}
                  />
                  <TouchableOpacity onPress={() => adjustStock(item.id, 1)} style={styles.stockBtn}>
                    <MaterialCommunityIcons name="plus" size={16} color="#4CAF50" />
                  </TouchableOpacity>
                  {role === 'owner' && (
                    <TouchableOpacity onPress={() => resetStock(item.id)} style={{ marginLeft: 4 }}>
                      <MaterialCommunityIcons name="restore" size={20} color="#FF9800" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Price & Discount Controls */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, flexWrap: 'wrap' }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={styles.controlLabel}>{t('price')}</Text>
                  <TextInput 
                    style={styles.smallInput} 
                    placeholder="MAD" 
                    keyboardType="numeric"
                    value={editingValues[item.id]?.price}
                    onChangeText={(val) => setEditingValues(prev => ({ ...prev, [item.id]: { ...prev[item.id], price: val } }))}
                  />
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={styles.controlLabel}>{t('discount_label')}</Text>
                  <TextInput 
                    style={styles.smallInput} 
                    placeholder="%" 
                    keyboardType="numeric"
                    value={editingValues[item.id]?.discount}
                    onChangeText={(val) => setEditingValues(prev => ({ ...prev, [item.id]: { ...prev[item.id], discount: val } }))}
                  />
                </View>
                {editingValues[item.id]?.discount > 0 && (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={styles.controlLabel}>{t('minutes')}</Text>
                    <TextInput 
                      style={[styles.smallInput, { width: 40 }]} 
                      placeholder="30" 
                      keyboardType="numeric"
                      value={editingValues[item.id]?.saleDuration || '30'}
                      onChangeText={(val) => setEditingValues(prev => ({ ...prev, [item.id]: { ...prev[item.id], saleDuration: val } }))}
                    />
                  </View>
                )}
                {(editingValues[item.id]?.price || editingValues[item.id]?.discount !== undefined) && (
                  <TouchableOpacity onPress={() => applyInventoryEdits(item.id)} style={{ padding: 4, marginBottom: 2 }}>
                    <MaterialCommunityIcons name="check-circle" size={24} color={COLORS.primary} />
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity onPress={() => deleteInventoryItem(item.id)} style={{ marginLeft: 8, alignSelf: 'center' }}>
                <MaterialCommunityIcons name="delete-outline" size={22} color="#F44336" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => {
                setEditingProduct(item);
                setNewItem({
                  name_ar: item.names?.ar || '',
                  name_fr: item.names?.fr || '',
                  name_en: item.names?.en || '',
                  price: String(item.price).replace(/[^\d.]/g, ''),
                  discount: item.discount ? item.discount.replace('%', '') : '0',
                  unit: item.unit ? item.unit.split(' ')[1] : 'piece',
                  unitValue: item.unit ? item.unit.split(' ')[0] : '1',
                  image: item.image || '',
                  category: item.category || '1',
                  saleDuration: '30'
                });
              }} style={{ marginLeft: 8, alignSelf: 'center' }}>
                <MaterialCommunityIcons name="pencil-outline" size={22} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );

  const [newCat, setNewCat] = useState({ name_ar: '', name_fr: '', name_en: '', icon: 'tag', color: '#4CAF50' });
  const [showCatManager, setShowCatManager] = useState(false);

  const handleAddCategory = async () => {
    if (!newCat.name_ar || !newCat.name_fr) return Alert.alert(t('error'), t('fill_fields'));
    const catId = 'cat_' + Date.now();
    const catData = {
      id: catId,
      names: { ar: newCat.name_ar, fr: newCat.name_fr, en: newCat.name_en || newCat.name_fr },
      icon: newCat.icon || 'tag',
      color: newCat.color || '#4CAF50',
      visible: true,
      order: dynamicCategories.length + 1,
    };
    try {
      await saveCategory(catData);
      await handleAdminAction('ADD_CATEGORY', { name: newCat.name_fr });
      setNewCat({ name_ar: '', name_fr: '', name_en: '', icon: 'tag', color: '#4CAF50' });
    } catch (e) {
      Alert.alert(t('error'), e.message);
    }
  };

  const handleDeleteCategory = async (catId, catName) => {
    const msg = `${t('confirm_delete') || 'Delete'} "${catName}"?`;
    if (Platform.OS === 'web') {
      if (!window.confirm(msg)) return;
    }
    try {
      await deleteCategory(catId);
      await handleAdminAction('DELETE_CATEGORY', { categoryId: catId, name: catName });
    } catch (e) {
      Alert.alert(t('error'), e.message);
    }
  };

  const handleToggleCatVisibility = async (catId, currentVisible) => {
    try {
      await toggleCategoryVisibility(catId, !currentVisible);
      await handleAdminAction('TOGGLE_CATEGORY', { categoryId: catId, visible: !currentVisible });
    } catch (e) {
      Alert.alert(t('error'), e.message);
    }
  };

  const iconOptions = ['carrot','tshirt-crew','basket','palette','lipstick','spray','leaf','home-variant','food-variant','tag','star','gift','cart','shopping','diamond','flower','heart','coffee','glass-cocktail','silverware-fork-knife','pill','book-open-variant','dumbbell','paw','car','cellphone'];

  const colorOptions = ['#4CAF50','#FF9800','#9C27B0','#8E44AD','#E91E63','#00ACC1','#66BB6A','#8D6E63','#FF7043','#3F51B5','#009688','#F44336','#795548','#607D8B'];

  const renderCategoryManager = () => {
    if (!canManageCats) return null;
    return (
      <View style={{ marginTop: 20, borderTopWidth: 2, borderTopColor: '#E0E0E0', paddingTop: 20 }}>
        <TouchableOpacity 
          onPress={() => setShowCatManager(!showCatManager)} 
          style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 }}
        >
          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center' }}>
            <MaterialCommunityIcons name="shape" size={22} color={COLORS.primary} />
            <Text style={{ fontSize: 16, fontWeight: 'bold', marginHorizontal: 8 }}>{t('manage_categories') || 'إدارة الأقسام'}</Text>
          </View>
          <MaterialCommunityIcons name={showCatManager ? 'chevron-up' : 'chevron-down'} size={24} color={COLORS.textGray} />
        </TouchableOpacity>

        {showCatManager && (
          <View>
            {/* Existing Categories */}
            {dynamicCategories.map(cat => (
              <View key={cat.id} style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: '#FFF', borderRadius: 10, marginBottom: 8, elevation: 1 }}>
                <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', flex: 1 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: cat.color || '#999', alignItems: 'center', justifyContent: 'center', marginHorizontal: 8 }}>
                    <MaterialCommunityIcons name={cat.icon || 'tag'} size={18} color="#FFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: 'bold' }}>{cat.names?.[i18n.language] || cat.names?.fr || cat.id}</Text>
                    <Text style={{ fontSize: 11, color: COLORS.textGray }}>{cat.names?.ar} / {cat.names?.fr} / {cat.names?.en}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center' }}>
                  <TouchableOpacity onPress={() => handleToggleCatVisibility(cat.id, cat.visible !== false)} style={{ padding: 6, marginHorizontal: 4 }}>
                    <MaterialCommunityIcons name={cat.visible !== false ? 'eye' : 'eye-off'} size={22} color={cat.visible !== false ? '#4CAF50' : '#F44336'} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteCategory(cat.id, cat.names?.fr || cat.id)} style={{ padding: 6, marginHorizontal: 4 }}>
                    <MaterialCommunityIcons name="delete" size={22} color="#F44336" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {/* Add New Category */}
            <View style={[styles.addCard, { marginTop: 15 }]}>
              <Text style={[styles.sectionLabel, { marginBottom: 10 }]}>{t('add_category') || 'إضافة قسم جديد'}</Text>
              <TextInput style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]} placeholder={'اسم القسم بالعربية *'} value={newCat.name_ar} onChangeText={v => setNewCat(p => ({...p, name_ar: v}))} />
              <TextInput style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]} placeholder={'Nom de catégorie (FR) *'} value={newCat.name_fr} onChangeText={v => setNewCat(p => ({...p, name_fr: v}))} />
              <TextInput style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]} placeholder={'Category name (EN)'} value={newCat.name_en} onChangeText={v => setNewCat(p => ({...p, name_en: v}))} />
              
              <Text style={[styles.sectionLabel, { marginBottom: 8 }]}>{t('icon') || 'الأيقونة'}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {iconOptions.map(ico => (
                  <TouchableOpacity key={ico} onPress={() => setNewCat(p => ({...p, icon: ico}))} style={{ padding: 8, borderRadius: 8, marginRight: 6, backgroundColor: newCat.icon === ico ? COLORS.primary : '#F5F5F5' }}>
                    <MaterialCommunityIcons name={ico} size={22} color={newCat.icon === ico ? '#FFF' : '#555'} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
              
              <Text style={[styles.sectionLabel, { marginBottom: 8 }]}>{t('color') || 'اللون'}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 15 }}>
                {colorOptions.map(clr => (
                  <TouchableOpacity key={clr} onPress={() => setNewCat(p => ({...p, color: clr}))} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: clr, marginRight: 8, borderWidth: newCat.color === clr ? 3 : 0, borderColor: '#333' }} />
                ))}
              </ScrollView>

              <TouchableOpacity style={styles.addBtn} onPress={handleAddCategory}>
                <MaterialCommunityIcons name="plus-circle" size={20} color="#FFF" />
                <Text style={[styles.addBtnText, { marginLeft: 8 }]}>{t('add_category') || 'إضافة قسم'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderFinancials = () => {
    const revenueTotal = orders
      .filter(o => o.status === 'Completed')
      .reduce((sum, o) => {
        const parsed = parseFloat(String(o.total || 0).replace(/[^\d.]/g, '')) || 0;
        return sum + parsed;
      }, 0);

    return (
      <View style={styles.tabContent}>
        <Text style={[styles.tabTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('finance')}</Text>
        <View style={[styles.financeCard, isMobile && { flexDirection: 'column' }]}>
           <View style={isMobile && { marginBottom: 20 }}>
             <Text style={styles.financeLabel}>{t('total_revenue')}</Text>
             <Text style={styles.financeValue}>{revenueTotal} {t('currency') || 'MAD'}</Text>
           </View>
           <View>
             <Text style={styles.financeLabel}>{t('orders_completed')}</Text>
             <Text style={styles.financeValue}>{orders.filter(o => o.status === 'Completed').length}</Text>
           </View>
        </View>
        <Text style={[styles.tabSubText, { textAlign: isRTL ? 'right' : 'left' }]}>{t('revenue_note')}</Text>
      </View>
    );
  };

  const renderOrders = () => (
    <View style={styles.tabContent}>
      <Text style={[styles.tabTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{role === 'owner' ? t('all_orders') : (role === 'admin' ? t('admin_orders') : t('my_deliveries'))}</Text>
      {filteredOrders.length === 0 ? (
        <Text style={[styles.restrictedText, { color: COLORS.textGray }]}>{t('no_completed_orders')}</Text>
      ) : null}
      {filteredOrders.map(order => (
        <View key={order.id} style={styles.orderCard}>
          <View style={[styles.orderHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Text style={styles.orderId}>{t('order_id')} #{order.id}</Text>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
              <Text style={{ fontSize: 11, color: COLORS.textGray, fontStyle: 'italic' }}>
                {order.status === 'Pending' 
                  ? `⏳ ${formatTimeAgo(order.timestamp, t)}` 
                  : (order.status === 'Out for Delivery' ? `🛵 ${formatTimeAgo(order.claimedAt || order.timestamp, t)}` : '')
                }
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: order.status === 'Pending' ? '#FFE0B2' : '#E8F5E9' }]}>
                <Text style={{ fontSize: 10, color: order.status === 'Pending' ? '#F57C00' : '#2E7D32' }}>{order.status}</Text>
              </View>
              {order.settlementStatus === 'Settled' && (
                <View style={[styles.statusBadge, { backgroundColor: '#E1F5FE' }]}>
                  <Text style={{ fontSize: 10, color: '#0288D1' }}>✅ {t('paid') || 'Paid'}</Text>
                </View>
              )}
            </View>
          </View>
          <Text style={styles.customerName}>{order.customer}</Text>
          <Text style={{fontSize: 12, color: COLORS.textGray, marginBottom: 4}}>{t('phone')}: {order.phone}</Text>
          <Text style={{fontSize: 12, color: COLORS.textGray, marginBottom: 8}}>{t('address')}: {order.address}</Text>
          {role === 'owner' && <Text style={styles.driverName}>{t('driver')}: {order.driver || '—'}</Text>}
          
          {order.items && order.items.length > 0 && (
            <View style={{ backgroundColor: '#F8F9FA', padding: 8, borderRadius: 8, marginBottom: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 5 }}>{t('order_items')}:</Text>
              {order.items.map((item, idx) => (
                <Text key={idx} style={{ fontSize: 12, color: '#333', marginBottom: 2 }}>
                  - {item.name ? t(item.name) : 'Item'} x {item.quantity || 1} - {item.price || ''}
                </Text>
              ))}
              <Text style={{ fontSize: 13, fontWeight: 'bold', marginTop: 5, color: COLORS.primary }}>
                {t('total')}: {order.total} MAD
              </Text>
            </View>
          )}

          <View style={styles.orderActions}>
            <TouchableOpacity style={styles.gpsBtn} onPress={() => openGPS(order.location?.lat, order.location?.lng)}>
              <MaterialCommunityIcons name="google-maps" size={18} color={COLORS.white} />
              <Text style={styles.gpsText}>{t('gps_view')}</Text>
            </TouchableOpacity>
            {role === 'owner' && order.status === 'Pending' && (
              <TouchableOpacity style={styles.assignBtn} onPress={() => assignDriver(order.id)}>
                <Text style={styles.assignText}>{t('assign_driver')}</Text>
              </TouchableOpacity>
            )}
            
            {role === 'driver' && order.status === 'Out for Delivery' && (
              <TouchableOpacity style={[styles.assignBtn, { backgroundColor: '#34A853' }]} onPress={() => updateOrderStatus(order.id, 'Completed')}>
                 <Text style={styles.assignText}>{t('mark_completed')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}
    </View>
  );

  const renderUsers = () => (
    <View style={styles.tabContent}>
      <Text style={[styles.tabTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('users_management')}</Text>
      
      {/* Add User Form */}
      <View style={styles.addCard}>
        <Text style={[styles.sectionLabel, { textAlign: isRTL ? 'right' : 'left', marginBottom: 12 }]}>{t('add_user')}</Text>
        <TextInput style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]} placeholder={t('buyer_name')} value={newUserName} onChangeText={setNewUserName}/>
        <TextInput style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]} placeholder={t('username')} value={newUserUsername} onChangeText={setNewUserUsername} autoCapitalize="none"/>
        <TextInput style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]} placeholder={t('email')} value={newUserEmail} onChangeText={setNewUserEmail} keyboardType="email-address" autoCapitalize="none"/>
        <TextInput style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]} placeholder={t('phone')} value={newUserPhone} onChangeText={setNewUserPhone} keyboardType="phone-pad"/>
        <TextInput style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]} placeholder={t('password')} value={newUserPassword} onChangeText={setNewUserPassword} secureTextEntry/>
        <TextInput style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]} placeholder={t('mfa_code') || 'MFA Code'} value={newUserMfaCode} onChangeText={setNewUserMfaCode} keyboardType="numeric"/>
        
        <Text style={[styles.sectionLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{t('select_role')}</Text>
        <View style={[styles.row, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <TouchableOpacity style={[styles.categoryBtn, newUserRole === 'admin' && styles.activeCat]} onPress={() => setNewUserRole('admin')}>
            <MaterialCommunityIcons name="shield-account" size={16} color={newUserRole === 'admin' ? '#FFF' : COLORS.textGray} />
            <Text style={[{ marginLeft: 4 }, newUserRole === 'admin' ? styles.activeCatText : {}]}>{t('admin')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.categoryBtn, newUserRole === 'driver' && styles.activeCat]} onPress={() => setNewUserRole('driver')}>
            <MaterialCommunityIcons name="truck-delivery" size={16} color={newUserRole === 'driver' ? '#FFF' : COLORS.textGray} />
            <Text style={[{ marginLeft: 4 }, newUserRole === 'driver' ? styles.activeCatText : {}]}>{t('driver')}</Text>
          </TouchableOpacity>
        </View>
        
        {newUserRole === 'admin' && userRole === 'owner' && (
          <TouchableOpacity 
            style={[styles.row, { alignItems: 'center', marginBottom: 15, flexDirection: isRTL ? 'row-reverse' : 'row' }]}
            onPress={() => setNewUserCanSettle(!newUserCanSettle)}
          >
            <MaterialCommunityIcons 
              name={newUserCanSettle ? "checkbox-marked" : "checkbox-blank-outline"} 
              size={24} 
              color={newUserCanSettle ? COLORS.primary : COLORS.textGray} 
            />
            <Text style={{ marginLeft: 8, marginRight: 8, color: COLORS.black }}>{t('can_settle_drivers') || 'Allow settling drivers'}</Text>
          </TouchableOpacity>
        )}
        {newUserRole === 'admin' && userRole === 'owner' && (
          <TouchableOpacity 
            style={[styles.row, { alignItems: 'center', marginBottom: 15, flexDirection: isRTL ? 'row-reverse' : 'row' }]}
            onPress={() => setNewUserCanManageCats(!newUserCanManageCats)}
          >
            <MaterialCommunityIcons 
              name={newUserCanManageCats ? "checkbox-marked" : "checkbox-blank-outline"} 
              size={24} 
              color={newUserCanManageCats ? COLORS.primary : COLORS.textGray} 
            />
            <Text style={{ marginLeft: 8, marginRight: 8, color: COLORS.black }}>{t('can_manage_categories') || 'Allow managing categories'}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.addBtn} onPress={handleAddUser}>
          <MaterialCommunityIcons name="account-plus" size={20} color="#FFF" />
          <Text style={[styles.addBtnText, { marginLeft: 8 }]}>{t('add_user')}</Text>
        </TouchableOpacity>
      </View>

      {/* Users List */}
      <Text style={[styles.sectionLabel, { textAlign: isRTL ? 'right' : 'left', marginBottom: 10, marginTop: 5 }]}>
        {t('users_management')} ({usersList.filter(u => u.id !== 'hero_owner').length})
      </Text>
      {usersList.filter(u => u.id !== 'hero_owner').length === 0 ? (
        <Text style={[styles.restrictedText, { color: COLORS.textGray, fontStyle: 'italic' }]}>{t('no_users_yet')}</Text>
      ) : usersList.filter(u => u.id !== 'hero_owner').map(user => (
        <View key={user.id} style={styles.userCard}>
          <View style={[{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', flex: 1 }]}>
            <View style={[styles.userAvatar, { backgroundColor: user.role === 'admin' ? COLORS.primary : (user.role === 'driver' ? '#FF9800' : '#9E9E9E') }]}>
              <MaterialCommunityIcons
                name={user.role === 'admin' ? 'shield-account' : (user.role === 'driver' ? 'truck-delivery' : 'account')}
                size={22} color="#FFF"
              />
            </View>
            <View style={[{ flex: 1 }, isRTL ? { marginRight: 12 } : { marginLeft: 12 }]}>
              <Text style={[styles.userName, { textAlign: isRTL ? 'right' : 'left' }]}>{user.name}</Text>
              <Text style={[styles.userEmail, { textAlign: isRTL ? 'right' : 'left' }]}>@{user.username} {user.phone ? `• ${user.phone}` : ''}</Text>
              {user.email ? <Text style={[styles.userEmail, { fontSize: 11, marginTop: 2, textAlign: isRTL ? 'right' : 'left' }]}>{user.email}</Text> : null}
              <View style={[{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', marginTop: 4 }]}>
                <View style={[styles.rolePill, { backgroundColor: user.role === 'admin' ? '#E8EAF6' : (user.role === 'driver' ? '#FFF3E0' : '#EEEEEE') }]}>
                  <Text style={[styles.rolePillText, { color: user.role === 'admin' ? COLORS.primary : (user.role === 'driver' ? '#E65100' : '#757575') }]}>
                    {t(user.role)}
                  </Text>
                </View>
                <Text style={[styles.userDate, isRTL ? { marginRight: 8 } : { marginLeft: 8 }]}>
                  {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : ''}
                </Text>
              </View>
            </View>
          </View>
          
          <TouchableOpacity onPress={() => startEditUser(user)} style={{ padding: 8 }}>
            <MaterialCommunityIcons name="account-edit" size={22} color={COLORS.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              const msg = t('confirm_delete_user');
              if (Platform.OS === 'web') {
                if (window.confirm(msg)) deleteUser(user.id);
              } else {
                Alert.alert(t('confirm'), msg, [
                  { text: t('back'), style: 'cancel' },
                  { text: t('remove'), style: 'destructive', onPress: () => deleteUser(user.id) }
                ]);
              }
            }}
            style={styles.deleteUserBtn}
          >
            <MaterialCommunityIcons name="account-remove" size={22} color="#F44336" />
          </TouchableOpacity>
        </View>
      ))}

      {/* Edit User Modal (Inline View) */}
      {editingUser && (
        <View style={[styles.addCard, { marginTop: 20, borderColor: COLORS.primary, borderWidth: 1 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 }}>
            <Text style={styles.sectionLabel}>{t('edit_user') || 'Edit User'}</Text>
            <TouchableOpacity onPress={() => setEditingUser(null)}>
              <MaterialCommunityIcons name="close" size={20} color={COLORS.textGray} />
            </TouchableOpacity>
          </View>
          
          <TextInput style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]} placeholder={t('buyer_name')} value={editName} onChangeText={setEditName}/>
          <TextInput style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]} placeholder={t('email')} value={editEmail} onChangeText={setEditEmail} keyboardType="email-address" autoCapitalize="none"/>
          <TextInput style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]} placeholder={t('phone')} value={editPhone} onChangeText={setEditPhone} keyboardType="phone-pad"/>
          <TextInput style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]} placeholder={`${t('password')} (${t('optional') || 'leave blank to keep current'})`} value={editPassword} onChangeText={setEditPassword} secureTextEntry/>
          <TextInput style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]} placeholder={t('mfa_code') || 'MFA Code'} value={editMfaCode} onChangeText={setEditMfaCode} keyboardType="numeric"/>
          
          <Text style={[styles.sectionLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{t('select_role')}</Text>
          <View style={[styles.row, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <TouchableOpacity style={[styles.categoryBtn, editRole === 'admin' && styles.activeCat]} onPress={() => setEditRole('admin')}>
              <MaterialCommunityIcons name="shield-account" size={16} color={editRole === 'admin' ? '#FFF' : COLORS.textGray} />
              <Text style={[{ marginLeft: 4 }, editRole === 'admin' ? styles.activeCatText : {}]}>{t('admin')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.categoryBtn, editRole === 'driver' && styles.activeCat]} onPress={() => setEditRole('driver')}>
              <MaterialCommunityIcons name="truck-delivery" size={16} color={editRole === 'driver' ? '#FFF' : COLORS.textGray} />
              <Text style={[{ marginLeft: 4 }, editRole === 'driver' ? styles.activeCatText : {}]}>{t('driver')}</Text>
            </TouchableOpacity>
          </View>

          {editRole === 'admin' && userRole === 'owner' && (
            <TouchableOpacity 
              style={[styles.row, { alignItems: 'center', marginBottom: 15, flexDirection: isRTL ? 'row-reverse' : 'row' }]}
              onPress={() => setEditCanSettle(!editCanSettle)}
            >
              <MaterialCommunityIcons 
                name={editCanSettle ? "checkbox-marked" : "checkbox-blank-outline"} 
                size={24} 
                color={editCanSettle ? COLORS.primary : COLORS.textGray} 
              />
              <Text style={{ marginLeft: 8, marginRight: 8, color: COLORS.black }}>{t('can_settle_drivers') || 'Allow settling drivers'}</Text>
            </TouchableOpacity>
          )}
          {editRole === 'admin' && userRole === 'owner' && (
            <TouchableOpacity 
              style={[styles.row, { alignItems: 'center', marginBottom: 15, flexDirection: isRTL ? 'row-reverse' : 'row' }]}
              onPress={() => setEditCanManageCats(!editCanManageCats)}
            >
              <MaterialCommunityIcons 
                name={editCanManageCats ? "checkbox-marked" : "checkbox-blank-outline"} 
                size={24} 
                color={editCanManageCats ? COLORS.primary : COLORS.textGray} 
              />
              <Text style={{ marginLeft: 8, marginRight: 8, color: COLORS.black }}>{t('can_manage_categories') || 'Allow managing categories'}</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity style={styles.addBtn} onPress={handleUpdateUser}>
            <Text style={styles.addBtnText}>{t('save') || 'Save Changes'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderArchive = () => (
    <View style={styles.tabContent}>
      <Text style={[styles.tabTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('order_archive')}</Text>
      {completedOrders.length === 0 ? (
        <Text style={[styles.restrictedText, { color: COLORS.textGray, fontStyle: 'italic' }]}>{t('no_completed_orders')}</Text>
      ) : (
        completedOrders.map(order => (
          <View key={order.id} style={styles.archiveCard}>
            <View style={[styles.archiveHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Text style={[styles.archiveOrderId, { textAlign: isRTL ? 'right' : 'left' }]}>{t('order_id')} #{order.id}</Text>
              <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center' }}>
                <View style={[styles.completedBadge, { marginRight: 8 }]}>
                  <MaterialCommunityIcons name="check-circle" size={14} color="#2E7D32" />
                  <Text style={styles.completedText}>{t('mark_completed') || 'Completed'}</Text>
                </View>
                {order.settlementStatus === 'Settled' ? (
                  <View style={[styles.completedBadge, { backgroundColor: '#E3F2FD' }]}>
                    <MaterialCommunityIcons name="cash-check" size={14} color="#1976D2" />
                    <Text style={[styles.completedText, { color: '#1976D2' }]}>{t('paid') || 'Paid'}</Text>
                  </View>
                ) : (
                  <View style={[styles.completedBadge, { backgroundColor: '#FFF3E0' }]}>
                    <MaterialCommunityIcons name="cash-clock" size={14} color="#E65100" />
                    <Text style={[styles.completedText, { color: '#E65100' }]}>{t('unpaid') || 'Unpaid'}</Text>
                  </View>
                )}
              </View>
            </View>
            <View style={{ marginTop: 8 }}>
              <Text style={[styles.archiveDetail, { textAlign: isRTL ? 'right' : 'left' }]}>
                <Text style={{ fontWeight: 'bold' }}>{t('customer')}: </Text>{order.customer || '—'}
              </Text>
              <Text style={[styles.archiveDetail, { textAlign: isRTL ? 'right' : 'left' }]}>
                <Text style={{ fontWeight: 'bold' }}>{t('order_date')}: </Text>{order.timestamp ? new Date(order.timestamp).toLocaleDateString() : '—'}
              </Text>
              <Text style={[styles.archiveDetail, { textAlign: isRTL ? 'right' : 'left' }]}>
                <Text style={{ fontWeight: 'bold' }}>⏱️ {t('duration') || 'Duration'}: </Text>{formatDuration(order.timestamp, order.completedAt, t)}
              </Text>
              <Text style={[styles.archiveDetail, { textAlign: isRTL ? 'right' : 'left' }]}>
                <Text style={{ fontWeight: 'bold' }}>{t('order_total') || 'Total'}: </Text>{order.total || '—'} {t('currency') || 'MAD'}
              </Text>
            </View>
            {order.items && order.items.length > 0 && (
              <View style={styles.archiveItemsList}>
                <Text style={[styles.archiveItemsTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('order_items')}:</Text>
                {order.items.map((item, idx) => (
                  <Text key={idx} style={[styles.archiveItemRow, { textAlign: isRTL ? 'right' : 'left' }]}>
                    - {item.name || t(item.name)} x {item.quantity || 1} - {item.price || ''}
                  </Text>
                ))}
              </View>
            )}
          </View>
        ))
      )}
    </View>
  );

  const renderSettlements = () => {
    const driverIds = Object.keys(unsettledOrdersByDriver);
    const settledOrdersList = orders.filter(o => o.settlementStatus === 'Settled');

    return (
      <View style={styles.tabContent}>
        <Text style={[styles.tabTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('settlements') || 'المحاسبة'}</Text>
        
        <Text style={[styles.sectionLabel, { textAlign: isRTL ? 'right' : 'left', marginTop: 10, color: '#F57C00' }]}>⚠️ {t('unpaid') || 'Unpaid'}</Text>
        {driverIds.length === 0 ? (
          <Text style={[styles.restrictedText, { color: COLORS.textGray, fontStyle: 'italic', marginVertical: 10 }]}>{t('no_unsettled_orders') || 'No pending settlements.'}</Text>
        ) : (
          driverIds.map(dId => {
            const data = unsettledOrdersByDriver[dId];
            const isExpanded = expandedDriverId === dId;
            const totalCash = data.orders.reduce((sum, o) => sum + (parseFloat(String(o.total || 0).replace(/[^\d.]/g, '')) || 0), 0);
            const defaultComm = parseFloat(commissions[dId] || '10') || 10;
            const totalCommission = data.orders.length * defaultComm;
            const netToCollect = totalCash - totalCommission;
            const driverUser = usersList.find(u => u.id === dId);
            const driverPhone = data.orders[0]?.driverPhone || driverUser?.phone || '';
            
            return (
              <View key={dId} style={[styles.archiveCard, { borderLeftColor: '#F57C00', borderLeftWidth: 4 }]}>
                <TouchableOpacity onPress={() => setExpandedDriverId(isExpanded ? null : dId)} style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center' }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FF9800', alignItems: 'center', justifyContent: 'center', marginHorizontal: 8 }}>
                      <MaterialCommunityIcons name="truck-delivery" size={22} color="#FFF" />
                    </View>
                    <View>
                      <Text style={{ fontSize: 16, fontWeight: 'bold' }}>{data.driverName}</Text>
                      {driverPhone ? (
                        <TouchableOpacity onPress={() => Linking.openURL('tel:' + driverPhone)}>
                          <Text style={{ fontSize: 12, color: COLORS.primary }}>📞 {driverPhone}</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                  <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center' }}>
                    <View style={{ backgroundColor: '#FFF3E0', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginHorizontal: 6 }}>
                      <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#E65100' }}>{data.orders.length} {t('orders') || 'طلبات'}</Text>
                    </View>
                    <MaterialCommunityIcons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={24} color={COLORS.textGray} />
                  </View>
                </TouchableOpacity>

                <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', marginTop: 12, backgroundColor: '#F5F5F5', padding: 10, borderRadius: 8, justifyContent: 'space-around' }}>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 10, color: COLORS.textGray }}>{t('total_cash_collected') || 'الكاش المستلم'}</Text>
                    <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#2E7D32' }}>{totalCash.toFixed(2)}</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 10, color: COLORS.textGray }}>{t('total_commissions') || 'عمولات السائق'}</Text>
                    <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#FF9800' }}>{totalCommission.toFixed(2)}</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 10, color: COLORS.textGray }}>{t('net_to_collect') || 'المطلوب توريده'}</Text>
                    <Text style={{ fontSize: 15, fontWeight: 'bold', color: COLORS.primary }}>{netToCollect.toFixed(2)}</Text>
                  </View>
                </View>

                {isExpanded && (
                  <View style={{ marginTop: 15, borderTopWidth: 1, borderTopColor: '#EEE', paddingTop: 15 }}>
                    {data.orders.map(order => (
                      <View key={order.id} style={{ marginBottom: 15, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' }}>
                        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={{ fontSize: 14, fontWeight: 'bold' }}>{t('order_id')} #{order.id}</Text>
                          <Text style={{ fontSize: 12, color: '#2E7D32', fontWeight: 'bold' }}>{order.total || '—'} MAD</Text>
                        </View>
                        <Text style={{ fontSize: 11, color: COLORS.textGray, marginTop: 2 }}>{order.customer || ''} - {order.address || ''}</Text>
                        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', marginTop: 8, justifyContent: 'space-between' }}>
                          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center' }}>
                            <Text style={{ fontSize: 13, marginHorizontal: 5 }}>{t('commission') || 'العمولة'}:</Text>
                            <TextInput style={[styles.smallInput, { width: 60 }]} keyboardType="numeric" value={commissions[order.id] !== undefined ? commissions[order.id] : '10'} onChangeText={(val) => setCommissions(prev => ({ ...prev, [order.id]: val }))} />
                            <Text style={{ fontSize: 12, color: COLORS.textGray, marginHorizontal: 5 }}>MAD</Text>
                          </View>
                          <TouchableOpacity style={[styles.assignBtn, { paddingVertical: 6, paddingHorizontal: 12 }]} onPress={() => handleSettleOrder(order.id, order.total)}>
                            <Text style={styles.assignText}>{t('settle_order') || 'تصفية الطلب'}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                    <View style={{ backgroundColor: '#E8F5E9', padding: 15, borderRadius: 10, marginTop: 10 }}>
                      <Text style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 10, color: '#2E7D32' }}>{t('bulk_settlement') || 'تصفية كل طلبات السائق'}</Text>
                      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', marginVertical: 10 }}>
                        <Text style={{ fontSize: 13, marginHorizontal: 5 }}>{t('default_commission_per_order') || 'العمولة لكل طلب'}:</Text>
                        <TextInput style={[styles.smallInput, { width: 60 }]} keyboardType="numeric" value={commissions[dId] !== undefined ? commissions[dId] : '10'} onChangeText={(val) => setCommissions(prev => ({ ...prev, [dId]: val }))} />
                        <Text style={{ fontSize: 12, color: COLORS.textGray, marginHorizontal: 5 }}>MAD</Text>
                      </View>
                      <TextInput 
                        style={[styles.input, { height: 40, marginBottom: 15, backgroundColor: '#FFF', borderRadius: 8, paddingHorizontal: 10 }]} 
                        placeholder={t('settlement_note_placeholder') || 'General note...'}
                        value={settleNotes[dId]}
                        onChangeText={v => setSettleNotes(p => ({...p, [dId]: v}))}
                      />
                      <TouchableOpacity style={[styles.addBtn, { backgroundColor: '#FF9800' }]} onPress={() => handleSettleAll(dId, data.orders, commissions[dId] || '10')}>
                         <MaterialCommunityIcons name="cash-multiple" size={20} color="#FFF" />
                         <Text style={[styles.addBtnText, { marginLeft: 8 }]}>{t('settle_all') || 'تصفية الكل دفعة واحدة'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            );
          })
        )}

        {/* Settlement History */}
        <Text style={[styles.sectionLabel, { textAlign: isRTL ? 'right' : 'left', marginTop: 30, color: '#2E7D32' }]}>✅ {t('settlement_history') || 'Settlement History'}</Text>
        {settledOrdersList.length === 0 ? (
          <Text style={[styles.restrictedText, { color: COLORS.textGray, fontStyle: 'italic', marginVertical: 10 }]}>{t('no_settled_orders') || 'No settlement history.'}</Text>
        ) : (
          settledOrdersList.sort((a,b) => new Date(b.settledAt) - new Date(a.settledAt)).map(order => (
            <View key={order.id} style={[styles.archiveCard, { borderLeftColor: '#2E7D32', borderLeftWidth: 4, opacity: 0.9 }]}>
               <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: 'bold' }}>{order.driver || '—'}</Text>
                  <Text style={{ fontSize: 12, color: '#2E7D32', fontWeight: 'bold' }}>{t('paid') || 'Paid'}</Text>
               </View>
               <Text style={{ fontSize: 12, color: COLORS.textGray, marginVertical: 4 }}>{t('order_id')} #{order.id} • {new Date(order.settledAt).toLocaleString()}</Text>
               <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', backgroundColor: '#F9F9F9', padding: 8, borderRadius: 6, marginTop: 5 }}>
                  <Text style={{ fontSize: 11 }}>{t('order_total')}: {order.total}</Text>
                  <Text style={{ fontSize: 11, fontWeight: 'bold', color: COLORS.primary }}>{t('commission')}: {order.driverCommission} MAD</Text>
               </View>
               {order.settlementNotes ? (
                 <Text style={{ fontSize: 11, color: '#666', fontStyle: 'italic', marginTop: 6 }}>📝 {order.settlementNotes}</Text>
               ) : null}
            </View>
          ))
        )}
      </View>
    );
  };

  const renderAuditLogs = () => {
    if (userRole !== 'owner') return null;
    return (
      <View style={styles.tabContent}>
        <Text style={[styles.tabTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('audit_logs') || 'سجلات النظام'}</Text>
        {auditLogs.length === 0 ? (
          <Text style={[styles.restrictedText, { color: COLORS.textGray, fontStyle: 'italic' }]}>{t('no_logs') || 'No records.'}</Text>
        ) : (
          auditLogs.map(log => (
            <View key={log.id} style={[styles.archiveCard, { borderLeftColor: '#9C27B0' }]}>
              <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#9C27B0' }}>{log.action}</Text>
                <Text style={{ fontSize: 11, color: COLORS.textGray }}>{new Date(log.timestamp).toLocaleString()}</Text>
              </View>
              <Text style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>Admin ID: {log.adminId}</Text>
              <Text style={{ fontSize: 12, color: '#444' }}>{JSON.stringify(log.details)}</Text>
            </View>
          ))
        )}
      </View>
    );
  };

  if (isLoading) {
    return <View style={styles.mfaContainer}><ActivityIndicator size="large" color={COLORS.primary}/></View>;
  }

  return (
    <View style={styles.container}>
      {userRole === 'owner' && (
        <View style={styles.roleHeader}>
           <TouchableOpacity onPress={() => setRole(role === 'owner' ? 'driver' : (role === 'driver' ? 'admin' : 'owner'))}>
              <Text style={styles.roleToggleText}>{t('active_role')}: <Text style={{fontWeight:'bold'}}>{role.toUpperCase()}</Text> ({t('tap_to_switch')})</Text>
           </TouchableOpacity>
        </View>
      )}

      <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <MaterialCommunityIcons name="logout" size={20} color="#F44336" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { textAlign: isRTL ? 'right' : 'left', flex: 1 }]}>{t('admin_panel')}</Text>
        <View style={[styles.langSwitcher, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {languages.map((lang) => (
            <TouchableOpacity key={lang.code} onPress={() => changeLanguage(lang.code)} style={[styles.langButton, i18n.language === lang.code && styles.langButtonActive]}>
              <Text style={[styles.langText, i18n.language === lang.code && styles.langTextActive]}>{lang.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Tab Navigation */}
      <View style={{ position: 'relative' }}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          style={{ maxHeight: 50, marginBottom: 10 }} 
          contentContainerStyle={[styles.switcher, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
          onScroll={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            const isAtEnd = isRTL 
              ? contentOffset.x <= 10 
              : contentOffset.x + layoutMeasurement.width >= contentSize.width - 10;
            if (isAtEnd && showScrollArrow) setShowScrollArrow(false);
            if (!isAtEnd && !showScrollArrow) setShowScrollArrow(true);
          }}
          scrollEventThrottle={100}
        >
        {isAdmin && (
           <TouchableOpacity style={[styles.switchTab, activeTab === 'inventory' && styles.activeTab]} onPress={() => setActiveTab('inventory')}>
             <MaterialCommunityIcons name="package-variant-closed" size={18} color={activeTab === 'inventory' ? COLORS.white : COLORS.textGray} />
             <Text style={[styles.switchText, activeTab === 'inventory' && styles.activeTabText]}>{t('stock')}</Text>
           </TouchableOpacity>
        )}
        {isAdmin && (
           <TouchableOpacity style={[styles.switchTab, activeTab === 'categories' && styles.activeTab]} onPress={() => setActiveTab('categories')}>
             <MaterialCommunityIcons name="shape-outline" size={18} color={activeTab === 'categories' ? COLORS.white : COLORS.textGray} />
             <Text style={[styles.switchText, activeTab === 'categories' && styles.activeTabText]}>{t('manage_categories')}</Text>
           </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.switchTab, activeTab === 'orders' && styles.activeTab]} onPress={() => setActiveTab('orders')}>
          <MaterialCommunityIcons name="truck-delivery" size={18} color={activeTab === 'orders' ? COLORS.white : COLORS.textGray} />
          <Text style={[styles.switchText, activeTab === 'orders' && styles.activeTabText]}>{t('orders')}</Text>
        </TouchableOpacity>
        {canSettle && (
          <TouchableOpacity style={[styles.switchTab, activeTab === 'settlements' && styles.activeTab]} onPress={() => setActiveTab('settlements')}>
            <MaterialCommunityIcons name="cash-register" size={18} color={activeTab === 'settlements' ? COLORS.white : COLORS.textGray} />
            <Text style={[styles.switchText, activeTab === 'settlements' && styles.activeTabText]}>{t('settlements') || 'المحاسبة'}</Text>
          </TouchableOpacity>
        )}
        {role === 'owner' && userRole === 'owner' && (
          <>
            <TouchableOpacity style={[styles.switchTab, activeTab === 'finance' && styles.activeTab]} onPress={() => setActiveTab('finance')}>
              <MaterialCommunityIcons name="finance" size={18} color={activeTab === 'finance' ? COLORS.white : COLORS.textGray} />
              <Text style={[styles.switchText, activeTab === 'finance' && styles.activeTabText]}>{t('finance')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.switchTab, activeTab === 'users' && styles.activeTab]} onPress={() => setActiveTab('users')}>
              <MaterialCommunityIcons name="account-group" size={18} color={activeTab === 'users' ? COLORS.white : COLORS.textGray} />
              <Text style={[styles.switchText, activeTab === 'users' && styles.activeTabText]}>{t('users_management')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.switchTab, activeTab === 'archive' && styles.activeTab]} onPress={() => setActiveTab('archive')}>
              <MaterialCommunityIcons name="archive" size={18} color={activeTab === 'archive' ? COLORS.white : COLORS.textGray} />
              <Text style={[styles.switchText, activeTab === 'archive' && styles.activeTabText]}>{t('archive')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.switchTab, activeTab === 'audit_logs' && styles.activeTab]} onPress={() => setActiveTab('audit_logs')}>
              <MaterialCommunityIcons name="clipboard-text-clock" size={18} color={activeTab === 'audit_logs' ? COLORS.white : COLORS.textGray} />
              <Text style={[styles.switchText, activeTab === 'audit_logs' && styles.activeTabText]}>{t('audit_logs') || 'سجلات النظام'}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
        {showScrollArrow && isMobile && (
          <Animated.View style={{ position: 'absolute', top: 10, [isRTL ? 'left' : 'right']: 2, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 15, padding: 5, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, transform: [{ translateX: scrollArrowAnim }] }}>
            <MaterialCommunityIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={22} color={COLORS.primary} />
          </Animated.View>
        )}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 50 }}>
        {activeTab === 'inventory' && renderInventory()}
        {activeTab === 'categories' && renderCategoryManager()}
        {activeTab === 'orders' && renderOrders()}
        {activeTab === 'settlements' && canSettle && renderSettlements()}
        {activeTab === 'finance' && role === 'owner' && userRole === 'owner' && renderFinancials()}
        {activeTab === 'users' && role === 'owner' && userRole === 'owner' && renderUsers()}
        {activeTab === 'archive' && role === 'owner' && userRole === 'owner' && renderArchive()}
        {activeTab === 'audit_logs' && userRole === 'owner' && renderAuditLogs()}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA', paddingTop: 20 },
  roleHeader: { backgroundColor: '#FFD54F', padding: 8, alignItems: 'center' },
  roleToggleText: { fontSize: 11, color: '#000' },
  header: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, marginBottom: 15 },
  headerTitle: { fontSize: 24, fontWeight: 'bold' },
  langSwitcher: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 8, padding: 2, elevation: 2 },
  langButton: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6 },
  langButtonActive: { backgroundColor: COLORS.primary },
  langText: { fontSize: 11, fontWeight: 'bold', color: COLORS.textGray },
  langTextActive: { color: COLORS.white },
  switcher: { paddingHorizontal: 15 },
  switchTab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, marginRight: 6, elevation: 2 },
  activeTab: { backgroundColor: COLORS.primary },
  switchText: { marginLeft: 5, fontSize: 11, color: COLORS.textGray },
  activeTabText: { color: COLORS.white },
  tabContent: { paddingHorizontal: 20 },
  tabTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15 },
  tabSubText: { color: COLORS.textGray, marginTop: 15, fontSize: 12, fontStyle: 'italic' },
  restrictedText: { color: '#F44336', textAlign: 'center', marginVertical: 30, fontStyle: 'italic' },
  addCard: { backgroundColor: '#FFF', padding: 15, borderRadius: 15, marginBottom: 20, elevation: 3 },
  input: { borderBottomWidth: 1, borderColor: '#EEE', paddingVertical: 8, marginBottom: 15 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: COLORS.black, marginBottom: 8 },
  row: { flexDirection: 'row', marginBottom: 15, flexWrap: 'wrap' },
  categoryBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#DDD', marginRight: 8, marginBottom: 6 },
  activeCat: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  activeCatText: { color: '#FFF' },
  addBtn: { backgroundColor: COLORS.primary, padding: 12, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  addBtnText: { color: '#FFF', fontWeight: 'bold' },
  listItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF', padding: 12, borderRadius: 12, marginBottom: 10 },
  itemName: { fontWeight: 'bold', fontSize: 15 },
  itemSub: { color: COLORS.textGray, fontSize: 12 },
  itemControlRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  stockBtn: { backgroundColor: '#F0F0F0', borderRadius: 6, padding: 6, marginHorizontal: 2 },
  smallInput: { backgroundColor: '#F0F0F0', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 4, width: 55, fontSize: 11, marginLeft: 6 },
  financeCard: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#2E7D32', padding: 25, borderRadius: 15, elevation: 4 },
  financeLabel: { color: '#E8F5E9', fontSize: 12 },
  financeValue: { color: '#FFF', fontSize: 24, fontWeight: 'bold' },
  orderCard: { backgroundColor: '#FFF', padding: 15, borderRadius: 15, marginBottom: 15, elevation: 2 },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  orderId: { fontWeight: 'bold' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 5 },
  customerName: { fontSize: 16, fontWeight: '600' },
  driverName: { color: COLORS.textGray, fontSize: 12, marginBottom: 15 },
  orderActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  gpsBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#34A853', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  gpsText: { color: '#FFF', marginLeft: 5, fontWeight: '600' },
  assignBtn: { backgroundColor: COLORS.secondary, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 },
  assignText: { color: '#FFF', fontWeight: '600' },
  mfaContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },

  // Category Filter
  catFilterBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 8, elevation: 1, borderWidth: 1, borderColor: '#E0E0E0' },
  catFilterBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  catFilterText: { fontSize: 11, marginLeft: 4, color: COLORS.textGray, fontWeight: '600' },
  catFilterTextActive: { color: COLORS.white },

  // Archive
  archiveCard: { backgroundColor: '#FFF', padding: 15, borderRadius: 15, marginBottom: 12, elevation: 2, borderLeftWidth: 4, borderLeftColor: '#4CAF50' },
  archiveHeader: { justifyContent: 'space-between', alignItems: 'center' },
  archiveOrderId: { fontWeight: 'bold', fontSize: 14 },
  completedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  completedText: { fontSize: 10, color: '#2E7D32', fontWeight: '600', marginLeft: 4 },
  archiveDetail: { fontSize: 13, color: '#555', marginBottom: 4 },
  archiveItemsList: { marginTop: 10, backgroundColor: '#FAFAFA', padding: 10, borderRadius: 8 },
  archiveItemsTitle: { fontSize: 12, fontWeight: 'bold', color: COLORS.primary, marginBottom: 6 },
  archiveItemRow: { fontSize: 12, color: '#444', marginBottom: 3 },

  // User Cards
  userCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFF', padding: 14, borderRadius: 14, marginBottom: 10, elevation: 2 },
  userAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  userName: { fontSize: 15, fontWeight: '700', color: '#333' },
  userEmail: { fontSize: 12, color: COLORS.textGray, marginTop: 1 },
  rolePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  rolePillText: { fontSize: 10, fontWeight: '700' },
  userDate: { fontSize: 10, color: COLORS.textGray },
  deleteUserBtn: { padding: 8 },
  logoutBtn: { padding: 8, marginRight: 10 },
  
  // Modal & Overlay
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, justifyContent: 'center' },
  modalScroll: { padding: 20, justifyContent: 'center', minHeight: '100%' },
  modalCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 25, elevation: 10 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.black, marginBottom: 20 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textGray, marginBottom: 5 },
  unitBtn: { flex: 1, backgroundColor: '#F0F0F0', paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#EEE' },
  unitBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  unitText: { fontSize: 13, color: COLORS.textGray, fontWeight: '600' },
  unitTextActive: { color: '#FFF' },
  saveBtn: { backgroundColor: COLORS.primary, padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 10, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5 },
  saveBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 }
});

export default AdminDashboardScreen;
