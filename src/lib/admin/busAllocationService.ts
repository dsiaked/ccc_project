import { supabase } from '../supabase';
import {
  mapDestinationStats,
  normalizeBusTicketPrice,
} from './busAllocationModel';
import type { DestinationStatsRow } from './busAllocationModel';

export async function getDestinationStats() {
  try {
    const { data, error } = await supabase.rpc('get_destination_stats');

    if (error) throw error;

    return mapDestinationStats((data || []) as DestinationStatsRow[]);
  } catch (error) {
    console.error('Failed to get destination stats:', error);
    throw error;
  }
}

export async function addBusOption(
  capacity: number,
  estimatedPrice: number,
  notes?: string,
  maxCount = 999
) {
  try {
    const { error } = await supabase.rpc('upsert_bus_option_as_global_admin', {
      p_id: null,
      p_capacity: capacity,
      p_estimated_price: estimatedPrice,
      p_notes: notes ?? null,
      p_max_count: maxCount,
    });

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('Failed to add bus option:', error);
    throw error;
  }
}

export async function updateBusOption(
  id: string,
  capacity: number,
  estimatedPrice: number,
  notes?: string | null,
  maxCount = 999
) {
  const { error } = await supabase.rpc('upsert_bus_option_as_global_admin', {
    p_id: id,
    p_capacity: capacity,
    p_estimated_price: estimatedPrice,
    p_notes: notes ?? null,
    p_max_count: maxCount,
  });

  if (error) throw error;
  return { success: true };
}

export async function getBusOptions() {
  try {
    const { data, error } = await supabase
      .from('bus_options')
      .select('*')
      .order('capacity', { ascending: false });

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Failed to get bus options:', error);
    throw error;
  }
}

export async function deleteBusOption(id: string) {
  try {
    const { error } = await supabase.rpc('delete_bus_option_as_global_admin', {
      p_id: id,
    });

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('Failed to delete bus option:', error);
    throw error;
  }
}

export async function saveBusAllocation(
  allocationName: string,
  allocationData: unknown
) {
  try {
    const { error } = await supabase.rpc('create_bus_allocation_as_global_admin', {
      p_allocation_name: allocationName,
      p_allocation_data: allocationData,
    });

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('Failed to save bus allocation:', error);
    throw error;
  }
}

export async function getLatestConfirmedBusAllocation() {
  try {
    const { data, error } = await supabase
      .from('bus_allocations')
      .select(
        'id, allocation_name, allocation_data, total_cost, total_capacity, created_at, updated_at'
      )
      .filter('allocation_data->>status', 'eq', 'confirmed')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Failed to get latest confirmed bus allocation:', error);
    throw error;
  }
}

export async function getBusTicketPrice(): Promise<number> {
  const { data, error } = await supabase.rpc('get_bus_ticket_price');

  if (error) {
    console.error('Failed to get bus ticket price:', error);
    throw new Error(error.message);
  }

  return Number(data ?? 0);
}

export async function updateBusTicketPrice(price: number): Promise<number> {
  const normalizedPrice = normalizeBusTicketPrice(price);

  const { data, error } = await supabase.rpc('update_bus_ticket_price', {
    p_price: normalizedPrice,
  });

  if (error) {
    console.error('Failed to update bus ticket price:', error);
    throw new Error(error.message);
  }

  return Number(data ?? normalizedPrice);
}
