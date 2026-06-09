import {
  runSimulationStage,
  type SimulationReferenceConfig,
  type SimulationStageResponse,
} from './simulationService';

export type SimulationExecutionStage =
  | 'cleanup'
  | 'reference'
  | 'accounts'
  | 'reservations'
  | 'deadline'
  | 'payments'
  | 'transfers'
  | 'boarding';

export interface SimulationExecutionRequest {
  stage: SimulationExecutionStage;
  userCount?: number;
  referenceConfig?: SimulationReferenceConfig;
  paymentMode?: 'random' | 'all';
}

export interface SimulationExecutionState {
  status: 'idle' | 'running' | 'completed' | 'failed';
  stage: SimulationExecutionStage | null;
  paymentMode: 'random' | 'all' | null;
  message: string | null;
  error: string | null;
  result: SimulationStageResponse | null;
  updatedAt: number;
}

const listeners = new Set<() => void>();

let state: SimulationExecutionState = {
  status: 'idle',
  stage: null,
  paymentMode: null,
  message: null,
  error: null,
  result: null,
  updatedAt: Date.now(),
};

let activeExecution: Promise<SimulationExecutionState> | null = null;

const publish = (nextState: Omit<SimulationExecutionState, 'updatedAt'>) => {
  state = { ...nextState, updatedAt: Date.now() };
  listeners.forEach((listener) => listener());
};

const publishProgress = (
  request: SimulationExecutionRequest,
  message: string,
  result: SimulationStageResponse | null = state.result
) => {
  publish({
    status: 'running',
    stage: request.stage,
    paymentMode: request.paymentMode ?? null,
    message,
    error: null,
    result,
  });
};

const getProgress = (run: SimulationStageResponse) => {
  const total = Number(run.summary.total_accounts ?? 0);
  const processed = Number(run.summary.processed ?? run.next_offset ?? 0);
  return `${processed.toLocaleString()} / ${total.toLocaleString()}`;
};

const runBatchedStage = async (
  request: SimulationExecutionRequest,
  stage: 'accounts' | 'reservations' | 'payments',
  batchSize: number,
  progressLabel: string
) => {
  let offset = 0;
  let runId: string | undefined;
  let run: SimulationStageResponse | null = null;

  while (!run?.done) {
    run = await runSimulationStage(stage, {
      runId,
      offset,
      batchSize,
      userCount: request.userCount,
      paymentMode: request.paymentMode,
    });
    runId = run.id;
    offset = run.next_offset ?? offset;
    publishProgress(request, `${progressLabel} 중: ${getProgress(run)}`, run);
  }

  return run;
};

const execute = async (request: SimulationExecutionRequest) => {
  publishProgress(request, '시뮬레이션 실행을 시작했습니다.');

  try {
    let result: SimulationStageResponse;
    let completedMessage: string;

    if (request.stage === 'cleanup') {
      let runId: string | undefined;
      let run: SimulationStageResponse | null = null;

      while (!run?.done) {
        run = await runSimulationStage('cleanup', { runId, batchSize: 100 });
        runId = run.id;
        const deleted = Number(run.summary.deleted ?? 0);
        const remaining = Number(run.summary.remaining ?? 0);
        publishProgress(
          request,
          `시뮬레이션 정보 초기화 중: ${deleted.toLocaleString()}개 계정 삭제, ${remaining.toLocaleString()}개 남음`,
          run
        );
      }

      result = run;
      completedMessage = '시뮬레이션 정보 초기화가 완료되었습니다.';
    } else if (request.stage === 'reference') {
      result = await runSimulationStage('reference', {
        referenceConfig: request.referenceConfig,
      });
      completedMessage = '운영 초기값 설정을 완료했습니다.';
    } else if (request.stage === 'accounts') {
      result = await runBatchedStage(
        request,
        'accounts',
        100,
        '실제 로그인 계정 생성'
      );
      completedMessage =
        '서울지구·서울 외 지구 일반 회원 생성과 캠퍼스 회계 순장님 권한 준비를 완료했습니다.';
    } else if (request.stage === 'reservations') {
      result = await runBatchedStage(request, 'reservations', 200, '개별 신청');
      completedMessage =
        '개별 신청을 완료했습니다. 매 10번째 계정은 미신청자로 유지됩니다.';
    } else if (request.stage === 'payments') {
      result = await runBatchedStage(
        request,
        'payments',
        200,
        request.paymentMode === 'random'
          ? '랜덤 일부 입금 설정'
          : '전체 입금 완료 설정'
      );

      if (
        request.paymentMode === 'random' &&
        (result.summary.payment_mode !== 'random' ||
          Number(result.summary.completed_total ?? 0) === 0 ||
          Number(result.summary.pending_total ?? 0) === 0)
      ) {
        throw new Error(
          '랜덤 일부 입금 결과에 입금 완료와 미입금 사용자가 모두 포함되지 않았습니다. simulation-runner 배포 상태를 확인하세요.'
        );
      }

      completedMessage =
        request.paymentMode === 'random'
          ? '랜덤 일부 입금 설정을 완료했습니다. 일부 신청자는 미입금 상태로 유지됩니다.'
          : '전체 입금 완료 설정을 마쳤습니다.';
    } else if (request.stage === 'transfers') {
      result = await runSimulationStage('transfers');
      completedMessage = '캠퍼스 송금·본부 확인을 마쳤습니다.';
    } else if (request.stage === 'deadline') {
      result = await runSimulationStage('deadline');
      completedMessage =
        '신청 마감을 완료했습니다. 배차 화면에서 계획을 산출하고 확정하세요.';
    } else {
      result = await runSimulationStage('boarding');
      completedMessage = '출발·탑승 리허설을 마쳤습니다.';
    }

    publish({
      status: 'completed',
      stage: request.stage,
      paymentMode: request.paymentMode ?? null,
      message: completedMessage,
      error: null,
      result,
    });
  } catch (error) {
    console.error('Failed to run simulation stage:', error);
    const message =
      error instanceof Error ? error.message : '단계를 실행하지 못했습니다.';
    publish({
      status: 'failed',
      stage: request.stage,
      paymentMode: request.paymentMode ?? null,
      message,
      error: message,
      result: state.result,
    });
  }

  return state;
};

export const getSimulationExecutionSnapshot = () => state;

export const subscribeSimulationExecution = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const startSimulationExecution = (
  request: SimulationExecutionRequest
): Promise<SimulationExecutionState> => {
  if (activeExecution) return activeExecution;

  activeExecution = execute(request).finally(() => {
    activeExecution = null;
  });
  return activeExecution;
};
