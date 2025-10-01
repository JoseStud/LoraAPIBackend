/** @internal */
import type { QueueModule } from './queueModule';
import type { ResultsModule } from './resultsModule';
import type { SystemStatusModule } from './systemStatusModule';
import type { GenerationCompleteMessage } from '@/types';

export interface AdapterHandlerDependencies {
  queue: Pick<
    QueueModule,
    | 'ingestQueue'
    | 'handleProgressMessage'
    | 'handleCompletionMessage'
    | 'handleErrorMessage'
  >;
  results: Pick<ResultsModule, 'setResults' | 'addResult' | 'createResultFromCompletion'>;
  systemStatus: Pick<SystemStatusModule, 'applySystemStatusPayload' | 'setConnectionState'>;
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
}: AdapterHandlerDependencies): AdapterHandlers => {
  const handleCompletion: AdapterHandlers['onComplete'] = (message) => {
    queue.handleCompletionMessage(message);
    const result = results.createResultFromCompletion(message);
    results.addResult(result);
    return result;
  };

  return {
    onSystemStatus: systemStatus.applySystemStatusPayload,
    onQueueUpdate: queue.ingestQueue,
    onProgress: queue.handleProgressMessage,
    onComplete: handleCompletion,
    onError: queue.handleErrorMessage,
    onRecentResults: results.setResults,
    onConnectionChange: systemStatus.setConnectionState,
  };
};

