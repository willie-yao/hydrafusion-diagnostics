import assert from "node:assert/strict";
import test from "node:test";

import {
    createDiagnosticsState,
    createPublicSnapshot,
    reduceDiagnosticsEvent,
} from "../src/reducer.mjs";
import { projectSessionEvent } from "../src/sanitize.mjs";
import { completedEvent, phaseEvent, resolvedEvent } from "./fixtures/events.mjs";

test("reduces a critique workflow and protects terminal phase state", () => {
    const state = createDiagnosticsState();
    for (const event of [
        resolvedEvent(),
        phaseEvent("assistant.fusion_phase_started"),
        phaseEvent("assistant.fusion_phase_completed", { id: "phase-complete" }),
        phaseEvent("assistant.fusion_phase_started", {
            id: "late-start",
            timestamp: "2026-10-01T11:59:00.000Z",
        }),
        completedEvent(),
    ]) {
        reduceDiagnosticsEvent(state, projectSessionEvent(event));
    }

    const [turn] = createPublicSnapshot(state).fusionTurns;
    assert.equal(turn.pattern, "critique");
    assert.equal(turn.status, "completed");
    assert.equal(turn.phases[0].status, "succeeded");
    assert.equal(turn.finalSourceModel, "model-a");
});

test("completion without start synthesizes a phase", () => {
    const state = createDiagnosticsState();
    reduceDiagnosticsEvent(
        state,
        projectSessionEvent(phaseEvent("assistant.fusion_phase_completed")),
    );
    assert.equal(createPublicSnapshot(state).fusionTurns[0].phases[0].status, "succeeded");
});

test("activity-only phases retain safe role and kind metadata", () => {
    const state = createDiagnosticsState();
    reduceDiagnosticsEvent(
        state,
        projectSessionEvent(phaseEvent("assistant.fusion_phase_activity", {
            data: { activity: "tool_started" },
        })),
    );
    const phase = createPublicSnapshot(state).fusionTurns[0].phases[0];
    assert.equal(phase.kind, "draft");
    assert.equal(phase.role, "draft");
    assert.equal(phase.lastActivity, "tool_started");
});

test("activity preserves model and reasoning metadata from phase start", () => {
    const state = createDiagnosticsState();
    reduceDiagnosticsEvent(
        state,
        projectSessionEvent(phaseEvent("assistant.fusion_phase_started")),
    );
    reduceDiagnosticsEvent(
        state,
        projectSessionEvent(phaseEvent("assistant.fusion_phase_activity", {
            id: "activity",
            data: { activity: "tool_started" },
        })),
    );
    const phase = createPublicSnapshot(state).fusionTurns[0].phases[0];
    assert.equal(phase.model, "model-a");
    assert.equal(phase.reasoningEffort, "high");
    assert.equal(phase.scope, "root");
});

test("handles all Hydrafusion workflow patterns", () => {
    for (const pattern of ["single", "cascade", "critique"]) {
        const state = createDiagnosticsState();
        reduceDiagnosticsEvent(
            state,
            projectSessionEvent(resolvedEvent({
                id: `resolved-${pattern}`,
                data: { pattern, fusionId: `fusion-${pattern}` },
            })),
        );
        assert.equal(createPublicSnapshot(state).fusionTurns[0].pattern, pattern);
    }
});

test("duplicate event IDs are idempotent", () => {
    const state = createDiagnosticsState();
    const event = projectSessionEvent(resolvedEvent());
    assert.equal(reduceDiagnosticsEvent(state, event), true);
    assert.equal(reduceDiagnosticsEvent(state, event), false);
    assert.equal(state.fusionTurns.length, 1);
});

test("retains only 25 completed turns", () => {
    const state = createDiagnosticsState();
    for (let index = 0; index < 30; index += 1) {
        reduceDiagnosticsEvent(
            state,
            projectSessionEvent(
                completedEvent({
                    id: `completed-${index}`,
                    data: { fusionId: `fusion-${index}`, turnId: `turn-${index}` },
                }),
            ),
        );
    }
    assert.equal(createPublicSnapshot(state).fusionTurns.length, 25);
    assert.equal(createPublicSnapshot(state).fusionTurns[0].fusionId, "fusion-5");
});

test("retains at most 25 active turns and reports truncation", () => {
    const state = createDiagnosticsState();
    for (let index = 0; index < 30; index += 1) {
        reduceDiagnosticsEvent(
            state,
            projectSessionEvent(resolvedEvent({
                id: `resolved-active-${index}`,
                data: { fusionId: `active-${index}` },
            })),
        );
    }
    const snapshot = createPublicSnapshot(state);
    assert.equal(snapshot.fusionTurns.length, 25);
    assert(snapshot.errors.some((error) => error.code === "turn_limit_truncated"));
});

test("publishes and bounds routing failures", () => {
    const state = createDiagnosticsState();
    for (let index = 0; index < 30; index += 1) {
        reduceDiagnosticsEvent(
            state,
            projectSessionEvent({
                id: `route-failed-${index}`,
                timestamp: "2026-10-01T12:00:00.000Z",
                type: "session.fusion_route_failed",
                data: {
                    attemptId: `attempt-${index}`,
                    fallbackModel: "model-c",
                    policy: "balanced",
                    reason: "router_unavailable",
                    routingLatencyMs: 100,
                    syntheticModel: "hydrafusion",
                },
            }),
        );
    }
    const snapshot = createPublicSnapshot(state);
    assert.equal(snapshot.routingAttempts.length, 25);
    assert.equal(snapshot.routingAttempts.at(-1).fallbackModel, "model-c");
});

test("tracks tool success and failure without exposing call IDs", () => {
    const state = createDiagnosticsState();
    reduceDiagnosticsEvent(
        state,
        projectSessionEvent({
            id: "start",
            timestamp: "2026-10-01T12:00:00.000Z",
            type: "tool.execution_start",
            data: { toolCallId: "secret-call", toolName: "view" },
        }),
    );
    reduceDiagnosticsEvent(
        state,
        projectSessionEvent({
            id: "complete",
            timestamp: "2026-10-01T12:00:01.000Z",
            type: "tool.execution_complete",
            data: { toolCallId: "secret-call", success: true },
        }),
    );
    const snapshot = createPublicSnapshot(state);
    assert.equal(snapshot.tools.completedCount, 1);
    assert.equal(snapshot.tools.activeCount, 0);
    assert.doesNotMatch(JSON.stringify(snapshot), /secret-call/);
});
