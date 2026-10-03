/**
 * Builds an adapter record that satisfies the frontend AdapterRead schema
 * (app/frontend/src/schemas/lora.ts), so component specs can stub `/adapters`
 * responses without tripping schema validation.
 */
export const createAdapterFixture = (overrides = {}) => ({
  id: 'adapter-1',
  name: 'Adapter One',
  description: null,
  visibility: 'Public',
  tags: [],
  file_path: `/loras/${overrides.id ?? 'adapter-1'}.safetensors`,
  weight: 1,
  active: true,
  supports_generation: true,
  nsfw_level: 0,
  stats: null,
  extra: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  ...overrides,
});
