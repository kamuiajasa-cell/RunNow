/**
 * Siapa yang boleh memakai Coach. Di fork pribadi ini tidak ada akun JoyoRogo
 * atau paket Pro: semua orang mendapat Coach, dan rencananya tetap tersimpan
 * di HP (SQLite, tabel `coach_doc`).
 */
export type CoachAccess = 'checking' | 'signedOut' | 'free' | 'pro';

export function useCoachAccess(): CoachAccess {
  return 'pro';
}
