import assert from "node:assert/strict";
import test from "node:test";

import { mergeInitializationEvents } from "../src/startup.mjs";

test("orders buffered route starts before durable failures and deduplicates outcomes", () => {
    const start = {
        id: "start",
        timestamp: "2026-10-01T12:00:00.000Z",
        type: "session.fusion_route_started",
        data: { attemptId: "attempt-1" },
    };
    const failure = {
        id: "failure",
        timestamp: "2026-10-01T12:00:01.000Z",
        type: "session.fusion_route_failed",
        data: { attemptId: "attempt-1" },
    };
    const merged = mergeInitializationEvents([failure], [start, failure]);
    assert.deepEqual(merged.map((event) => event.type), [
        "session.fusion_route_started",
        "session.fusion_route_failed",
    ]);
});

test("orders route starts before resolved outcomes with equal timestamps", () => {
    const timestamp = "2026-10-01T12:00:00.000Z";
    const merged = mergeInitializationEvents(
        [{ id: "resolved", timestamp, type: "session.fusion_resolved", data: {} }],
        [{ id: "start", timestamp, type: "session.fusion_route_started", data: {} }],
    );
    assert.deepEqual(merged.map((event) => event.type), [
        "session.fusion_route_started",
        "session.fusion_resolved",
    ]);
});
