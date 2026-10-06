import { Platform } from 'react-native';

/**
 * Base URL resolution.
 *
 * - iOS simulator:    localhost works (same machine as the API)
 * - Android emulator: 10.0.2.2 is the emulator's alias for host localhost
 * - Physical device:  must use your Mac's LAN IP on the same Wi-Fi
 * - Production:       the deployed API domain
 *
 * Change LAN_IP to your machine's current LAN IP when testing on a
 * physical device. Find it with: ipconfig getifaddr en0 (macOS)
 */
const LAN_IP = '192.168.1.42';

const DEV_BASE = Platform.select({
  ios: 'http://localhost:3000',
  android: 'http://10.0.2.2:3000',
  default: `http://${LAN_IP}:3000`,
});

export const API_BASE = __DEV__ ? DEV_BASE! : 'https://api.yourdomain.com';