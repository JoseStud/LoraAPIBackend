/**
 * Type definitions mirroring backend/schemas/deliveries.py.
 */

export interface ComposeDeliveryHTTP {
  host: string;
  port?: number | null;
  path?: string | null;
}

export interface ComposeDeliveryCLI {
  template?: string | null;
}

export interface ComposeDelivery {
  mode: string;
  http?: ComposeDeliveryHTTP | null;
  cli?: ComposeDeliveryCLI | null;
}

export interface ComposeDeliveryInfo {
  id: string;
  status: string;
}

export interface ComposeResponse {
  prompt: string;
  tokens: string[];
  delivery?: ComposeDeliveryInfo | null;
}

export interface ComposeRequest {
  prefix?: string | null;
  suffix?: string | null;
  delivery?: ComposeDelivery | null;
}

export interface DeliveryCreate {
  prompt: string;
  mode: string;
  /**
   * Backend accepts arbitrary parameter dictionaries for different delivery engines.
   * TODO: tighten this definition when concrete parameter schemas are published.
   */
  params?: Record<string, unknown> | null;
}

export interface DeliveryRead {
  id: string;
  prompt: string;
  mode: string;
  params: Record<string, unknown>;
  /**
   * Delivery result varies per delivery type (image URLs, metadata, errors, ...).
   * TODO: introduce discriminated unions once backend standardises result payloads.
   */
  result?: unknown;
  status: string;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface DeliveryWrapper {
  delivery: DeliveryRead;
}

export interface DeliveryCreateResponse {
  delivery_id: string;
}
