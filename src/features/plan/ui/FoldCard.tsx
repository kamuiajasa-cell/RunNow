import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { IconChip, type IconName } from '@/components/IconChip';
import { PressableScale } from '@/components/PressableScale';
import { Card } from '@/components/Screen';
import { HIT, spacing, useColors, type Tint } from '@/theme';

/**
 * Kartu yang bisa dilipat: satu baris judul (dengan ringkasan) selagi tertutup, isinya muncul saat diketuk.
 * Status buka atau tutup hanya hidup selama layar terbuka; `defaultOpen` menentukan keadaan awalnya.
 */
export function FoldCard(props: {
  title: string;
  icon: IconName;
  tint?: Tint | 'neutral';
  /** Satu baris di bawah judul, terlihat juga saat tertutup. */
  summary?: string;
  /** Label kecil di kanan judul, mis. "Pemulihan". */
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  return (
    <View style={styles.wrap}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={props.title}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        scaleTo={0.99}
        style={styles.header}>
        <IconChip icon={props.icon} tint={props.tint ?? 'neutral'} size="sm" />
        <View style={styles.titles}>
          <AppText variant="heading">{props.title}</AppText>
          {props.summary ? (
            <AppText variant="caption" muted>
              {props.summary}
            </AppText>
          ) : null}
        </View>
        {props.badge ? (
          <AppText variant="label" color={colors.primary}>
            {props.badge}
          </AppText>
        ) : null}
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
      </PressableScale>
      {open ? <Card>{props.children}</Card> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: HIT },
  titles: { flex: 1, gap: 2 },
});
