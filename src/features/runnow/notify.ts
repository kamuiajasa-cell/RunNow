/**
 * Notifikasi untuk halaman Run Now (index.html). Halaman memanggil Android.setPlan(json) dan Android.test(...);
 * runnow.tsx meneruskannya ke sini. Semuanya notifikasi lokal lewat expo-notifications, tidak ada yang dikirim ke server.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const CHANNEL_ID = 'runnow-plan';
const ID_PREFIX = 'runnow-plan-';
/** Halaman hanya menjadwalkan 14 hari ke depan; batas ini menjaga dari data yang salah bentuk. */
const MAX_ITEMS = 60;

/** Notifikasi yang muncul saat aplikasi sedang di depan tetap tampil sebagai banner (pengaturan sama dengan family/push.ts). */
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export type PlanResult = 'ok' | 'denied' | 'error';

/** Satu pengingat dari index.html: waktu tampil (ms), judul, ringkasan, dan rincian panjang. */
type PlanItem = { at: number; title: string; body: string; big?: string };

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Pengingat sesi lari',
    importance: Notifications.AndroidImportance.HIGH,
  });
}

/** Android 13+ butuh channel sebelum dialog izin muncul, jadi channel dibuat dulu. */
async function ensurePermission(): Promise<boolean> {
  await ensureChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** Baris pertama jadi ringkasan saat notifikasi tertutup; rincian terlihat saat dibuka. */
function textOf(body: string, big?: string): string {
  return big && big.trim() ? `${body}\n\n${big}` : body;
}

function parsePlan(json: string): PlanItem[] | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(raw)) return null;
  const items: PlanItem[] = [];
  for (const r of raw.slice(0, MAX_ITEMS)) {
    if (typeof r !== 'object' || r === null) continue;
    const o = r as Record<string, unknown>;
    if (typeof o.at !== 'number' || !Number.isFinite(o.at) || typeof o.title !== 'string') continue;
    items.push({
      at: o.at,
      title: o.title,
      body: typeof o.body === 'string' ? o.body : '',
      big: typeof o.big === 'string' ? o.big : undefined,
    });
  }
  return items;
}

async function cancelPlan(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(ID_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => undefined)),
  );
}

/**
 * Mengganti seluruh jadwal pengingat dengan isi `planJson` (array kosong = matikan semua).
 * Mengembalikan 'denied' kalau izin notifikasi belum diberikan.
 */
export async function applyPlan(planJson: string): Promise<PlanResult> {
  try {
    const items = parsePlan(planJson);
    if (!items) return 'error';
    // Jadwal lama selalu dibersihkan dulu, jadi mematikan pengingat tidak butuh izin.
    await cancelPlan();
    const future = items.filter((i) => i.at > Date.now());
    if (future.length === 0) return 'ok';
    if (!(await ensurePermission())) return 'denied';
    for (const i of future) {
      await Notifications.scheduleNotificationAsync({
        identifier: `${ID_PREFIX}${i.at}`,
        content: { title: i.title, body: textOf(i.body, i.big) },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(i.at), channelId: CHANNEL_ID },
      });
    }
    return 'ok';
  } catch (e) {
    console.warn('RunNow: jadwal notifikasi gagal', e);
    return 'error';
  }
}

/** Notifikasi tes yang muncul seketika. Mengembalikan false kalau izin ditolak atau pengirimannya gagal. */
export async function showTest(n: { title: string; body: string; big?: string }): Promise<boolean> {
  try {
    if (!(await ensurePermission())) return false;
    await Notifications.scheduleNotificationAsync({
      content: { title: n.title, body: textOf(n.body, n.big) },
      trigger: { channelId: CHANNEL_ID },
    });
    return true;
  } catch (e) {
    console.warn('RunNow: notifikasi tes gagal', e);
    return false;
  }
}
