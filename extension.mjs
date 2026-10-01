import { createCanvas, joinSession } from "@github/copilot-sdk/extension";

import { createDiagnosticsServer } from "./src/server.mjs";
import {
    createDiagnosticsState,
    createPublicSnapshot,
    reduceDiagnosticsEvent,
    replaceCurrentModel,
    replaceUsage,
    setConnection,
} from "./src/reducer.mjs";
import { readFusionHistory } from "./src/history.mjs";
import { projectSessionEvent } from "./src/sanitize.mjs";
import { mergeInitializationEvents } from "./src/startup.mjs";

const state = createDiagnosticsState();
const listeners = new Set();
const subscriptions = [];
const bufferedEvents = [];
let historicalEvents = [];
let initializing = true;
let stopped = false;
let metricsTimer;

function publish() {
    const snapshot = createPublicSnapshot(state);
    for (const listener of listeners) {
        listener(snapshot);
    }
}

function update(event) {
    if (event && reduceDiagnosticsEvent(state, event)) {
        publish();
    }
}

function handleLiveEvent(event) {
    const projected = projectSessionEvent(event);
    if (!projected) return;
    if (initializing) {
        bufferedEvents.push(projected);
        return;
    }
    update(projected);
}

const server = await createDiagnosticsServer({
    getSnapshot: () => createPublicSnapshot(state),
    subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },
});

const canvas = createCanvas({
    id: "hydrafusion-diagnostics",
    displayName: "Hydrafusion Diagnostics",
    description: "Shows Hydrafusion workflow phases, concrete models, latency, tokens, and normalized cost.",
    open: () => ({
        title: "Hydrafusion Diagnostics",
        status: state.connection,
        url: server.url,
    }),
});

const session = await joinSession({ canvases: [canvas] });

async function refreshMetrics() {
    try {
        const metrics = await session.rpc.usage.getMetrics();
        replaceUsage(state, metrics);
        publish();
    } catch {
        update({
            type: "diagnostics.capability_error",
            data: {
                code: "usage_unavailable",
                feature: "usage",
                message: "Session usage metrics are unavailable.",
            },
        });
    }
}

function scheduleMetricsRefresh() {
    clearTimeout(metricsTimer);
    metricsTimer = setTimeout(() => {
        metricsTimer = undefined;
        void refreshMetrics();
    }, 150);
}

function subscribe(type, handler) {
    subscriptions.push(session.on(type, handler));
}

for (const type of [
    "session.model_change",
    "session.fusion_route_started",
    "session.fusion_route_failed",
    "session.fusion_resolved",
    "assistant.fusion_phase_started",
    "assistant.fusion_phase_activity",
    "assistant.fusion_phase_completed",
    "assistant.fusion_phase_failed",
    "session.fusion_completed",
    "tool.execution_start",
    "tool.execution_complete",
]) {
    subscribe(type, handleLiveEvent);
}

subscribe("assistant.usage", scheduleMetricsRefresh);
subscribe("session.idle", () => void refreshMetrics());
subscribe("session.shutdown", () => void stop());

try {
    const history = await readFusionHistory(session.rpc.eventLog);
    historicalEvents = history.events;
    if (!history.complete) {
        update({
            type: "diagnostics.capability_error",
            data: {
                code: "history_incomplete",
                feature: "history",
                message: "Some earlier Hydrafusion history could not be restored.",
            },
        });
    }
} catch {
    update({
        type: "diagnostics.capability_error",
        data: {
            code: "history_unavailable",
            feature: "history",
            message: "Hydrafusion history is unavailable for this session.",
        },
    });
}

try {
    replaceCurrentModel(state, await session.rpc.model.getCurrent());
} catch {
    update({
        type: "diagnostics.capability_error",
        data: {
            code: "model_unavailable",
            feature: "model",
            message: "Current model details are unavailable.",
        },
    });
}

await refreshMetrics();

initializing = false;
for (const event of mergeInitializationEvents(historicalEvents, bufferedEvents.splice(0))) {
    update(event);
}
historicalEvents = [];

setConnection(state, "ready");
publish();

async function stop() {
    if (stopped) return;
    stopped = true;
    clearTimeout(metricsTimer);
    for (const unsubscribe of subscriptions.splice(0)) {
        unsubscribe();
    }
    setConnection(state, "stopped");
    publish();
    await server.close();
}

process.once("SIGTERM", () => void stop());
process.once("SIGINT", () => void stop());
