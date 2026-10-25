import type { ChatSeed } from '../open';

/**
 * Fork pribadi: Joyo AI dimatikan. Kedua komponen ini tetap ada supaya layar yang
 * memakainya (Beranda, Latihan, detail latihan, Tidur) tidak perlu diubah.
 */
export function AskJoyoHeaderButton(): null {
  return null;
}

export function AskJoyoAction(_props: { seed: ChatSeed }): null {
  return null;
}
