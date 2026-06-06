import { useState } from 'react';

export const useAllocationSelection = <T,>() => {
  const [selectedAllocation, setSelectedAllocation] = useState<T | null>(null);
  const [selectionFeedback, setSelectionFeedback] = useState<string | null>(
    null
  );

  const resetSelection = () => {
    setSelectedAllocation(null);
    setSelectionFeedback(null);
  };

  const selectAllocation = (allocation: T, label: string) => {
    setSelectedAllocation(allocation);
    setSelectionFeedback(
      `${label}을 선택했습니다. 저장과 자동 배차는 이 안으로 진행됩니다.`
    );
  };

  return {
    selectedAllocation,
    selectionFeedback,
    setSelectedAllocation,
    setSelectionFeedback,
    resetSelection,
    selectAllocation,
  };
};
