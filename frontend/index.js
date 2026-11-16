import { registerRootComponent } from 'expo';

// Safe Global Exception Handler to intercept uncaught JS errors and prevent abrupt app crashes
if (global.ErrorUtils) {
  const originalHandler = global.ErrorUtils.getGlobalHandler?.();
  global.ErrorUtils.setGlobalHandler((error, isFatal) => {
    console.warn('[GlobalErrorHandler] Caught error:', error?.message || error, 'isFatal:', isFatal);
    // Suppress fatal crash propagation for handled non-critical runtime failures
    if (!isFatal && originalHandler) {
      try {
        originalHandler(error, false);
      } catch (e) {}
    }
  });
}

// Register background task definition at top-level scope
import './src/utils/backgroundTrackingService';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
