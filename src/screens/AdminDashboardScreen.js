import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, FlatList, Alert, Linking, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants/theme';
import { getSecurely, saveSecurely } from '../services/StorageService';
import { logAdminAction } from '../services/AuditService';
import { changeLanguage } from '../services/i18n';
import { registerUser, listenToOrders, assignOrderDriverAsync, updateOrderStatusAsync } from '../services/FirebaseService';
import { useTranslation } from 'react-i18next';

const AdminDashboardScreen = () => {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  
  const languages = [
    { code: 'fr', label: 'FR' },
    { code: 'ar', label: 'AR' },
    { code: 'en', label: 'EN' },
  ];

  // Tabs: inventory, orders, finance, users, archive
  const [activeTab, setActiveTab] = useState('inventory');
  const [role, setRole] = useState('admin'); // owner, admin, driver
  const [isLoading, setIsLoading] = useState(true);

  // --- Real-time State ---
  const [inventory, setInventory] = useState([]);
  const [orders, setOrders] = useState([]);
  const [newItem, setNewItem] = useState({ name: '', category: '1', price: '', discount: '0%' });
  const [inventoryCatFilter, setInventoryCatFilter] = useState('all');

  // Users Management State
  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState('admin');
  const [usersList, setUsersList] = useState([]);

  const categoryMap = [
    { id: 'all', label: t('all_categories'), icon: 'view-grid' },
    { id: '1', label: t('vegetables'), icon: 'carrot' },
    { id: '2', label: t('clothing'), icon: 'tshirt-crew' },
    { id: '3', label: t('groceries'), icon: 'basket' },
    { id: '4', label: t('local_crafts'), icon: 'palette' },
    { id: '5', label: t('makeup'), icon: 'lipstick' },
  ];

  const loadInventory = async () => {
    const data = await getSecurely('products_v1');
    if (data) setInventory(JSON.parse(data));
  };

  const saveInventory = async (newInv) => {
    setInventory(newInv);
    await saveSecurely('products_v1', JSON.stringify(newInv));
  };

  const loadUsers = async () => {
    const data = await getSecurely('app_users');
    if (data) setUsersList(JSON.parse(data));
  };

  const deleteUser = async (userId) => {
    const updated = usersList.filter(u => u.id !== userId);
    setUsersList(updated);
    await saveSecurely('app_users', JSON.stringify(updated));
    await handleAdminAction('DELETE_USER', { userId });
    Alert.alert(t('success'), t('user_deleted'));
  };

  useEffect(() => {
    const fetchRole = async () => {
      const storedRole = await getSecurely('userRole');
      if (storedRole) setRole(storedRole);
    };
    fetchRole();
    loadInventory();
    loadUsers();

    const unsubscribeOrders = listenToOrders(setOrders);
    setTimeout(() => setIsLoading(false), 800);
    return () => {
      if (unsubscribeOrders) unsubscribeOrders();
    };
  }, []);

  // --- Handlers ---
  const handleAdminAction = async (action, details) => {
    if (role !== 'owner' && role !== 'admin') return Alert.alert(t('access_denied'), t('drivers_cannot_manage'));
    await logAdminAction('admin_001', action, details);
  };

  const addInventoryItem = async () => {
    if (!newItem.name || !newItem.price) return Alert.alert(t('error'), t('fill_fields'));
    const itemToAdd = {
      ...newItem,
      id: 'p' + Date.now(),
      price: newItem.price.includes('MAD') ? newItem.price : newItem.price + ' MAD',
      image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=400',
      vendor: 'Admin',
      stock: 100,
      sold: 0
    };
    const newInv = [...inventory, itemToAdd];
    await saveInventory(newInv);
    await handleAdminAction('ADD_PRODUCT', { name: newItem.name, category: newItem.category });
    setNewItem({ name: '', category: '1', price: '', discount: '0%' });
    Alert.alert(t('success'), t('add_product') + ' ✓');
  };

  const deleteInventoryItem = async (id) => {
    const newInv = inventory.filter(i => i.id !== id);
    await saveInventory(newInv);
    await handleAdminAction('DELETE_PRODUCT', { id });
  };

  const updatePrice = async (id, newPrice) => {
    const newInv = inventory.map(i => i.id === id ? { ...i, price: newPrice + ' MAD' } : i);
    await saveInventory(newInv);
    await handleAdminAction('UPDATE_PRICE', { id, newPrice });
  };

  const setFlashDeal = async (id, percentage) => {
    const newInv = inventory.map(i => i.id === id ? { ...i, discount: percentage + '% OFF', oldPrice: i.price } : i);
    await saveInventory(newInv);
    await handleAdminAction('SET_FLASH_DEAL', { id, percentage });
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
        password: newUserPassword,
        role: newUserRole,
        createdAt: new Date().toISOString()
      };
      const updated = [...usersList, newUser];
      setUsersList(updated);
      await saveSecurely('app_users', JSON.stringify(updated));
      await handleAdminAction('ADD_USER', { username: newUserUsername, role: newUserRole });
      Alert.alert(t('success'), t('user_added_success'));
      setNewUserUsername('');
      setNewUserEmail('');
      setNewUserPhone('');
      setNewUserPassword('');
      setNewUserName('');
      setNewUserRole('admin');
    } catch (e) {
      Alert.alert(t('error'), e.message);
    }
  };

  // --- Filtered Views for RBAC ---
  const isAdmin = role === 'owner' || role === 'admin';
  const filteredOrders = isAdmin ? orders : orders.filter(o => o.driverId === 'd1');
  const completedOrders = orders.filter(o => o.status === 'Completed');

  // Inventory filtered by category
  const filteredInventory = inventoryCatFilter === 'all' 
    ? inventory 
    : inventory.filter(i => i.category === inventoryCatFilter);

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
      <Text style={[styles.tabTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('inventory_management')}</Text>
      
      {renderCategoryFilter()}

      {isAdmin ? (
        <View style={styles.addCard}>
          <TextInput style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]} placeholder={t('product_name')} value={newItem.name} onChangeText={(text) => setNewItem({...newItem, name: text})}/>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 15 }} contentContainerStyle={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
            {categoryMap.filter(c => c.id !== 'all').map(cat => (
              <TouchableOpacity 
                key={cat.id}
                style={[styles.categoryBtn, newItem.category === cat.id && styles.activeCat]} 
                onPress={() => setNewItem({...newItem, category: cat.id})}
              >
                <Text style={newItem.category === cat.id ? styles.activeCatText : {}}>{cat.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TextInput style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]} placeholder={t('price')} value={newItem.price} onChangeText={(text) => setNewItem({...newItem, price: text})} keyboardType="numeric"/>
          <TouchableOpacity style={styles.addBtn} onPress={addInventoryItem}>
            <Text style={styles.addBtnText}>{t('add_product')}</Text>
          </TouchableOpacity>
        </View>
      ) : <Text style={styles.restrictedText}>{t('drivers_cannot_manage')}</Text>}

      <FlatList
        data={filteredInventory}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.listItem}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemName, { textAlign: isRTL ? 'right' : 'left' }]}>{t(item.name) || item.name}</Text>
              <Text style={[styles.itemSub, { textAlign: isRTL ? 'right' : 'left' }]}>
                {categoryMap.find(c => c.id === item.category)?.label || item.category} • {item.price} {item.oldPrice ? `(${t('was')} ${item.oldPrice})` : ''}
              </Text>
              {item.discount && <Text style={{ fontSize: 10, color: '#E53935', fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('sale')}: {item.discount}</Text>}
              <Text style={{fontSize: 12, color: COLORS.primary, fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left', marginTop: 4}}>
                 {t('stock_remaining')}: {item.stock !== undefined ? item.stock : 100} | {t('sold')}: {item.sold || 0}
              </Text>
            </View>
            
            <View style={styles.itemControlRow}>
              {/* Stock +/- buttons */}
              <TouchableOpacity onPress={() => adjustStock(item.id, -1)} style={styles.stockBtn}>
                <MaterialCommunityIcons name="minus" size={16} color="#E53935" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => adjustStock(item.id, 1)} style={styles.stockBtn}>
                <MaterialCommunityIcons name="plus" size={16} color="#4CAF50" />
              </TouchableOpacity>

              {role === 'owner' && (
                 <TouchableOpacity onPress={() => resetStock(item.id)} style={{ marginLeft: 6 }}>
                   <MaterialCommunityIcons name="restore" size={22} color="#FF9800" />
                 </TouchableOpacity>
              )}
              <TextInput 
                style={styles.smallInput} 
                placeholder={t('price')} 
                keyboardType="numeric"
                onSubmitEditing={(e) => updatePrice(item.id, e.nativeEvent.text)}
              />
              <TextInput 
                style={styles.smallInput} 
                placeholder={t('percent_off')} 
                keyboardType="numeric"
                onSubmitEditing={(e) => setFlashDeal(item.id, e.nativeEvent.text)}
              />
              <TouchableOpacity onPress={() => deleteInventoryItem(item.id)} style={{ marginLeft: 8 }}>
                <MaterialCommunityIcons name="delete-outline" size={22} color="#F44336" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );

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
        <View style={styles.financeCard}>
           <View>
             <Text style={styles.financeLabel}>{t('total_revenue')}</Text>
             <Text style={styles.financeValue}>{revenueTotal} MAD</Text>
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
            <View style={[styles.statusBadge, { backgroundColor: order.status === 'Pending' ? '#FFE0B2' : '#E8F5E9' }]}>
              <Text style={{ fontSize: 10, color: order.status === 'Pending' ? '#F57C00' : '#2E7D32' }}>{order.status}</Text>
            </View>
          </View>
          <Text style={styles.customerName}>{order.customer}</Text>
          {role === 'owner' && <Text style={styles.driverName}>{t('driver')}: {order.driver}</Text>}
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
        <TouchableOpacity style={styles.addBtn} onPress={handleAddUser}>
          <MaterialCommunityIcons name="account-plus" size={20} color="#FFF" />
          <Text style={[styles.addBtnText, { marginLeft: 8 }]}>{t('add_user')}</Text>
        </TouchableOpacity>
      </View>

      {/* Users List */}
      <Text style={[styles.sectionLabel, { textAlign: isRTL ? 'right' : 'left', marginBottom: 10, marginTop: 5 }]}>
        {t('users_management')} ({usersList.length})
      </Text>
      {usersList.length === 0 ? (
        <Text style={[styles.restrictedText, { color: COLORS.textGray, fontStyle: 'italic' }]}>{t('no_users_yet')}</Text>
      ) : usersList.map(user => (
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
          <TouchableOpacity
            onPress={() => Alert.alert(t('access_denied'), t('confirm_delete_user'), [
              { text: t('back'), style: 'cancel' },
              { text: t('remove'), style: 'destructive', onPress: () => deleteUser(user.id) }
            ])}
            style={styles.deleteUserBtn}
          >
            <MaterialCommunityIcons name="account-remove" size={22} color="#F44336" />
          </TouchableOpacity>
        </View>
      ))}
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
              <View style={styles.completedBadge}>
                <MaterialCommunityIcons name="check-circle" size={14} color="#2E7D32" />
                <Text style={styles.completedText}>{t('mark_completed')}</Text>
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
                <Text style={{ fontWeight: 'bold' }}>{t('order_total')}: </Text>{order.total || '—'}
              </Text>
            </View>
            {order.items && order.items.length > 0 && (
              <View style={styles.archiveItemsList}>
                <Text style={[styles.archiveItemsTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('order_items')}:</Text>
                {order.items.map((item, idx) => (
                  <Text key={idx} style={[styles.archiveItemRow, { textAlign: isRTL ? 'right' : 'left' }]}>
                    • {item.name || t(item.name)} × {item.quantity || 1} — {item.price || ''}
                  </Text>
                ))}
              </View>
            )}
          </View>
        ))
      )}
    </View>
  );

  if (isLoading) {
    return <View style={styles.mfaContainer}><ActivityIndicator size="large" color={COLORS.primary}/></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.roleHeader}>
         <TouchableOpacity onPress={() => setRole(role === 'owner' ? 'driver' : (role === 'driver' ? 'admin' : 'owner'))}>
            <Text style={styles.roleToggleText}>{t('active_role')}: <Text style={{fontWeight:'bold'}}>{role.toUpperCase()}</Text> ({t('tap_to_switch')})</Text>
         </TouchableOpacity>
      </View>

      <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 50, marginBottom: 10 }} contentContainerStyle={[styles.switcher, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        {isAdmin && (
           <TouchableOpacity style={[styles.switchTab, activeTab === 'inventory' && styles.activeTab]} onPress={() => setActiveTab('inventory')}>
             <MaterialCommunityIcons name="package-variant-closed" size={18} color={activeTab === 'inventory' ? COLORS.white : COLORS.textGray} />
             <Text style={[styles.switchText, activeTab === 'inventory' && styles.activeTabText]}>{t('stock')}</Text>
           </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.switchTab, activeTab === 'orders' && styles.activeTab]} onPress={() => setActiveTab('orders')}>
          <MaterialCommunityIcons name="truck-delivery" size={18} color={activeTab === 'orders' ? COLORS.white : COLORS.textGray} />
          <Text style={[styles.switchText, activeTab === 'orders' && styles.activeTabText]}>{t('orders')}</Text>
        </TouchableOpacity>
        {role === 'owner' && (
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
          </>
        )}
      </ScrollView>

      <ScrollView contentContainerStyle={{ paddingBottom: 50 }}>
        {activeTab === 'inventory' && renderInventory()}
        {activeTab === 'orders' && renderOrders()}
        {activeTab === 'finance' && role === 'owner' && renderFinancials()}
        {activeTab === 'users' && role === 'owner' && renderUsers()}
        {activeTab === 'archive' && role === 'owner' && renderArchive()}
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
});

export default AdminDashboardScreen;
