import React from 'react';
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
import { AuthProvider, useAuth } from './src/context/AuthContext';
import './src/services/i18n';

const Stack = createStackNavigator();

const linking = {
  prefixes: ['/'],
  config: {
    screens: {
      Home: '',
      Cart: 'cart',
      FlashDeals: 'flash',
      AdminDashboard: 'admin',
      DriverDashboard: 'driver',
    },
  },
};

function RootNavigator() {
  const { isAuthenticated, userRole, isMfaVerified, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
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
        
        {/* Strictly Protected Screens */}
        <Stack.Screen 
          name="AdminDashboard" 
          component={isAuthenticated && (userRole === 'owner' || userRole === 'admin') && isMfaVerified ? AdminDashboardScreen : LoginScreen} 
        />
        <Stack.Screen 
          name="DriverDashboard" 
          component={isAuthenticated && userRole === 'driver' ? DriverDashboardScreen : LoginScreen} 
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <HelmetProvider>
      <SafeAreaProvider>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </HelmetProvider>
  );
}
