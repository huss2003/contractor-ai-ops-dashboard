export const EVENT_TYPES = [
  "call.missed",
  "call.answered",
  "sms.sent",
  "lead.created",
  "booking.created",
  "job.completed",
  "review.requested",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** One row of the append-only event log. `ts` is ISO-8601 UTC. */
export interface Event {
  id: string;
  orgId: string;
  type: EventType;
  ts: string;
  contactId: string;
  source?: string;
  /** Dollars; set on job.completed. */
  value?: number;
  key: string; // idempotency key, unique per org
}
export type NewEvent = Omit<Event, "id">;

export interface Org {
  id: string;
  name: string;
  webhookSecret: string;
}

export interface Summary {
  orgId: string;
  weekStart: string;
  summary: string;
  actions: string[];
  createdAt: string;
}
