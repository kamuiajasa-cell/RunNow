// Aturan panggilan dari index.html ke modul jam. Tanpa import, supaya bisa diuji langsung.

/** Hanya metode ini yang boleh dipanggil dari index.html. Pengaturan lain tetap di layar aplikasi. */
export const ALLOWED_METHODS = [
  'getWeatherStatus',
  'setWeatherEnabled',
  'setWeatherUnit',
  'setWeatherIntervalMinutes',
  'refreshWeather',
  'getBackgroundStatus',
  'getBackgroundRestrictions',
  'setBackgroundEnabled',
  'setSyncIntervalMinutes',
  'openBatteryExemption',
  'openAutoStartSettings',
] as const;

/** Nilai yang sama dengan pilihan di layar pengaturan lama. */
export const WEATHER_INTERVALS = [30, 60, 120, 240];
export const SYNC_INTERVALS = [15, 30, 60, 120, 240];

/** Mengembalikan pesan error kalau panggilan tidak boleh dijalankan, atau null kalau boleh. */
export function checkCall(method: string, args: unknown[]): string | null {
  if (!(ALLOWED_METHODS as readonly string[]).includes(method)) return `Metode tidak diizinkan: ${method}`;
  switch (method) {
    case 'setWeatherEnabled':
    case 'setBackgroundEnabled':
      return typeof args[0] === 'boolean' ? null : 'Nilai harus benar atau salah.';
    case 'setWeatherUnit':
      return args[0] === 'celsius' || args[0] === 'fahrenheit' ? null : 'Satuan suhu tidak dikenal.';
    case 'setWeatherIntervalMinutes':
      return WEATHER_INTERVALS.includes(args[0] as number) ? null : 'Interval cuaca tidak valid.';
    case 'setSyncIntervalMinutes':
      return SYNC_INTERVALS.includes(args[0] as number) ? null : 'Interval sinkron tidak valid.';
    default:
      return args.length === 0 ? null : 'Metode ini tidak menerima argumen.';
  }
}
