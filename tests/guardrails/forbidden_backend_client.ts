// This file intentionally exercises the BackendClient restriction guardrail.
import { useBackendClient } from '@/services/backendClient';

void useBackendClient;
