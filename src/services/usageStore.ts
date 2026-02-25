import { UsageStore, UsageEvent } from '../types/gateway.js';

/**
 * In-memory usage event store.
 * In production this would write to a database table.
 */
export class InMemoryUsageStore implements UsageStore {
  private events: UsageEvent[] = [];

  record(event: UsageEvent): void {
    this.events.push(event);
  }

  getEvents(apiKey?: string): UsageEvent[] {
    if (apiKey) {
      return this.events.filter((e) => e.apiKey === apiKey);
    }
    return [...this.events];
  }

  /** Helper for tests — clear all events. */
  clear(): void {
    this.events = [];
  }
}

export function createUsageStore(): InMemoryUsageStore {
  return new InMemoryUsageStore();
}
