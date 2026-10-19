import type { Event, EventType } from "../src/lib/types";

let n = 0;
export const ev = (type: EventType, ts: string, contactId: string, extra: Partial<Event> = {}): Event => ({
  id: `e${n}`, orgId: "o1", type, ts, contactId, key: `k${n++}`, ...extra,
});
