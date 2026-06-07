import { useState } from 'react';

export const useAllocationSelection = <T,>() => {
  const [selectedAllocation, setSelectedAllocation] = useState<T | null>(null);
  const [selectedAllocationLabel, setSelectedAllocationLabel] = useState<
    string | null
  >(null);
  const [selectionFeedback, setSelectionFeedback] = useState<string | null>(
    null
  );

  const resetSelection = () => {
    setSelectedAllocation(null);
    setSelectedAllocationLabel(null);
    setSelectionFeedback(null);
  };

  const selectAllocation = (allocation: T, label: string) => {
    setSelectedAllocation(allocation);
    setSelectedAllocationLabel(label);
    setSelectionFeedback(
      `${label}을 선택했습니다. 임시 배차안 생성과 추천안 보관은 이 안으로 진행됩니다.`
    );
  };

  return {
    selectedAllocation,
    selectedAllocationLabel,
    selectionFeedback,
    setSelectedAllocation,
    setSelectedAllocationLabel,
    setSelectionFeedback,
    resetSelection,
    selectAllocation,
  };
};
