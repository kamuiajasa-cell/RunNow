import { PermissionsAndroid, Platform } from 'react-native';

import { ensureBluetoothConnect } from '@/features/device/useBluetoothPermission';
import { HuaweiWear } from '@/wear';

import { checkCall } from './rpcRules';

const RUNTIME_NOTIFICATION_API = 33;
type Perm = (typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS];
type HealthSensors = Parameters<typeof HuaweiWear.setHealthSensors>[0];

export interface RpcDeps {
  /** Sinkron manual, sama dengan tombol Sinkron di aplikasi. */
  sync: () => Promise<void>;
  /** Buka layar lama. Rutenya sudah dicek di rpcRules.ts. */
  open: (route: string) => void;
}

async function askNotifications(): Promise<boolean> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < RUNTIME_NOTIFICATION_API) return true;
  return (await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)) === PermissionsAndroid.RESULTS.GRANTED;
}

async function askRequired(required: Perm[], optional: Perm[]): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const result = await PermissionsAndroid.requestMultiple([...required, ...optional]);
  return required.every((p) => result[p] === PermissionsAndroid.RESULTS.GRANTED);
}

async function askLocation(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const p = PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION;
  if (await PermissionsAndroid.check(p)) return true;
  return (await PermissionsAndroid.request(p)) === PermissionsAndroid.RESULTS.GRANTED;
}

/** Menjalankan satu panggilan yang sudah lolos aturan. Izin diminta di sini, seperti di layar pengaturan lama. */
export async function runRpc(method: string, args: unknown[], deps: RpcDeps): Promise<unknown> {
  const problem = checkCall(method, args);
  if (problem) throw new Error(problem);

  switch (method) {
    // Sinkron dan latar belakang
    case 'syncNow':
      await deps.sync();
      return null;
    case 'getBackgroundStatus':
      return HuaweiWear.getBackgroundStatus();
    case 'getBackgroundRestrictions':
      return HuaweiWear.getBackgroundRestrictions();
    case 'setBackgroundEnabled': {
      if (args[0] !== true) {
        await HuaweiWear.setBackgroundEnabled(null);
        return HuaweiWear.getBackgroundStatus();
      }
      const address = HuaweiWear.getBackgroundStatus().address;
      if (!address) throw new Error('Hubungkan jam dulu lewat layar aplikasi.');
      if (!(await askNotifications())) throw new Error('Izin notifikasi belum diberikan.');
      if ((await ensureBluetoothConnect()) !== 'granted') throw new Error('Izin Bluetooth belum diberikan.');
      await HuaweiWear.setBackgroundEnabled(address);
      return HuaweiWear.getBackgroundStatus();
    }
    case 'setSyncIntervalMinutes':
      await HuaweiWear.setSyncIntervalMinutes(args[0] as number);
      return HuaweiWear.getBackgroundStatus();
    case 'openBatteryExemption':
      await HuaweiWear.openBatteryExemption();
      return null;
    case 'openAutoStartSettings':
      await HuaweiWear.openAutoStartSettings();
      return null;

    // Cuaca
    case 'getWeatherStatus':
      return HuaweiWear.getWeatherStatus();
    case 'setWeatherEnabled':
      await HuaweiWear.setWeatherEnabled(args[0] as boolean);
      return HuaweiWear.getWeatherStatus();
    case 'setWeatherUnit':
      await HuaweiWear.setWeatherUnit(args[0] as 'celsius' | 'fahrenheit');
      return HuaweiWear.getWeatherStatus();
    case 'setWeatherIntervalMinutes':
      await HuaweiWear.setWeatherIntervalMinutes(args[0] as number);
      return HuaweiWear.getWeatherStatus();
    case 'setWeatherLocationMode': {
      const mode = args[0] as 'current' | 'city';
      if (mode === 'current' && !(await askLocation())) throw new Error('Izin lokasi belum diberikan.');
      await HuaweiWear.setWeatherLocationMode(mode);
      return HuaweiWear.getWeatherStatus();
    }
    case 'setWeatherCity':
      return HuaweiWear.setWeatherCity((args[0] as string).trim());
    case 'refreshWeather':
      return HuaweiWear.refreshWeather();

    // Notifikasi dan panggilan
    case 'getNotificationAccess':
      return HuaweiWear.getNotificationAccess();
    case 'openNotificationAccess':
      await HuaweiWear.openNotificationAccess();
      return null;
    case 'setNotificationsEnabled':
      await HuaweiWear.setNotificationsEnabled(args[0] as boolean);
      return HuaweiWear.getNotificationAccess();
    case 'setMorningSummaryEnabled':
      if (args[0] === true && !(await askNotifications())) throw new Error('Izin notifikasi belum diberikan.');
      await HuaweiWear.setMorningSummaryEnabled(args[0] as boolean);
      return null;
    case 'getPhoneFeatures':
      return HuaweiWear.getPhoneFeatures();
    case 'setCallsEnabled':
      if (args[0] === true) {
        const ok = await askRequired(
          [PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE],
          [PermissionsAndroid.PERMISSIONS.READ_CALL_LOG, PermissionsAndroid.PERMISSIONS.READ_CONTACTS],
        );
        if (!ok) throw new Error('Izin telepon belum diberikan.');
      }
      await HuaweiWear.setCallsEnabled(args[0] as boolean);
      return HuaweiWear.getPhoneFeatures();
    case 'setFindPhoneEnabled':
      await HuaweiWear.setFindPhoneEnabled(args[0] as boolean);
      return HuaweiWear.getPhoneFeatures();

    // Sensor kesehatan dan stres
    case 'getHealthSensors':
      return HuaweiWear.getHealthSensors();
    case 'setHealthSensor': {
      const cur = HuaweiWear.getHealthSensors();
      const next: HealthSensors = {
        automaticHeartRate: cur.automaticHeartRate,
        automaticSpo2: cur.automaticSpo2,
        truSleep: cur.truSleep,
        highHeartRateAlert: cur.highHeartRateAlert,
        lowHeartRateAlert: cur.lowHeartRateAlert,
        [args[0] as string]: args[1],
      } as HealthSensors;
      await HuaweiWear.setHealthSensors(next);
      return HuaweiWear.getHealthSensors();
    }
    case 'getStressStatus':
      return HuaweiWear.getStressStatus();
    case 'setAutomaticStress':
      return HuaweiWear.setAutomaticStress(args[0] as boolean);

    // HRV
    case 'measureHrv':
      return HuaweiWear.measureHrv();
    case 'cancelHrvMeasurement':
      await HuaweiWear.cancelHrvMeasurement();
      return null;

    // Layar lain
    case 'openScreen':
      deps.open(args[0] as string);
      return null;

    default:
      throw new Error(`Metode tidak diizinkan: ${method}`);
  }
}
