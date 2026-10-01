import assert from "node:assert/strict";
import test from "node:test";

import { createDiagnosticsState, createPublicSnapshot, reduceDiagnosticsEvent } from "../src/reducer.mjs";
import { projectSessionEvent, projectUsageMetrics } from "../src/sanitize.mjs";
import { phaseEvent, resolvedEvent } from "./fixtures/events.mjs";

test("phase projection excludes content, verdict, errors, and unknown fields", () => {
    const forbidden = "FORBIDDEN_SENTINEL";
    const event = phaseEvent("assistant.fusion_phase_completed", {
        data: {
            content: forbidden,
            verdict: forbidden,
            errorMessage: forbidden,
            unknown: forbidden,
        },
    });

    const state = createDiagnosticsState();
    reduceDiagnosticsEvent(state, projectSessionEvent(event));

    assert.doesNotMatch(JSON.stringify(createPublicSnapshot(state)), /FORBIDDEN_SENTINEL/);
});

test("history-safe phase projection does not retain raw event objects", () => {
    const forbidden = "FORBIDDEN_SENTINEL";
    const event = phaseEvent("assistant.fusion_phase_completed", {
        data: { content: forbidden, verdict: forbidden },
    });
    const projected = projectSessionEvent(event);
    event.data.content = "MUTATED_SENTINEL";
    assert.doesNotMatch(JSON.stringify(projected), /FORBIDDEN|MUTATED/);
});

test("tool projection excludes arguments, results, errors, and paths", () => {
    const forbidden = "FORBIDDEN_SENTINEL";
    const projected = projectSessionEvent({
        id: "tool-1",
        timestamp: "2026-10-01T12:00:00.000Z",
        type: "tool.execution_start",
        data: {
            toolCallId: "call-1",
            toolName: "view",
            arguments: { path: forbidden },
            result: forbidden,
            error: forbidden,
        },
    });
    assert.doesNotMatch(JSON.stringify(projected), /FORBIDDEN_SENTINEL/);
});

test("route projection excludes hint and unexpected text", () => {
    const projected = projectSessionEvent({
        ...resolvedEvent(),
        data: {
            ...resolvedEvent().data,
            hint: "FORBIDDEN_SENTINEL",
            unexpected: "FORBIDDEN_SENTINEL",
        },
    });
    assert.doesNotMatch(JSON.stringify(projected), /FORBIDDEN_SENTINEL/);
});

test("usage projection keeps service costs separate", () => {
    const usage = projectUsageMetrics({
        totalUserRequests: 2,
        totalPremiumRequestCost: 1.5,
        totalNanoAiu: 100,
        modelMetrics: {
            "model-a": {
                requests: { count: 2, cost: 1.5 },
                usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 3, cacheWriteTokens: 1 },
                totalNanoAiu: 100,
            },
        },
    });
    assert.equal(usage.premiumRequestCost, 1.5);
    assert.equal(usage.totalNanoAiu, 100);
    assert.equal(usage.models["model-a"].premiumRequestCost, 1.5);
});

test("unknown events are ignored", () => {
    assert.equal(projectSessionEvent({ type: "assistant.message", data: { content: "secret" } }), undefined);
});
