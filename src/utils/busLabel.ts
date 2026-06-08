export const formatBusLabel = (value: string | null | undefined) => {
  const label = value?.trim() ?? '';
  const legacyBusLabel = label.match(
    /^(?:bus[\s_-]*)?(\d+)(?:[\s_-]*bus)?$/i
  );

  return legacyBusLabel ? `${Number(legacyBusLabel[1])}호차` : label;
};
