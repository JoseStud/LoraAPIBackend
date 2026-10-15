/** @internal */
import type { QueueModule } from './queueModule';
import type { ResultsModule } from './resultsModule';
import type { SystemStatusModule } from './systemStatusModule';

export interface AdapterHandlerDependencies {
  queue: Pick<
    QueueModule,
    | 'ingestQueue'
    | 'jobsByBackendId'
    | 'handleProgressMessage'
    | 'handleCompletionMessage'
    | 'handleErrorMessage'
  >;
  results: Pick<ResultsModule, 'setResults'>;
  systemStatus: Pick<SystemStatusModule, 'applySystemStatusPayload' | 'setConnectionState'>;
  /**
   * Called with the backend ids of jobs whose results are now available: on a
   * WebSocket completion, or when a job leaves the active-jobs feed.
   */
  onJobsFinished?: (jobIds: string[]) => void;
}

export interface AdapterHandlers {
  onSystemStatus: SystemStatusModule['applySystemStatusPayload'];
  onQueueUpdate: QueueModule['ingestQueue'];
  onProgress: QueueModule['handleProgressMessage'];
  onComplete: QueueModule['handleCompletionMessage'];
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

  // The completion message carries no prompt or image settings, so the stored
  // result is fetched instead. Removing the job here also means the feed check
  // above will not report it a second time.
  const handleCompletion: AdapterHandlers['onComplete'] = (message) => {
    queue.handleCompletionMessage(message);
    onJobsFinished?.([String(message.job_id)]);
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

