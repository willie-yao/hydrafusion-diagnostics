import assert from "node:assert/strict";
import test from "node:test";

import { DURABLE_EVENT_TYPES, HISTORY_PAGE_SIZE } from "../src/config.mjs";
import { readFusionHistory } from "../src/history.mjs";
import { completedEvent, resolvedEvent } from "./fixtures/events.mjs";

test("reads filtered durable history backward and replays chronologically", async () => {
    const requests = [];
    let call = 0;
    const result = await readFusionHistory({
        async read(request) {
            requests.push(request);
            call += 1;
            if (call === 1) {
                return {
                    events: [completedEvent()],
                    cursor: "older",
                    hasMore: true,
                    cursorStatus: "ok",
                };
            }
            return {
                events: [resolvedEvent()],
                cursor: "done",
                hasMore: false,
                cursorStatus: "ok",
            };
        },
    });

    assert.deepEqual(requests[0].types, DURABLE_EVENT_TYPES);
    assert.equal(requests[0].direction, "backward");
    assert.equal(requests[0].includeEphemeral, false);
    assert.equal(requests[0].agentScope, "primary");
    assert.equal(requests[0].max, HISTORY_PAGE_SIZE);
    assert.equal(result.events[0].type, "session.fusion_resolved");
    assert.equal(result.events[1].type, "session.fusion_completed");
});

test("marks expired history incomplete", async () => {
    const result = await readFusionHistory({
        async read() {
            return { events: [], cursor: "expired", hasMore: false, cursorStatus: "expired" };
        },
    });
    assert.equal(result.complete, false);
});

test("projects raw pages immediately and returns only 25 recent turns", async () => {
    const events = Array.from({ length: 100 }, (_, index) =>
        completedEvent({
            id: `completed-${index}`,
            data: {
                fusionId: `fusion-${index}`,
                content: `FORBIDDEN-${index}`,
            },
        }),
    );
    const result = await readFusionHistory({
        async read() {
            return { events, cursor: "done", hasMore: false, cursorStatus: "ok" };
        },
    });
    const ids = new Set(result.events.map((event) => event.data.fusionId).filter(Boolean));
    assert.equal(ids.size, 25);
    assert.doesNotMatch(JSON.stringify(result.events), /FORBIDDEN/);
});
