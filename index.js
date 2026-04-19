import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

import App from './App';

// CRITICAL: Fix React Native Web's root-level overflow:hidden
// React Native Web applies overflow:hidden to html, body, and #root by default.
// This prevents ALL scrolling on web browsers. We override it aggressively.
if (Platform.OS === 'web') {
  const style = document.createElement('style');
  style.textContent = `
    html, body, #root {
      height: auto !important;
      min-height: 100% !important;
      overflow: visible !important;
    }
    #root > div {
      display: block !important;
      height: auto !important;
      min-height: 100% !important;
      overflow: visible !important;
    }
    input, textarea, select {
       font-family: inherit !important;
    }
  `;
  document.head.appendChild(style);

  // Force Body override
  document.body.style.setProperty('overflow', 'visible', 'important');
  document.body.style.setProperty('height', 'auto', 'important');
  
  const observer = new MutationObserver(() => {
    if (document.body.style.overflow === 'hidden') {
       document.body.style.setProperty('overflow', 'visible', 'important');
    }
    const root = document.getElementById('root');
    if (root) {
       root.style.setProperty('overflow', 'visible', 'important');
       root.style.setProperty('height', 'auto', 'important');
    }
  });
  observer.observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['style'] });
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
