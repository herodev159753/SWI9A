import * as Location from 'expo-location';

/**
 * Service to handle precise pin-drop delivery addresses.
 * Crucial for rural areas where standard addresses might not be reliable.
 */
export const getCurrentLocation = async () => {
  let { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    console.error('Permission to access location was denied');
    return null;
  }

  let location = await Location.getCurrentPositionAsync({});
  return location;
};

export const getAddressFromCoords = async (latitude, longitude) => {
  // Integrate with Google Maps Reverse Geocoding API or Expo Location
  let address = await Location.reverseGeocodeAsync({ latitude, longitude });
  return address[0];
};
