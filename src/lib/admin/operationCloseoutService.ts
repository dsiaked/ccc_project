import { supabase } from '../supabase';

export interface OperationCloseoutState {
  closed: boolean;
  closedAt: string | null;
  closedBy: string | null;
  closedByName: string | null;
  reason: string;
  reopenedAt: string | null;
  reopenedBy: string | null;
  reopenedByName: string | null;
}

const emptyState: OperationCloseoutState = {
  closed: false,
  closedAt: null,
  closedBy: null,
  closedByName: null,
  reason: '',
  reopenedAt: null,
  reopenedBy: null,
  reopenedByName: null,
};

const mapState = (value: Record<string, unknown> | null): OperationCloseoutState => ({
  closed: value?.closed === true,
  closedAt: typeof value?.closed_at === 'string' ? value.closed_at : null,
  closedBy: typeof value?.closed_by === 'string' ? value.closed_by : null,
  closedByName:
    typeof value?.closed_by_name === 'string' ? value.closed_by_name : null,
  reason: typeof value?.reason === 'string' ? value.reason : '',
  reopenedAt: typeof value?.reopened_at === 'string' ? value.reopened_at : null,
  reopenedBy: typeof value?.reopened_by === 'string' ? value.reopened_by : null,
  reopenedByName:
    typeof value?.reopened_by_name === 'string' ? value.reopened_by_name : null,
});

export const getOperationCloseoutState = async () => {
  const { data, error } = await supabase.rpc('get_operation_closeout');
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') return emptyState;
    throw new Error(error.message);
  }
  return mapState((data ?? null) as Record<string, unknown> | null);
};

export const updateOperationCloseout = async (
  closed: boolean,
  reason: string
) => {
  const { data, error } = await supabase.rpc('update_operation_closeout', {
    p_closed: closed,
    p_reason: reason.trim(),
  });
  if (error) throw new Error(error.message);
  return mapState((data ?? null) as Record<string, unknown> | null);
};
