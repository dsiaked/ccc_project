import { supabase } from './supabase';

const PARTICIPATION_TARGETS_KEY = 'participation_targets';
const LEGACY_TARGETS_STORAGE_KEY = 'admin_ticket_participation_targets';
const LEGACY_ROWS_STORAGE_KEY = 'admin_ticket_participation_target_rows';

export interface ParticipationTargetRow {
  rowId?: string;
  key: string;
  district: string;
  team: string;
  campus: string;
}

export interface ParticipationTargetsSetting {
  rows: ParticipationTargetRow[];
  targets: Record<string, number>;
}

export interface ParticipationTargetsLoadResult
  extends ParticipationTargetsSetting {
  isStored: boolean;
}

interface ParticipationTargetsSettingRow {
  value: unknown;
}

const emptyParticipationTargetsSetting = (): ParticipationTargetsSetting => ({
  rows: [],
  targets: {},
});

const normalizeSetting = (value: unknown): ParticipationTargetsSetting => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return emptyParticipationTargetsSetting();
  }

  const source = value as Record<string, unknown>;
  const rows = Array.isArray(source.rows)
    ? source.rows.filter(
        (row): row is ParticipationTargetRow =>
          Boolean(
            row &&
              typeof row === 'object' &&
              typeof (row as ParticipationTargetRow).key === 'string' &&
              typeof (row as ParticipationTargetRow).district === 'string' &&
              typeof (row as ParticipationTargetRow).team === 'string' &&
              typeof (row as ParticipationTargetRow).campus === 'string'
          )
      )
    : [];
  const targets: Record<string, number> = {};

  if (
    source.targets &&
    typeof source.targets === 'object' &&
    !Array.isArray(source.targets)
  ) {
    Object.entries(source.targets as Record<string, unknown>).forEach(
      ([key, value]) => {
        const count = Number(value);
        targets[key] = Number.isFinite(count) && count > 0 ? count : 0;
      }
    );
  }

  return { rows, targets };
};

const loadLegacySetting = (): ParticipationTargetsSetting => {
  try {
    const rows = JSON.parse(localStorage.getItem(LEGACY_ROWS_STORAGE_KEY) ?? '[]');
    const targets = JSON.parse(
      localStorage.getItem(LEGACY_TARGETS_STORAGE_KEY) ?? '{}'
    );

    return normalizeSetting({ rows, targets });
  } catch {
    return emptyParticipationTargetsSetting();
  }
};

const clearLegacySetting = () => {
  localStorage.removeItem(LEGACY_ROWS_STORAGE_KEY);
  localStorage.removeItem(LEGACY_TARGETS_STORAGE_KEY);
};

export async function getParticipationTargetsSetting(): Promise<ParticipationTargetsLoadResult> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', PARTICIPATION_TARGETS_KEY)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') throw error;

  if (data) {
    const setting = normalizeSetting(
      (data as ParticipationTargetsSettingRow).value
    );
    const legacySetting = loadLegacySetting();

    if (
      setting.rows.length === 0 &&
      Object.keys(setting.targets).length === 0 &&
      (legacySetting.rows.length > 0 ||
        Object.keys(legacySetting.targets).length > 0)
    ) {
      await updateParticipationTargetsSetting(legacySetting);
      clearLegacySetting();

      return { ...legacySetting, isStored: true };
    }

    clearLegacySetting();

    return {
      ...setting,
      isStored: true,
    };
  }

  const legacySetting = loadLegacySetting();

  if (
    legacySetting.rows.length > 0 ||
    Object.keys(legacySetting.targets).length > 0
  ) {
    await updateParticipationTargetsSetting(legacySetting);
    clearLegacySetting();

    return { ...legacySetting, isStored: true };
  }

  return { ...emptyParticipationTargetsSetting(), isStored: false };
}

export async function updateParticipationTargetsSetting(
  setting: ParticipationTargetsSetting
): Promise<void> {
  const { error } = await supabase.from('app_settings').upsert(
    {
      key: PARTICIPATION_TARGETS_KEY,
      value: setting,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  );

  if (error) throw error;
}

export const getTotalParticipationTarget = (
  setting: ParticipationTargetsSetting
) => {
  const values =
    setting.rows.length > 0
      ? setting.rows.map((row) => setting.targets[row.key] ?? 0)
      : Object.values(setting.targets);

  return values.reduce(
    (sum, value) => sum + (Number.isFinite(value) && value > 0 ? value : 0),
    0
  );
};
