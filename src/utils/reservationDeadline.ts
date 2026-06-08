export const normalizeReservationDeadline = (value: unknown) => {
  if (typeof value !== 'string') return null;

  const normalized = value.trim();
  if (!normalized || !Number.isFinite(Date.parse(normalized))) return null;

  return normalized;
};

export const isReservationDeadlineClosed = (
  deadlineAt: unknown,
  nowMs = Date.now()
) => {
  const normalized = normalizeReservationDeadline(deadlineAt);
  return normalized ? Date.parse(normalized) <= nowMs : false;
};

export const formatReservationDeadlineValue = (deadlineAt: unknown) => {
  const normalized = normalizeReservationDeadline(deadlineAt);
  if (!normalized) return '미설정';

  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(normalized));
};
