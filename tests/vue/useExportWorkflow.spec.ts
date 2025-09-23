import { describe, it, expect, beforeEach, vi } from 'vitest';
import { nextTick } from 'vue';

import { useExportWorkflow, type ProgressCallbacks } from '../../app/frontend/src/composables/useExportWorkflow';

const postJson = vi.fn();
const requestBlob = vi.fn();
const getFilenameFromContentDisposition = vi.fn();
const downloadFile = vi.fn();

vi.mock('@/utils/api', async () => {
  const actual = await vi.importActual<typeof import('@/utils/api')>('@/utils/api');
  return {
    ...actual,
    postJson: (...args: unknown[]) => postJson(...args),
    requestBlob: (...args: unknown[]) => requestBlob(...args),
    ensureData: (value: unknown) => value,
    getFilenameFromContentDisposition: (...args: unknown[]) => getFilenameFromContentDisposition(...args)
  };
});

vi.mock('@/utils/browser', async () => {
  const actual = await vi.importActual<typeof import('@/utils/browser')>('@/utils/browser');
  return {
    ...actual,
    downloadFile: (...args: unknown[]) => downloadFile(...args)
  };
});

describe('useExportWorkflow', () => {
  const notify = vi.fn();
  let progress: ProgressCallbacks;

  beforeEach(() => {
    postJson.mockReset();
    requestBlob.mockReset();
    getFilenameFromContentDisposition.mockReset();
    downloadFile.mockReset();
    notify.mockReset();

    postJson.mockResolvedValue({ size: '10 MB', time: '5 minutes' });
    requestBlob.mockResolvedValue({
      blob: new Blob(['content'], { type: 'application/zip' }),
      response: new Response(null, { headers: { 'Content-Disposition': 'attachment; filename="export.zip"' } })
    });
    getFilenameFromContentDisposition.mockReturnValue('export.zip');

    progress = {
      begin: vi.fn(),
      update: vi.fn(),
      end: vi.fn()
    };
  });

  it('initializes and updates estimates', async () => {
    const workflow = useExportWorkflow({ notify, progress });

    await workflow.initialize();
    await nextTick();

    expect(postJson).toHaveBeenCalledWith('/api/v1/export/estimate', expect.any(Object));
    expect(workflow.estimatedSize.value).toBe('10 MB');
    expect(workflow.estimatedTime.value).toBe('5 minutes');
  });

  it('validates configuration and triggers notifications', () => {
    const workflow = useExportWorkflow({ notify, progress });

    workflow.updateConfig('loras', false);
    workflow.updateConfig('generations', false);
    workflow.updateConfig('user_data', false);
    workflow.updateConfig('system_config', false);
    workflow.updateConfig('analytics', false);
    workflow.validateExport();

    expect(notify).toHaveBeenCalledWith(expect.stringContaining('No data types selected for export'), 'error');

    workflow.updateConfig('loras', true);
    workflow.validateExport();
    expect(notify).toHaveBeenCalledWith('Export configuration is valid', 'success');
  });

  it('starts export and downloads file', async () => {
    const workflow = useExportWorkflow({ notify, progress });

    await workflow.startExport();

    expect(progress.begin).toHaveBeenCalled();
    expect(requestBlob).toHaveBeenCalledWith('/api/v1/export', expect.objectContaining({ method: 'POST' }));
    expect(downloadFile).toHaveBeenCalledWith(expect.any(Blob), 'export.zip');
    expect(progress.end).toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('Export completed successfully', 'success');
  });

  it('quick export enables primary datasets and triggers export', async () => {
    const workflow = useExportWorkflow({ notify, progress });

    requestBlob.mockClear();
    await workflow.quickExportAll();

    expect(workflow.exportConfig.loras).toBe(true);
    expect(workflow.exportConfig.lora_files).toBe(true);
    expect(workflow.exportConfig.generations).toBe(true);
    expect(workflow.exportConfig.user_data).toBe(true);
    expect(workflow.exportConfig.system_config).toBe(true);
    expect(requestBlob).toHaveBeenCalled();
  });

  it('cancels export by resetting state', () => {
    const workflow = useExportWorkflow({ notify, progress });
    workflow.cancelExport();
    expect(workflow.isExporting.value).toBe(false);
  });
});
