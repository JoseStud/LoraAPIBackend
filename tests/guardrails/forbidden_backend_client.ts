// This file intentionally exercises the BackendClient restriction guardrail.
import { useBackendClient } from '@/services/shared/http';

void useBackendClient;
