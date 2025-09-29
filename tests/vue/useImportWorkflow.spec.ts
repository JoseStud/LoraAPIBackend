import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { useImportWorkflow, type ProgressCallbacks } from '../../app/frontend/src/composables/import-export/useImportWorkflow';
import type { BackendClient } from '../../app/frontend/src/services/backendClient';

const requestJson = vi.fn();

const createBackendClientMock = (base = 'https://api.example'): BackendClient => {
  const resolvePath = (path = ''): string => {
    if (!path) {
      return base.replace(/\/+$/, '');
    }
    if (/^https?:\/\//i.test(path)) {
      return path;
    }
    const trimmedBase = base.replace(/\/+$/, '');
    const trimmedPath = path.replace(/^\/+/, '');
    return `${trimmedBase}/${trimmedPath}`;
  };

  return {
    resolve: vi.fn((path?: string) => resolvePath(path ?? '')),
    requestJson: vi.fn((path: string, init?: RequestInit) => requestJson(resolvePath(path), init)),
    getJson: vi.fn(),
    postJson: vi.fn(),
    putJson: vi.fn(),
    patchJson: vi.fn(),
    delete: vi.fn(),
    requestBlob: vi.fn(),
  } as unknown as BackendClient;
};

vi.mock('@/services/apiClient', async () => {
  const actual = await vi.importActual<typeof import('@/services/apiClient')>('@/services/apiClient');
  return {
    ...actual,
    ensureData: (value: unknown) => value
  };
});

describe('useImportWorkflow', () => {
  const notify = vi.fn();
  let backendClient: BackendClient;
  let progress: ProgressCallbacks;

  beforeEach(() => {
    vi.useFakeTimers();
    backendClient = createBackendClientMock('https://custom.example');
    requestJson.mockReset();
    notify.mockReset();

    requestJson.mockResolvedValue({ processed_files: 1, total_files: 1 });
    progress = {
      begin: vi.fn(),
      update: vi.fn(),
      end: vi.fn()
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds valid files and filters unsupported ones', () => {
    const workflow = useImportWorkflow({ notify, progress, backendClient });
    const validFile = new File(['data'], 'test.zip');
    const invalidFile = new File(['data'], 'invalid.txt');

    workflow.addFiles([validFile, invalidFile]);

    expect(workflow.importFiles.value).toHaveLength(1);
    expect(workflow.importFiles.value[0].name).toBe('test.zip');
    expect(notify).toHaveBeenCalledWith('Some files were skipped (unsupported format)', 'warning');
  });

  it('analyzes files and populates preview', async () => {
    const workflow = useImportWorkflow({ notify, progress, backendClient });
    workflow.addFiles([new File(['data'], 'test.zip')]);

    const analyzePromise = workflow.analyzeFiles();
    await vi.runAllTimersAsync();
    await analyzePromise;

    expect(notify).toHaveBeenCalledWith('File analysis completed', 'success');
    expect(workflow.importPreview.value.length).toBeGreaterThan(0);
  });

  it('validates import configuration', () => {
    const workflow = useImportWorkflow({ notify, progress, backendClient });

    workflow.validateImport();
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('No files selected for import'), 'error');

    workflow.addFiles([new File(['data'], 'test.zip')]);
    workflow.validateImport();
    expect(notify).toHaveBeenCalledWith('Import configuration is valid', 'success');
  });

  it('starts import workflow and clears files on success', async () => {
    const workflow = useImportWorkflow({ notify, progress, backendClient });
    workflow.addFiles([new File(['data'], 'test.zip')]);

    await workflow.startImport();

    expect(progress.begin).toHaveBeenCalled();
    expect(requestJson).toHaveBeenCalledWith(
      'https://custom.example/api/v1/import',
      expect.objectContaining({ method: 'POST' })
    );
    expect(notify).toHaveBeenCalledWith('Import completed: 1 files processed', 'success');
    expect(workflow.importFiles.value).toHaveLength(0);
    expect(progress.end).toHaveBeenCalled();
  });

  it('cancels import by resetting state', () => {
    const workflow = useImportWorkflow({ notify, progress, backendClient });
    workflow.cancelImport();
    expect(workflow.isImporting.value).toBe(false);
  });
});
