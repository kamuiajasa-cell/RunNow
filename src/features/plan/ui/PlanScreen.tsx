import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Screen, Section } from '@/components/Screen';
import { Notice, Skeleton } from '@/components/States';
import { activePain, PAIN_AREAS, runAdvice } from '@/features/injury/pain';
import { currentPain, isStale } from '@/features/injury/painDoc';
import { injuryTriggers, type Trigger, type TriggerLevel } from '@/features/injury/triggers';
import { usePain } from '@/features/injury/usePain';
import { useRecentRuns } from '@/features/injury/useRecentRuns';
import { useWatch } from '@/state/WatchProvider';
import { spacing, useColors } from '@/theme';

type LevelKey = 'none' | 'safe' | 'watch' | 'high';

function levelKey(level: TriggerLevel): LevelKey {
  return level < 0 ? 'none' : level === 0 ? 'safe' : level === 1 ? 'watch' : 'high';
}

const round1 = (n: number | undefined): number => Math.round((n ?? 0) * 10) / 10;

function TriggerRow({ trigger }: { trigger: Trigger }) {
  const { t } = useTranslation('coach');
  const colors = useColors();
  const level = levelKey(trigger.level);
  const v = trigger.values;
  const known = trigger.level >= 0;
  let name = '';
  let body = t('rencanaCedera.triggers.noData');
  if (trigger.id === 'frequency') {
    name = t('rencanaCedera.triggers.frequency.name');
    if (known) body = t('rencanaCedera.triggers.frequency.body', { streak: v.streak ?? 0, week: v.week ?? 0 });
  } else if (trigger.id === 'longRun') {
    name = t('rencanaCedera.triggers.longRun.name');
    if (known) {
      body = t('rencanaCedera.triggers.longRun.body', {
        longest: round1(v.longestKm),
        share: v.share ?? 0,
        total: round1(v.totalKm),
      });
    }
  } else if (trigger.id === 'jump') {
    name = t('rencanaCedera.triggers.jump.name');
    if (known) {
      body = t('rencanaCedera.triggers.jump.body', {
        thisWeek: round1(v.thisWeekKm),
        lastWeek: round1(v.lastWeekKm),
        pct: v.pct ?? 0,
      });
    }
  }
  const color = level === 'high' ? colors.destructive : level === 'watch' ? colors.warning : undefined;
  return (
    <View style={styles.trigger}>
      <View style={styles.triggerHead}>
        <AppText variant="bodyStrong" style={styles.grow}>
          {name}
        </AppText>
        <AppText variant="label" color={color} muted={color === undefined}>
          {t(`rencanaCedera.triggers.level.${level}`)}
        </AppText>
      </View>
      <AppText variant="caption" muted>
        {body}
      </AppText>
    </View>
  );
}

/** Tab Rencana: nyeri hari ini, saran lari, dan pemicu cedera dari lari nyata. Rencana dua minggu menyusul. */
export function PlanScreen() {
  const { t } = useTranslation(['coach', 'common']);
  const { dataVersion } = useWatch();
  const runs = useRecentRuns(dataVersion);
  const { doc, loaded, setArea } = usePain();

  const triggers = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return injuryTriggers(runs ?? [], Math.floor(Date.now() / 1000), Math.floor(d.getTime() / 1000), {
      cadence: false,
    }).filter((x) => x.id !== 'cadence');
  }, [runs]);

  const now = Math.floor(Date.now() / 1000);
  const report = currentPain(doc, now);
  const advice = runAdvice(report);
  const hasPain = activePain(report).length > 0;
  const staleNote = isStale(doc, now) && activePain(doc.report).length > 0;

  return (
    <Screen title={t('common:nav.plan')} caption={t('coach:rencana.empty.body')}>
      <Section title={t('coach:rencanaCedera.pain.title')} icon="bandage-outline" tint="heart">
        <View style={styles.stack}>
          <AppText variant="caption" muted>
            {t('coach:rencanaCedera.pain.hint')}
          </AppText>
          {PAIN_AREAS.map((area) => {
            const value = doc.report[area] ?? 0;
            const label = t(`coach:rencanaCedera.pain.areas.${area}`);
            return (
              <View key={area} style={styles.painRow}>
                <AppText style={styles.grow}>{label}</AppText>
                <Button
                  iconOnly
                  icon="remove"
                  label={t('coach:rencanaCedera.pain.dec', { area: label })}
                  disabled={!loaded || value <= 0}
                  onPress={() => setArea(area, value - 1)}
                />
                <AppText variant="bodyStrong" style={styles.value}>
                  {value}
                </AppText>
                <Button
                  iconOnly
                  icon="add"
                  label={t('coach:rencanaCedera.pain.inc', { area: label })}
                  disabled={!loaded || value >= 10}
                  onPress={() => setArea(area, value + 1)}
                />
              </View>
            );
          })}
          {staleNote ? <Notice>{t('coach:rencanaCedera.pain.stale')}</Notice> : null}
          {hasPain ? (
            <Notice tone={advice === 'stop' ? 'danger' : 'info'}>{t(`coach:rencanaCedera.pain.advice.${advice}`)}</Notice>
          ) : null}
        </View>
      </Section>

      <Section title={t('coach:rencanaCedera.triggers.title')} icon="shield-checkmark" tint="workouts">
        <View style={styles.stack}>
          {runs === null ? (
            <Skeleton width="100%" height={120} radius="card" />
          ) : runs.length === 0 ? (
            <AppText variant="caption" muted>
              {t('coach:rencanaCedera.triggers.empty')}
            </AppText>
          ) : (
            triggers.map((trigger) => <TriggerRow key={trigger.id} trigger={trigger} />)
          )}
          <AppText variant="caption" muted>
            {t('coach:rencanaCedera.triggers.cadenceOff')}
          </AppText>
          <AppText variant="caption" muted>
            {t('coach:rencanaCedera.triggers.disclaimer')}
          </AppText>
        </View>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  painRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  grow: { flex: 1 },
  value: { minWidth: 28, textAlign: 'center' },
  trigger: { gap: spacing.xs },
  triggerHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
