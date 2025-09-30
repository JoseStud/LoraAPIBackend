/**
 * Type definitions mirroring backend/schemas/deliveries.py.
 */

import type { BackendSchemas } from './generated';
import type { ComposeDeliverySDNext } from './generation';
import type { JsonObject } from './json';

type Schemas = BackendSchemas;
type DeliveryCreateSchema = Schemas['DeliveryCreate'];
type DeliveryReadSchema = Schemas['DeliveryRead'];

export type ComposeDeliveryHTTP = Schemas['ComposeDeliveryHTTP'];

export type ComposeDeliveryCLI = Schemas['ComposeDeliveryCLI'];

export type ComposeDelivery = Omit<Schemas['ComposeDelivery'], 'sdnext'> & {
  sdnext?: ComposeDeliverySDNext | null;
};

export type ComposeDeliveryInfo = Schemas['ComposeDeliveryInfo'];

export type ComposeResponse = Schemas['ComposeResponse'];

export type ComposeRequest = Schemas['ComposeRequest'];

export type DeliveryCreate = Omit<DeliveryCreateSchema, 'params'> & {
  params?: JsonObject | null;
};

export type DeliveryRead = Omit<DeliveryReadSchema, 'params' | 'result'> & {
  params: JsonObject;
  result?: JsonObject | null;
};

export type DeliveryWrapper = Schemas['DeliveryWrapper'];

export type DeliveryCreateResponse = Schemas['DeliveryCreateResponse'];
