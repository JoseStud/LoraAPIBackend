import type { ExportConfig } from './useExportWorkflow';

type ExportConfigKey = keyof ExportConfig;

type UpdateConfigFn = <K extends ExportConfigKey>(key: K, value: ExportConfig[K]) => void;

export function useExportConfigFields(updateConfig: UpdateConfigFn) {
  const onCheckboxChange = <K extends ExportConfigKey>(key: K, event: Event) => {
    const target = event.target as HTMLInputElement | null;
    if (target) {
      updateConfig(key, target.checked as ExportConfig[K]);
    }
  };

  const onRadioChange = <K extends ExportConfigKey>(key: K, event: Event) => {
    const target = event.target as HTMLInputElement | null;
    if (target) {
      updateConfig(key, target.value as ExportConfig[K]);
    }
  };

  const onSelectChange = <K extends ExportConfigKey>(key: K, event: Event) => {
    const target = event.target as HTMLSelectElement | null;
    if (target) {
      updateConfig(key, target.value as ExportConfig[K]);
    }
  };

  const onInputChange = <K extends ExportConfigKey>(key: K, event: Event) => {
    const target = event.target as HTMLInputElement | null;
    if (target) {
      updateConfig(key, target.value as ExportConfig[K]);
    }
  };

  const onNumberInput = <K extends ExportConfigKey>(key: K, event: Event) => {
    const target = event.target as HTMLInputElement | null;
    if (target) {
      const parsed = Number(target.value);
      updateConfig(key, (Number.isNaN(parsed) ? 0 : parsed) as ExportConfig[K]);
    }
  };

  return {
    onCheckboxChange,
    onRadioChange,
    onSelectChange,
    onInputChange,
    onNumberInput
  };
}
