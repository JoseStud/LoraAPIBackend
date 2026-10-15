/**
 * Replays the progress-socket messages captured from the real backend
 * (tests/fixtures/generation_websocket_contract.json, produced by
 * tests/test_websocket_contract.py) through the browser's WebSocket manager.
 * If the backend changes a message shape or type, the fixture changes and this
 * spec fails until the frontend parser follows.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import contract from '../../../fixtures/generation_websocket_contract.json';

import { createGenerationWebSocketManager } from '@/features/generation/services/websocketManager';
import { parseGenerationSocketMessage } from '@/features/generation/services/websocketMessages';
import { createQueueModule } from '@/features/generation/stores/orchestrator/queueModule';
import { createAdapterHandlers } from '@/features/generation/stores/orchestrator/adapterHandlers';

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  onopen: (() => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  readonly sent: unknown[] = [];

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(): void {}

  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent);
  }
}

let originalWebSocket: typeof WebSocket | undefined;

const serverMessages = contract.server;
const messagesFor = (jobId: string) =>
  serverMessages.filter((message) => (message.data as { job_id?: string }).job_id === jobId);

describe('progress WebSocket contract', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    originalWebSocket = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
    (globalThis as { WebSocket?: typeof WebSocket }).WebSocket =
      MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    if (originalWebSocket) {
      (globalThis as { WebSocket?: typeof WebSocket }).WebSocket = originalWebSocket;
    } else {
      delete (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
    }
  });

  it('recognises every message type the backend sends', () => {
    for (const message of serverMessages) {
      const event = parseGenerationSocketMessage(message);
      expect(event.kind, `${message.type}: ${JSON.stringify(event)}`).not.toMatch(
        /^(unknown|invalid)$/,
      );
    }
  });

  it('subscribes to all jobs on every connection, including reconnects', () => {
    vi.useFakeTimers();
    try {
      const manager = createGenerationWebSocketManager({ getBackendUrl: () => '/api/v1' });
      manager.start();
      MockWebSocket.instances[0].onopen?.();
      expect(MockWebSocket.instances[0].sent).toEqual([contract.client.subscribe]);

      MockWebSocket.instances[0].onclose?.({ code: 1006 } as CloseEvent);
      vi.runOnlyPendingTimers();
      MockWebSocket.instances[1].onopen?.();
      expect(MockWebSocket.instances[1].sent).toEqual([contract.client.subscribe]);
      manager.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('unwraps progress and completion payloads for the transport handlers', () => {
    const onProgress = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();
    const manager = createGenerationWebSocketManager({
      getBackendUrl: () => '/api/v1',
      onProgress,
      onComplete,
      onError,
    });
    manager.start();
    const socket = MockWebSocket.instances[0];
    socket.onopen?.();
    serverMessages.forEach((message) => socket.receive(message));
    manager.stop();

    const progressData = serverMessages
      .filter((message) => message.type === 'progress_update')
      .map((message) => message.data as { job_id: string; progress: number });
    expect(onProgress.mock.calls.map(([update]) => [update.job_id, update.progress])).toEqual(
      progressData.map((data) => [data.job_id, data.progress]),
    );
    expect(onProgress.mock.calls[0][0].status).toBe('processing');

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toMatchObject({
      job_id: 'job-completed',
      status: 'completed',
      images: [expect.stringMatching(/^data:image\/png;base64,/)],
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toEqual({
      job_id: 'job-failed',
      error: 'SD.Next returned no images',
      status: 'failed',
    });
  });

  it('shows live progress in the queue and refreshes results on completion', () => {
    const queue = createQueueModule();
    const onJobsFinished = vi.fn();
    const handlers = createAdapterHandlers({
      queue,
      results: { setResults: vi.fn() },
      systemStatus: { applySystemStatusPayload: vi.fn(), setConnectionState: vi.fn() },
      onJobsFinished,
    });
    const manager = createGenerationWebSocketManager({
      getBackendUrl: () => '/api/v1',
      onProgress: handlers.onProgress,
      onComplete: handlers.onComplete,
      onError: handlers.onError,
    });
    manager.start();
    const socket = MockWebSocket.instances[0];
    socket.onopen?.();

    const [, running, finalTick, complete] = messagesFor('job-completed');
    socket.receive(running);
    expect(queue.getJobByIdentifier('job-completed')).toMatchObject({
      status: 'processing',
      progress: 50,
    });

    socket.receive(finalTick);
    socket.receive(complete);
    expect(queue.getJobByIdentifier('job-completed')).toBeUndefined();
    expect(onJobsFinished).toHaveBeenCalledWith(['job-completed']);

    // A failed job that was never tracked does not flash into the queue.
    messagesFor('job-failed').forEach((message) => socket.receive(message));
    expect(queue.getJobByIdentifier('job-failed')).toBeUndefined();
    expect(onJobsFinished).toHaveBeenCalledTimes(1);

    manager.stop();
  });
});
