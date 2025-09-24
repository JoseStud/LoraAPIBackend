/**
 * Type definitions mirroring backend/schemas/deliveries.py.
 */

import type { ComposeDeliverySDNext } from './generation';
import type { JsonObject } from './json';

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
  sdnext?: ComposeDeliverySDNext | null;
}

export interface ComposeDeliveryInfo {
  id: string;
  status: string;
}

export interface ComposeResponse {
  prompt: string;
  tokens: string[];
  warnings: string[];
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
  params?: JsonObject | null;
}

export interface DeliveryRead {
  id: string;
  prompt: string;
  mode: string;
  params: JsonObject;
  result?: JsonObject | null;
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
