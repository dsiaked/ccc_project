import { supabase } from './supabase';

const SETTING_KEY = 'global_scenario_checklist';
const LEGACY_STORAGE_KEY = 'global_scenario_checklist';

interface ChecklistSettingRow {
  value: unknown;
}

const normalizeStepIds = (value: unknown, validStepIds: Set<string>) => {
  const source =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>).checked_step_ids
      : value;

  return Array.isArray(source)
    ? source.filter(
        (stepId): stepId is string =>
          typeof stepId === 'string' && validStepIds.has(stepId)
      )
    : [];
};

export async function getGlobalScenarioChecklist(
  validStepIds: Set<string>
): Promise<string[]> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', SETTING_KEY)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') throw error;

  const legacyStepIds = (() => {
    try {
      return normalizeStepIds(
        JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) ?? '[]'),
        validStepIds
      );
    } catch {
      return [];
    }
  })();

  if (data) {
    const storedStepIds = normalizeStepIds(
      (data as ChecklistSettingRow).value,
      validStepIds
    );

    if (storedStepIds.length === 0 && legacyStepIds.length > 0) {
      await updateGlobalScenarioChecklist(legacyStepIds);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return legacyStepIds;
    }

    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return storedStepIds;
  }

  await updateGlobalScenarioChecklist(legacyStepIds);
  localStorage.removeItem(LEGACY_STORAGE_KEY);

  return legacyStepIds;
}

export async function updateGlobalScenarioChecklist(
  checkedStepIds: string[]
): Promise<void> {
  const { error } = await supabase.from('app_settings').upsert(
    {
      key: SETTING_KEY,
      value: { checked_step_ids: checkedStepIds },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  );

  if (error) throw error;
}
