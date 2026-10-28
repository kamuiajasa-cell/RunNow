import { PermissionsAndroid, Platform } from 'react-native';

import { ensureBluetoothConnect } from '@/features/device/useBluetoothPermission';
import { HuaweiWear } from '@/wear';

import { checkCall } from './rpcRules';

const RUNTIME_NOTIFICATION_API = 33;

/** Menjalankan satu panggilan yang sudah lolos aturan. Izin dan alamat jam diurus di sini, seperti di layar pengaturan lama. */
export async function runRpc(method: string, args: unknown[]): Promise<unknown> {
  const problem = checkCall(method, args);
  if (problem) throw new Error(problem);

  switch (method) {
    case 'setBackgroundEnabled': {
      if (args[0] !== true) {
        await HuaweiWear.setBackgroundEnabled(null);
        return HuaweiWear.getBackgroundStatus();
      }
      const address = HuaweiWear.getBackgroundStatus().address;
      if (!address) throw new Error('Hubungkan jam dulu lewat layar aplikasi.');
      if (Platform.OS === 'android' && Number(Platform.Version) >= RUNTIME_NOTIFICATION_API) {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      }
      if ((await ensureBluetoothConnect()) !== 'granted') throw new Error('Izin Bluetooth belum diberikan.');
      await HuaweiWear.setBackgroundEnabled(address);
      return HuaweiWear.getBackgroundStatus();
    }
    case 'setWeatherEnabled':
      await HuaweiWear.setWeatherEnabled(args[0] as boolean);
      return HuaweiWear.getWeatherStatus();
    case 'setWeatherUnit':
      await HuaweiWear.setWeatherUnit(args[0] as 'celsius' | 'fahrenheit');
      return HuaweiWear.getWeatherStatus();
    case 'setWeatherIntervalMinutes':
      await HuaweiWear.setWeatherIntervalMinutes(args[0] as number);
      return HuaweiWear.getWeatherStatus();
    case 'setSyncIntervalMinutes':
      await HuaweiWear.setSyncIntervalMinutes(args[0] as number);
      return HuaweiWear.getBackgroundStatus();
    case 'refreshWeather':
      return HuaweiWear.refreshWeather();
    case 'getWeatherStatus':
      return HuaweiWear.getWeatherStatus();
    case 'getBackgroundStatus':
      return HuaweiWear.getBackgroundStatus();
    case 'getBackgroundRestrictions':
      return HuaweiWear.getBackgroundRestrictions();
    case 'openBatteryExemption':
      await HuaweiWear.openBatteryExemption();
      return null;
    case 'openAutoStartSettings':
      await HuaweiWear.openAutoStartSettings();
      return null;
    default:
      throw new Error(`Metode tidak diizinkan: ${method}`);
  }
}
