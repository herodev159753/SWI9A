import { Linking } from 'react-native';

/**
 * Service to handle 'Order via WhatsApp' integration.
 */
export const orderViaWhatsApp = (phoneNumber, cartItems, totalPrice) => {
  let message = `Hello Village Market! I'd like to place an order:\n\n`;
  
  cartItems.forEach(item => {
    message += `- ${item.name} (${item.quantity}x) - ${item.price}\n`;
  });

  message += `\nTotal: ${totalPrice}\n\nPlease confirm my order. Thanks!`;

  const url = `whatsapp://send?phone=${phoneNumber}&text=${encodeURIComponent(message)}`;

  Linking.canOpenURL(url).then(supported => {
    if (supported) {
      return Linking.openURL(url);
    } else {
      // Fallback to web WhatsApp or alert user
      const webUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
      return Linking.openURL(webUrl);
    }
  });
};
