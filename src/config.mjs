export const SCHEMA_VERSION = 1;
export const MAX_TURNS = 25;
export const MAX_EVENT_IDS = 1000;
export const MAX_SSE_CLIENTS = 4;
export const HISTORY_PAGE_SIZE = 200;

export const DURABLE_EVENT_TYPES = [
    "session.fusion_route_failed",
    "session.fusion_resolved",
    "assistant.fusion_phase_completed",
    "assistant.fusion_phase_failed",
    "session.fusion_completed",
];
