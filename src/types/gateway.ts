/** Represents a registered API key mapping to a developer and API. */
export interface ApiKey {
  key: string;
  developerId: string;
  apiId: string;
}

/** A single recorded usage event from a proxied request. */
export interface UsageEvent {
  id: string;
  apiKey: string;
  apiId: string;
  statusCode: number;
  timestamp: string; // ISO-8601
}

/** Result of a billing deduction attempt. */
export interface BillingResult {
  success: boolean;
  balance?: number;
}

/** Result of a rate-limit check. */
export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

/** Interface for billing / credit deduction (e.g. Soroban). */
export interface BillingService {
  deductCredit(developerId: string, amount: number): Promise<BillingResult>;
}

/** Interface for rate limiting. */
export interface RateLimiter {
  check(apiKey: string): RateLimitResult;
}

/** Interface for recording and querying usage events. */
export interface UsageStore {
  record(event: UsageEvent): void;
  getEvents(apiKey?: string): UsageEvent[];
}

/** Dependencies injected into the gateway router factory. */
export interface GatewayDeps {
  billing: BillingService;
  rateLimiter: RateLimiter;
  usageStore: UsageStore;
  upstreamUrl: string;
  apiKeys: Map<string, ApiKey>;
}
