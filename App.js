import React, { useState, useEffect } from 'react';
import { StatusBar, ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { HelmetProvider } from 'react-helmet-async';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import HomeScreen from './src/screens/HomeScreen';
import CartScreen from './src/screens/CartScreen';
import AdminDashboardScreen from './src/screens/AdminDashboardScreen';
import DriverDashboardScreen from './src/screens/DriverDashboardScreen';
import FlashDealsScreen from './src/screens/FlashDealsScreen';
import LoginScreen from './src/screens/LoginScreen';
import { COLORS } from './src/constants/theme';
import { getSecurely } from './src/services/StorageService';
import './src/services/i18n';

const Stack = createStackNavigator();

const linking = {
  config: {
    screens: {
      Home: '',
      Cart: 'cart',
      FlashDeals: 'flash',
      Login: 'login',
      AdminDashboard: 'admin',
      DriverDashboard: 'driver',
    },
  },
};

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    checkToken();
  }, []);

  const checkToken = async () => {
    try {
      const token = await getSecurely('userToken');
      const role = await getSecurely('userRole');
      if (token) {
        setIsAuthenticated(true);
        setUserRole(role);
      } else {
        setIsAuthenticated(false);
        setUserRole(null);
      }
    } catch (e) {
      console.error('Auth Check Error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <HelmetProvider>
      <SafeAreaProvider>
        <NavigationContainer linking={linking}>
          <StatusBar barStyle="dark-content" backgroundColor={COLORS.gray} />
          <Stack.Navigator
            screenOptions={{ headerShown: false }}
            initialRouteName="Home"
          >
            {/* Public Screens */}
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Cart" component={CartScreen} />
            <Stack.Screen name="FlashDeals" component={FlashDealsScreen} />
            
            <Stack.Screen name="Login" component={LoginScreen} />

            {/* Strictly Protected Screens */}
            <Stack.Screen 
              name="AdminDashboard" 
              component={isAuthenticated && (userRole === 'owner' || userRole === 'admin') ? AdminDashboardScreen : LoginScreen} 
            />
            <Stack.Screen 
              name="DriverDashboard" 
              component={isAuthenticated && userRole === 'driver' ? DriverDashboardScreen : LoginScreen} 
            />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </HelmetProvider>
  );
}
