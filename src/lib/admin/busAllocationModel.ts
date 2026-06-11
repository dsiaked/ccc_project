export interface DestinationStatsRow {
  station_name: string;
  rank1: number | string;
  rank2: number | string;
  total: number | string;
}

export const mapDestinationStats = (rows: DestinationStatsRow[]) => {
  const stats: Record<
    string,
    { rank1: number; rank2: number; total: number }
  > = {};

  rows.forEach((row) => {
    stats[row.station_name] = {
      rank1: Number(row.rank1),
      rank2: Number(row.rank2),
      total: Number(row.total),
    };
  });

  return stats;
};

export const normalizeBusTicketPrice = (price: number) =>
  Math.max(0, Math.floor(Number(price)));
