import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/Screen';
import { EmptyState } from '@/components/States';

/** Tab Rencana: rencana lari dua minggu dengan jarak dan pace target per hari. Kerangka dulu, isinya menyusul. */
export function PlanScreen() {
  const { t } = useTranslation(['coach', 'common']);
  return (
    <Screen title={t('common:nav.plan')}>
      <EmptyState icon="calendar" title={t('coach:rencana.empty.title')} description={t('coach:rencana.empty.body')} />
    </Screen>
  );
}
