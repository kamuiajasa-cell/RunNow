import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen, Section } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { Notice, Skeleton } from '@/components/States';
import { activePain, PAIN_AREAS, runAdvice } from '@/features/injury/pain';
import { currentPain, isStale } from '@/features/injury/painDoc';
import { injuryTriggers, type Trigger, type TriggerLevel } from '@/features/injury/triggers';
import { usePain } from '@/features/injury/usePain';
import { useRecentRuns } from '@/features/injury/useRecentRuns';
import { formatPace } from '@/features/plan/pace';
import { buildPlan, dayStartOf, mondayStart, type PlanDay, type PlanWeek } from '@/features/plan/plan';
import { usePlanPrefs } from '@/features/plan/usePlanPrefs';
import { getLocale, INTL_TAG } from '@/i18n';
import { useWatch } from '@/state/WatchProvider';
import { spacing, useColors } from '@/theme';

type LevelKey = 'none' | 'safe' | 'watch' | 'high';

function levelKey(level: TriggerLevel): LevelKey {
  return level < 0 ? 'none' : level === 0 ? 'safe' : level === 1 ? 'watch' : 'high';
}

const round1 = (n: number | undefined): number => Math.round((n ?? 0) * 10) / 10;

const SHORT_DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
const DAY_NUMBER: Intl.DateTimeFormatOptions = { day: 'numeric' };
const WEEKDAY: Intl.DateTimeFormatOptions = { weekday: 'short' };

const fmtDate = (sec: number, options: Intl.DateTimeFormatOptions): string =>
  new Date(sec * 1000).toLocaleDateString(INTL_TAG[getLocale()], options);

