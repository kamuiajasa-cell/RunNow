// Aturan panggilan dari index.html ke aplikasi. Tanpa import, supaya bisa diuji langsung.

/** Metode yang boleh dipanggil dari index.html. Di luar daftar ini ditolak. */
export const ALLOWED_METHODS = [
  // Sinkron dan latar belakang
  'syncNow',
  'getBackgroundStatus',
  'getBackgroundRestrictions',
  'setBackgroundEnabled',
  'setSyncIntervalMinutes',
  'openBatteryExemption',
  'openAutoStartSettings',
  // Cuaca
  'getWeatherStatus',
  'setWeatherEnabled',
  'setWeatherUnit',
  'setWeatherIntervalMinutes',
  'setWeatherLocationMode',
  'setWeatherCity',
  'refreshWeather',
  // Notifikasi dan panggilan
  'getNotificationAccess',
  'openNotificationAccess',
  'setNotificationsEnabled',
  'setMorningSummaryEnabled',
  'getPhoneFeatures',
  'setCallsEnabled',
  'setFindPhoneEnabled',
  // Sensor kesehatan dan stres
  'getHealthSensors',
  'setHealthSensor',
  'getStressStatus',
  'setAutomaticStress',
  // HRV
  'measureHrv',
  'cancelHrvMeasurement',
  // Layar lain di aplikasi
  'openScreen',
] as const;

/** Layar lama yang boleh dibuka dari index.html. */
export const ALLOWED_ROUTES = [
  '/watch',
  '/watch/alarms',
  '/watch/faces',
  '/settings/koneksi',
  '/settings/import-huawei',
  '/settings/sources',
  '/settings/notification-apps',
] as const;

export const WEATHER_INTERVALS = [30, 60, 120, 240];
export const SYNC_INTERVALS = [15, 30, 60, 120, 240];
const SENSOR_BOOLEANS = ['automaticHeartRate', 'automaticSpo2', 'truSleep'];
const SENSOR_ALERTS = ['highHeartRateAlert', 'lowHeartRateAlert'];
const NO_ARGS = [
  'syncNow',
  'getBackgroundStatus',
  'getBackgroundRestrictions',
  'openBatteryExemption',
  'openAutoStartSettings',
  'getWeatherStatus',
  'refreshWeather',
  'getNotificationAccess',
  'openNotificationAccess',
  'getPhoneFeatures',
  'getHealthSensors',
  'getStressStatus',
  'measureHrv',
  'cancelHrvMeasurement',
];
const BOOL_ARG = [
  'setBackgroundEnabled',
  'setWeatherEnabled',
  'setNotificationsEnabled',
  'setMorningSummaryEnabled',
  'setCallsEnabled',
  'setFindPhoneEnabled',
  'setAutomaticStress',
];

/** Mengembalikan pesan error kalau panggilan tidak boleh dijalankan, atau null kalau boleh. */
export function checkCall(method: string, args: unknown[]): string | null {
  if (!(ALLOWED_METHODS as readonly string[]).includes(method)) return `Metode tidak diizinkan: ${method}`;
  if (NO_ARGS.includes(method)) return args.length === 0 ? null : 'Metode ini tidak menerima argumen.';
  if (BOOL_ARG.includes(method)) return typeof args[0] === 'boolean' ? null : 'Nilai harus benar atau salah.';
  switch (method) {
    case 'setWeatherUnit':
      return args[0] === 'celsius' || args[0] === 'fahrenheit' ? null : 'Satuan suhu tidak dikenal.';
    case 'setWeatherIntervalMinutes':
      return WEATHER_INTERVALS.includes(args[0] as number) ? null : 'Interval cuaca tidak valid.';
    case 'setSyncIntervalMinutes':
      return SYNC_INTERVALS.includes(args[0] as number) ? null : 'Interval sinkron tidak valid.';
    case 'setWeatherLocationMode':
      return args[0] === 'current' || args[0] === 'city' ? null : 'Mode lokasi tidak dikenal.';
    case 'setWeatherCity': {
      if (args.length !== 1) return 'Metode ini menerima tepat satu argumen.';
      const q = typeof args[0] === 'string' ? args[0].trim() : '';
      return q.length >= 2 && q.length <= 80 ? null : 'Nama kota harus 2 sampai 80 huruf.';
    }
    case 'setHealthSensor': {
      const key = args[0];
      const val = args[1];
      if (typeof key !== 'string') return 'Nama pengaturan tidak valid.';
      if (SENSOR_BOOLEANS.includes(key)) return typeof val === 'boolean' ? null : 'Nilai harus benar atau salah.';
      if (SENSOR_ALERTS.includes(key)) {
        return typeof val === 'number' && Number.isInteger(val) && val >= 0 && val <= 240
          ? null
          : 'Batas detak harus angka 0 sampai 240.';
      }
      return 'Pengaturan sensor tidak dikenal.';
    }
    case 'openScreen':
      return (ALLOWED_ROUTES as readonly string[]).includes(args[0] as string) ? null : 'Layar tidak diizinkan.';
    default:
      return 'Metode ini tidak menerima argumen.';
  }
}
