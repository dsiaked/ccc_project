export const assertStableSimulationRun = (
  stage: string,
  expectedRunId: string | undefined,
  actualRunId: string
) => {
  if (
    !actualRunId.trim() ||
    actualRunId === 'undefined' ||
    actualRunId === 'null'
  ) {
    throw new Error(`Simulation ${stage} returned an invalid run id.`);
  }
  if (expectedRunId && actualRunId !== expectedRunId) {
    throw new Error(
      `Simulation ${stage} run changed unexpectedly from ${expectedRunId} to ${actualRunId}.`
    );
  }
};

export const assertSimulationRequestWithinLimit = (
  stage: string,
  completedRequests: number,
  maxRequests = 10_000
) => {
  if (completedRequests >= maxRequests) {
    throw new Error(
      `Simulation ${stage} exceeded the maximum batch request count.`
    );
  }
};

export const getNextSimulationBatchOffset = (
  stage: string,
  currentOffset: number,
  nextOffset: number | null
) => {
  if (
    nextOffset === null ||
    !Number.isSafeInteger(nextOffset) ||
    nextOffset <= currentOffset
  ) {
    throw new Error(
      `Simulation ${stage} batch made no progress at offset ${currentOffset}.`
    );
  }

  return nextOffset;
};

export const getNextSimulationCleanupRemaining = (
  previousRemaining: number | null,
  remainingValue: unknown
) => {
  const remaining = Number(remainingValue);
  if (!Number.isSafeInteger(remaining) || remaining < 0) {
    throw new Error('Simulation cleanup returned an invalid remaining count.');
  }
  if (previousRemaining !== null && remaining >= previousRemaining) {
    throw new Error(
      `Simulation cleanup made no progress with ${remaining} accounts remaining.`
    );
  }

  return remaining;
};
