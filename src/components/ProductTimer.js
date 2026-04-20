import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

const ProductTimer = ({ endsAt, onExpire }) => {
  const { t } = useTranslation();
  const [timeLeft, setTimeLeft] = useState(endsAt - Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      const diff = endsAt - Date.now();
      if (diff <= 0) {
        clearInterval(timer);
        if (onExpire) onExpire();
      } else {
        setTimeLeft(diff);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [endsAt]);

  if (timeLeft <= 0) return <Text style={styles.timerExpired}>{t('timer_expired')}</Text>;

  const h = Math.floor(timeLeft / 3600000);
  const m = Math.floor((timeLeft % 3600000) / 60000);
  const s = Math.floor((timeLeft % 60000) / 1000);

  return (
    <View style={styles.itemTimer}>
      <MaterialCommunityIcons name="clock-outline" size={12} color="#FFF" />
      <Text style={styles.itemTimerText}>
        {h.toString().padStart(2, '0')}:{m.toString().padStart(2, '0')}:{s.toString().padStart(2, '0')}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  itemTimer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  itemTimerText: { color: '#FFF', fontSize: 10, fontWeight: 'bold', marginLeft: 3 },
  timerExpired: { fontSize: 9, color: '#E53935', fontWeight: 'bold' }
});

export default ProductTimer;
