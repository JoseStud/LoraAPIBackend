/** @internal */
import type { QueueModule } from './queueModule';
import type { ResultsModule } from './resultsModule';
import type { SystemStatusModule } from './systemStatusModule';
import type { GenerationCompleteMessage } from '@/types';

export interface AdapterHandlerDependencies {
  queue: Pick<
    QueueModule,
    | 'ingestQueue'
    | 'jobsByBackendId'
    | 'handleProgressMessage'
    | 'handleCompletionMessage'
    | 'handleErrorMessage'
  >;
  results: Pick<ResultsModule, 'setResults' | 'addResult' | 'createResultFromCompletion'>;
  systemStatus: Pick<SystemStatusModule, 'applySystemStatusPayload' | 'setConnectionState'>;
  /** Called with the backend ids of jobs that left the active queue. */
  onJobsFinished?: (jobIds: string[]) => void;
}

export interface AdapterHandlers {
  onSystemStatus: SystemStatusModule['applySystemStatusPayload'];
  onQueueUpdate: QueueModule['ingestQueue'];
  onProgress: QueueModule['handleProgressMessage'];
  onComplete: (message: GenerationCompleteMessage) => ReturnType<ResultsModule['createResultFromCompletion']>;
  onError: QueueModule['handleErrorMessage'];
  onRecentResults: ResultsModule['setResults'];
  onConnectionChange: SystemStatusModule['setConnectionState'];
}

export const createAdapterHandlers = ({
  queue,
  results,
  systemStatus,
  onJobsFinished,
}: AdapterHandlerDependencies): AdapterHandlers => {
  // The active-jobs feed drops a job once it completes or fails, which is the
  // signal (without WebSocket completion events) that its result is available.
  const handleQueueUpdate: AdapterHandlers['onQueueUpdate'] = (list) => {
    const before = [...queue.jobsByBackendId.value.keys()];
    queue.ingestQueue(list);
    const after = queue.jobsByBackendId.value;
    const finished = before.filter((id) => !after.has(id));
    if (finished.length > 0) {
      onJobsFinished?.(finished);
    }
  };

  const handleCompletion: AdapterHandlers['onComplete'] = (message) => {
    queue.handleCompletionMessage(message);
    const result = results.createResultFromCompletion(message);
    results.addResult(result);
    return result;
  };

  return {
    onSystemStatus: systemStatus.applySystemStatusPayload,
    onQueueUpdate: handleQueueUpdate,
    onProgress: queue.handleProgressMessage,
    onComplete: handleCompletion,
    onError: queue.handleErrorMessage,
    onRecentResults: results.setResults,
    onConnectionChange: systemStatus.setConnectionState,
  };
};