/** Km dari ketikan: koma atau titik, kosong atau tidak masuk akal berarti tidak ada isian. */
function parseKm(text: string): number | null {
  const n = parseFloat(text.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function KmInput(props: {
  value: number | null;
  placeholder: string;
  disabled: boolean;
  label: string;
  onCommit: (km: number | null) => void;
}) {
  return (
    <View style={styles.kmBox}>
      <Input
        key={String(props.value ?? '')}
        keyboardType="decimal-pad"
        defaultValue={props.value === null ? '' : String(props.value)}
        placeholder={props.placeholder}
        editable={!props.disabled}
        selectTextOnFocus
        maxLength={5}
        accessibilityLabel={props.label}
        onEndEditing={(e) => props.onCommit(parseKm(e.nativeEvent.text))}
      />
    </View>
  );
}

function DayRow(props: { day: PlanDay; disabled: boolean; onCommit: (km: number | null) => void }) {
  const { t } = useTranslation('coach');
  const colors = useColors();
  const { day } = props;
  const weekday = fmtDate(day.start, WEEKDAY);
  const done = day.doneKm > 0;
  const locked = day.status === 'past' || done;
  const shown = done ? day.doneKm : day.edited ? day.km : null;
  const placeholder = !locked && day.km > 0 && !day.edited ? String(day.km) : '';

  let main = '';
  let sub: string | null = null;
  let note: string | null = null;
  if (done) {
    main = t('rencanaPlan.done', { km: day.doneKm });
  } else if (day.km <= 0) {
    main = t('rencanaPlan.rest');
  } else if (day.target) {
    main = t(`rencanaPlan.kind.${day.target.slow ? 'slow' : day.target.kind}`);
    sub = t('rencanaPlan.target', {
      lo: formatPace(day.target.paceLo),
      hi: formatPace(day.target.paceHi),
      min: day.target.minutes,
    });
    if (day.target.slow) note = t('rencanaPlan.slowNote');
  }

  return (
    <View style={styles.dayRow}>
      <View style={styles.dayLabel}>
        <AppText variant="caption" muted>
          {weekday}
        </AppText>
        <AppText variant="bodyStrong" color={day.status === 'today' ? colors.primary : undefined}>
          {fmtDate(day.start, DAY_NUMBER)}
        </AppText>
      </View>
      <KmInput
        value={shown}
        placeholder={placeholder}
        disabled={props.disabled || locked}
        label={t('rencanaPlan.inputLabel', { day: `${weekday} ${fmtDate(day.start, SHORT_DATE)}` })}
        onCommit={props.onCommit}
      />
      <View style={styles.grow}>
        {main ? (
          <AppText variant="label" muted={day.km <= 0 || done}>
            {main}
          </AppText>
        ) : null}
        {sub ? (
          <AppText variant="caption" muted>
            {sub}
          </AppText>
        ) : null}
        {note ? (
          <AppText variant="caption" muted>
            {note}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

function WeekBlock(props: { week: PlanWeek; index: number; disabled: boolean; onCommit: (week: number, day: number, km: number | null) => void }) {
  const { t } = useTranslation('coach');
  const colors = useColors();
  const { week } = props;
  return (
    <View style={styles.week}>
      <View style={styles.weekHead}>
        <AppText variant="bodyStrong" style={styles.grow}>
          {t('rencanaPlan.week.range', {
            from: fmtDate(week.start, SHORT_DATE),
            to: fmtDate(dayStartOf(week.start, 6), SHORT_DATE),
          })}
        </AppText>
        {week.recovery ? (
          <AppText variant="label" color={colors.primary}>
            {t('rencanaPlan.week.recovery')}
          </AppText>
        ) : null}
      </View>
      <AppText variant="caption" muted>
        {t('rencanaPlan.week.limit', { limit: week.targetKm, planned: week.plannedKm, done: week.doneKm })}
      </AppText>
      {week.days.map((day, d) => (
        <DayRow key={day.start} day={day} disabled={props.disabled} onCommit={(km) => props.onCommit(props.index, d, km)} />
      ))}
    </View>
  );
}

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

/** Tab Rencana: rencana lari dua minggu, nyeri hari ini, dan pemicu cedera dari lari nyata. */
export function PlanScreen() {
  const { t } = useTranslation(['coach', 'common']);
  const { dataVersion } = useWatch();
  const runs = useRecentRuns(dataVersion);
  const { doc, loaded: painLoaded, setArea } = usePain();

  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const todayStart = Math.floor(midnight.getTime() / 1000);
  const now = Math.floor(Date.now() / 1000);
  const { prefs, loaded: prefsLoaded, setKm, setTaper, clearKm } = usePlanPrefs(mondayStart(todayStart));

  const report = currentPain(doc, now);
  const advice = runAdvice(report);
  const hasPain = activePain(report).length > 0;
  const staleNote = isStale(doc, now) && activePain(doc.report).length > 0;

  const plan = useMemo(
    () =>
      runs === null
        ? null
        : buildPlan({
            runs,
            nowSec: Math.floor(Date.now() / 1000),
            todayStart,
            advice,
            recoveryWeek: prefs.recoveryWeek,
            overrides: prefs.overrides,
          }),
    [runs, todayStart, advice, prefs],
  );

  const triggers = useMemo(
    () =>
      injuryTriggers(runs ?? [], Math.floor(Date.now() / 1000), todayStart, { cadence: false }).filter(
        (x) => x.id !== 'cadence',
      ),
    [runs, todayStart],
  );

  const taperOptions = [
    { value: -1, label: t('coach:rencanaPlan.taper.off') },
    { value: 0, label: t('coach:rencanaPlan.taper.this') },
    { value: 1, label: t('coach:rencanaPlan.taper.next') },
  ] as const;

  return (
    <Screen title={t('common:nav.plan')} caption={t('coach:rencana.empty.body')}>
      <Section title={t('coach:rencanaPlan.title')} icon="calendar-outline" tint="workouts">
        <View style={styles.stack}>
          <AppText variant="caption" muted>
            {t('coach:rencanaPlan.hint')}
          </AppText>
          <View style={styles.taper}>
            <AppText variant="bodyStrong">{t('coach:rencanaPlan.taper.label')}</AppText>
            <Segmented
              options={taperOptions}
              value={prefs.recoveryWeek ?? -1}
              disabled={!prefsLoaded}
              onChange={(v) => setTaper(v === 0 || v === 1 ? v : null)}
            />
            <AppText variant="caption" muted>
              {t('coach:rencanaPlan.taper.hint')}
            </AppText>
          </View>
          {plan !== null && !plan.paceKnown ? <Notice>{t('coach:rencanaPlan.noPace')}</Notice> : null}
          {advice === 'stop' ? <Notice tone="danger">{t('coach:rencanaPlan.stop')}</Notice> : null}
          {plan === null ? (
            <Skeleton width="100%" height={240} radius="card" />
          ) : (
            plan.weeks.map((week, w) => (
              <WeekBlock key={week.start} week={week} index={w} disabled={!prefsLoaded} onCommit={setKm} />
            ))
          )}
          {Object.keys(prefs.overrides).length > 0 ? (
            <Button variant="ghost" label={t('coach:rencanaPlan.clear')} onPress={clearKm} />
          ) : null}
        </View>
      </Section>

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
                  disabled={!painLoaded || value <= 0}
                  onPress={() => setArea(area, value - 1)}
                />
                <AppText variant="bodyStrong" style={styles.value}>
                  {value}
                </AppText>
                <Button
                  iconOnly
                  icon="add"
                  label={t('coach:rencanaCedera.pain.inc', { area: label })}
                  disabled={!painLoaded || value >= 10}
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
  grow: { flex: 1 },
  taper: { gap: spacing.sm },
  week: { gap: spacing.sm },
  weekHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dayLabel: { width: 44, alignItems: 'center' },
  kmBox: { width: 88 },
  painRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  value: { minWidth: 28, textAlign: 'center' },
  trigger: { gap: spacing.xs },
  triggerHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
