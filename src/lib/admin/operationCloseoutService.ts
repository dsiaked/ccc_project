import { supabase } from '../supabase.js';

export interface OperationCloseoutSummary {
  closed: boolean;
  closedAt: string | null;
  closedByName: string | null;
  note: string;
  hasConfirmedAllocation: boolean;
  busTotal: number;
  departedBusTotal: number;
  unresolvedExceptionTotal: number;
  activeReservationTotal: number;
  paidReservationTotal: number;
  seoulCampusTotal: number;
  confirmedTransferTotal: number;
  unresolvedInquiryTotal: number;
  ready: boolean;
}

export const getOperationCloseoutSummary = async () => {
  const { data, error } = await supabase.rpc('get_operation_closeout_summary');
  if (error) throw new Error(error.message);
  return data as OperationCloseoutSummary;
};

export const setOperationCloseout = async (closed: boolean, note: string) => {
  const { data, error } = await supabase.rpc('set_operation_closeout', {
    p_closed: closed,
    p_note: note,
  });
  if (error) throw new Error(error.message);
  return data as OperationCloseoutSummary;
};
