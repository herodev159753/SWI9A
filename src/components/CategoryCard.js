import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants/theme';

const CategoryCard = ({ title, icon, color, onPress }) => {
  return (
    <TouchableOpacity style={[styles.container, { backgroundColor: color }]} onPress={onPress}>
      <View style={styles.iconContainer}>
        <MaterialCommunityIcons name={icon} size={32} color={COLORS.white} />
      </View>
      <Text style={styles.title}>{title}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '30%',
    padding: SIZES.medium,
    borderRadius: SIZES.medium,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginHorizontal: '1.5%',
    marginVertical: SIZES.small,
  },
  iconContainer: {
    marginBottom: SIZES.base,
  },
  title: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: SIZES.small,
    textAlign: 'center',
  },
});

export default CategoryCard;
