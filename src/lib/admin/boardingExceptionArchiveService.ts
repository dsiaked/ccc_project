import { supabase } from '../supabase.js';

export interface BoardingExceptionArchiveSnapshot {
  archivedKeys: string[];
  records: Array<Record<string, unknown>>;
}

export interface BoardingExceptionReasonEdit {
  recordKey: string;
  reason: string;
  updatedAt: string;
  updatedByName: string;
}

const isMissingArchiveRpc = (error: { code?: string; message?: string }) =>
  error.code === 'PGRST202' ||
  error.code === '42883' ||
  error.message?.includes('schema cache') ||
  error.message?.includes('Could not find the function');

const archiveUpgradeMessage =
  '특수상황 보관함 DB 기능이 설치되지 않았습니다. Supabase에 sql/setup/154_boarding_exception_archives.sql을 적용해주세요.';

export const getBoardingExceptionArchiveSnapshot = async () => {
  const { data, error } = await supabase.rpc(
    'get_boarding_exception_archive_snapshot'
  );

  if (error) {
    if (isMissingArchiveRpc(error)) {
      return {
        archivedKeys: [],
        records: [],
      } satisfies BoardingExceptionArchiveSnapshot;
    }
    throw new Error(error.message);
  }

  const value = (data ?? {}) as Partial<BoardingExceptionArchiveSnapshot>;
  return {
    archivedKeys: Array.isArray(value.archivedKeys) ? value.archivedKeys : [],
    records: Array.isArray(value.records) ? value.records : [],
  } satisfies BoardingExceptionArchiveSnapshot;
};

export const archiveBoardingException = async (
  recordKey: string,
  allocationId: string,
  recordData: Record<string, unknown>
) => {
  const { error } = await supabase.rpc(
    'archive_boarding_exception_as_global_admin',
    {
      p_record_key: recordKey,
      p_allocation_id: allocationId,
      p_record_data: recordData,
    }
  );
  if (error) {
    if (isMissingArchiveRpc(error)) throw new Error(archiveUpgradeMessage);
    throw new Error(error.message);
  }
};

export const restoreBoardingException = async (recordKey: string) => {
  const { error } = await supabase.rpc(
    'restore_boarding_exception_as_global_admin',
    { p_record_key: recordKey }
  );
  if (error) {
    if (isMissingArchiveRpc(error)) throw new Error(archiveUpgradeMessage);
    throw new Error(error.message);
  }
};

export const getBoardingExceptionReasonEdits = async () => {
  const { data, error } = await supabase.rpc(
    'get_boarding_exception_reason_edit_snapshot'
  );
  if (error) {
    if (isMissingArchiveRpc(error)) return [] as BoardingExceptionReasonEdit[];
    throw new Error(error.message);
  }
  return (Array.isArray(data) ? data : []) as BoardingExceptionReasonEdit[];
};

export const updateBoardingExceptionReason = async (input: {
  recordKey: string;
  allocationId: string;
  busId: string;
  reason: string;
}) => {
  const { error } = await supabase.rpc('update_boarding_exception_reason', {
    p_record_key: input.recordKey,
    p_allocation_id: input.allocationId,
    p_bus_id: input.busId,
    p_reason: input.reason,
  });
  if (error) {
    if (isMissingArchiveRpc(error)) {
      throw new Error(
        '처리 사유 수정 DB 기능이 설치되지 않았습니다. Supabase에 sql/setup/155_boarding_exception_reason_edits.sql을 적용해주세요.'
      );
    }
    throw new Error(error.message);
  }
};
