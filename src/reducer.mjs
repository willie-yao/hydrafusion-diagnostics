import { MAX_EVENT_IDS, MAX_TURNS, SCHEMA_VERSION } from "./config.mjs";
import { projectCurrentModel, projectUsageMetrics } from "./sanitize.mjs";

export function createDiagnosticsState() {
    return {
        schemaVersion: SCHEMA_VERSION,
        connection: "loading",
        session: {
            selectedModel: undefined,
            reasoningEffort: undefined,
            contextTier: undefined,
            autoTier: undefined,
            startedAt: new Date().toISOString(),
            lastUpdatedAt: new Date().toISOString(),
        },
        usage: projectUsageMetrics(),
        tools: {
            activeCalls: new Map(),
            completedCount: 0,
            failedCount: 0,
            byName: {},
        },
        fusionTurns: [],
        errors: [],
        processedIds: new Set(),
        processedIdQueue: [],
        routingAttempts: [],
    };
}

export function setConnection(state, connection) {
    state.connection = connection;
    touch(state);
}

export function replaceCurrentModel(state, model) {
    Object.assign(state.session, projectCurrentModel(model));
    touch(state);
}

export function replaceUsage(state, metrics) {
    state.usage = projectUsageMetrics(metrics);
    touch(state);
}

export function reduceDiagnosticsEvent(state, event) {
    if (!event) return false;
    if (event.id && seen(state, event.id)) return false;

    const data = event.data ?? {};
    switch (event.type) {
        case "diagnostics.capability_error":
            recordError(state, data);
            break;
        case "session.model_change":
            Object.assign(state.session, {
                selectedModel: data.modelId,
                reasoningEffort: data.reasoningEffort,
                contextTier: data.contextTier,
                autoTier: data.autoTier,
            });
            break;
        case "session.fusion_route_started":
            if (!data.attemptId) return invalid(state, "missing_attempt_id", "routing");
            upsertRoutingAttempt(state, {
                attemptId: data.attemptId,
                status: "routing",
                policy: data.policy,
                syntheticModel: data.syntheticModel,
                startedAt: event.timestamp,
            });
            break;
        case "session.fusion_route_failed":
            if (!data.attemptId) return invalid(state, "missing_attempt_id", "routing");
            upsertRoutingAttempt(state, {
                status: "failed",
                attemptId: data.attemptId,
                fallbackModel: data.fallbackModel,
                policy: data.policy,
                degradedReason: data.reason,
                routingLatencyMs: data.routingLatencyMs,
                syntheticModel: data.syntheticModel,
                completedAt: event.timestamp,
            });
            break;
        case "session.fusion_resolved": {
            if (!data.fusionId) return invalid(state, "missing_fusion_id", "routing");
            removeLatestActiveRoutingAttempt(state);
            const turn = getTurn(state, data.fusionId, event.timestamp);
            Object.assign(turn, {
                turnId: data.turnId,
                pattern: data.pattern,
                status: terminal(turn.status) ? turn.status : "resolved",
                policy: data.policy,
                policyVersion: data.policyVersion,
                routeSource: data.routeSource,
                routingLatencyMs: data.routingLatencyMs,
                ruleId: data.ruleId,
                ruleIndex: data.ruleIndex,
                ruleName: data.ruleName,
                modelUniverseVersion: data.modelUniverseVersion,
                planVersion: data.planVersion,
                scores: data.scores,
                primaryModel: data.primaryModel,
                secondaryModel: data.secondaryModel,
                judgeModel: data.judgeModel,
                repairModel: data.repairModel,
                fallbackModel: data.fallbackModel,
                followUpModel: data.followUpModel,
                syntheticModel: data.syntheticModel,
                phasePlan: data.phasePlan,
                critics: data.critics,
            });
            break;
        }
        case "assistant.fusion_phase_started": {
            const phase = requiredPhase(state, event);
            if (!phase) return true;
            if (!terminal(phase.status)) {
                Object.assign(phase, phaseIdentity(data), {
                    status: "running",
                    startedAt: phase.startedAt ?? event.timestamp,
                    lastActivityAt: event.timestamp,
                });
            }
            break;
        }
        case "assistant.fusion_phase_activity": {
            const phase = requiredPhase(state, event);
            if (!phase) return true;
            if (!terminal(phase.status)) {
                assignDefined(phase, {
                    kind: data.phaseKind,
                    role: data.role,
                    scope: data.conversationScope,
                });
                phase.lastActivityAt = event.timestamp;
                phase.lastActivity = data.activity;
            }
            break;
        }
        case "assistant.fusion_phase_completed": {
            const phase = requiredPhase(state, event);
            if (!phase) return true;
            Object.assign(phase, phaseIdentity(data), {
                status: "succeeded",
                completedAt: event.timestamp,
                durationMs: data.durationMs,
                usage: data.usage,
            });
            break;
        }
        case "assistant.fusion_phase_failed": {
            const phase = requiredPhase(state, event);
            if (!phase) return true;
            Object.assign(phase, phaseIdentity(data), {
                status: "failed",
                completedAt: event.timestamp,
                durationMs: data.durationMs,
                usage: data.usage,
                failureReason: data.reason,
                degradedToPhaseId: data.degradedToPhaseId,
            });
            break;
        }
        case "session.fusion_completed": {
            if (!data.fusionId) return invalid(state, "missing_fusion_id", "completion");
            const turn = getTurn(state, data.fusionId, event.timestamp);
            Object.assign(turn, {
                turnId: data.turnId ?? turn.turnId,
                pattern: data.pattern ?? turn.pattern,
                status: data.outcome === "failed" ? "failed" : "completed",
                completedAt: event.timestamp,
                durationMs: data.durationMs,
                finalSourceModel: data.finalSourceModel,
                finalSourcePhaseId: data.finalSourcePhaseId,
                followUpModel: data.followUpModel ?? turn.followUpModel,
                outcome: data.outcome,
                degradedReason: data.degradedReason,
                aggregateUsage: {
                    requestCount: data.requestCount,
                    inputTokens: data.inputTokens,
                    outputTokens: data.outputTokens,
                    cachedTokens: data.cachedTokens,
                    cacheWriteTokens: data.cacheWriteTokens,
                    totalNanoAiu: data.totalNanoAiu,
                },
                phaseCount: data.phaseCount,
                syntheticModel: data.syntheticModel ?? turn.syntheticModel,
            });
            break;
        }
        case "tool.execution_start":
            if (!data.toolCallId || !data.toolName) {
                return invalid(state, "missing_tool_identity", "tools");
            }
            state.tools.activeCalls.set(data.toolCallId, {
                name: data.toolName,
                fusionId: data.fusionId,
                phaseId: data.phaseId,
            });
            state.tools.byName[data.toolName] ??= { started: 0, completed: 0, failed: 0 };
            state.tools.byName[data.toolName].started += 1;
            incrementPhaseTool(state, data.fusionId, data.phaseId, "started");
            break;
        case "tool.execution_complete": {
            if (!data.toolCallId) return invalid(state, "missing_tool_identity", "tools");
            const active = state.tools.activeCalls.get(data.toolCallId);
            state.tools.activeCalls.delete(data.toolCallId);
            if (data.success) {
                state.tools.completedCount += 1;
            } else {
                state.tools.failedCount += 1;
            }
            if (active) {
                const counts = state.tools.byName[active.name];
                counts[data.success ? "completed" : "failed"] += 1;
                incrementPhaseTool(
                    state,
                    active.fusionId,
                    active.phaseId,
                    data.success ? "completed" : "failed",
                );
            }
            break;
        }
        default:
            return false;
    }

    trimTurns(state);
    touch(state);
    return true;
}

export function createPublicSnapshot(state) {
    return {
        schemaVersion: state.schemaVersion,
        connection: state.connection,
        session: { ...state.session },
        usage: structuredClone(state.usage),
        tools: {
            activeCount: state.tools.activeCalls.size,
            completedCount: state.tools.completedCount,
            failedCount: state.tools.failedCount,
            byName: structuredClone(state.tools.byName),
        },
        fusionTurns: state.fusionTurns.map((turn) => ({
            ...structuredClone(turn),
            phases: turn.phases.map((phase) => structuredClone(phase)),
        })),
        routingAttempts: state.routingAttempts.map((attempt) => ({ ...attempt })),
        errors: state.errors.map((error) => ({ ...error })),
    };
}

function requiredPhase(state, event) {
    const { fusionId, phaseId } = event.data ?? {};
    if (!fusionId || !phaseId) {
        invalid(state, "missing_phase_identity", "phases");
        return undefined;
    }
    const turn = getTurn(state, fusionId, event.timestamp);
    let phase = turn.phases.find((candidate) => candidate.phaseId === phaseId);
    if (!phase) {
        phase = {
            phaseId,
            status: "pending",
            toolCounts: { started: 0, completed: 0, failed: 0 },
        };
        turn.phases.push(phase);
    }
    return phase;
}

function phaseIdentity(data) {
    return {
        kind: data.phaseKind,
        role: data.role,
        scope: data.conversationScope,
        model: data.model,
        reasoningEffort: data.reasoningEffort,
    };
}

function getTurn(state, fusionId, timestamp) {
    let turn = state.fusionTurns.find((candidate) => candidate.fusionId === fusionId);
    if (!turn) {
        turn = {
            fusionId,
            status: "pending",
            startedAt: timestamp,
            phases: [],
            phasePlan: [],
            critics: [],
        };
        state.fusionTurns.push(turn);
    }
    return turn;
}

function incrementPhaseTool(state, fusionId, phaseId, field) {
    if (!fusionId || !phaseId) return;
    const turn = state.fusionTurns.find((candidate) => candidate.fusionId === fusionId);
    const phase = turn?.phases.find((candidate) => candidate.phaseId === phaseId);
    if (phase) phase.toolCounts[field] += 1;
}

function terminal(status) {
    return status === "succeeded" || status === "failed" || status === "completed";
}

function trimTurns(state) {
    while (state.fusionTurns.length > MAX_TURNS) {
        const completedIndex = state.fusionTurns.findIndex((turn) => terminal(turn.status));
        if (completedIndex === -1) {
            recordError(state, {
                code: "turn_limit_truncated",
                feature: "timeline",
                message: "The oldest active workflow was removed to keep diagnostics memory bounded.",
            });
            state.fusionTurns.shift();
            continue;
        }
        state.fusionTurns.splice(completedIndex, 1);
    }
    if (state.routingAttempts.length > MAX_TURNS) {
        state.routingAttempts.splice(0, state.routingAttempts.length - MAX_TURNS);
    }
}

function upsertRoutingAttempt(state, next) {
    const existing = state.routingAttempts.find((item) => item.attemptId === next.attemptId);
    if (existing) {
        Object.assign(existing, next);
    } else {
        state.routingAttempts.push(next);
    }
}

function removeLatestActiveRoutingAttempt(state) {
    const index = state.routingAttempts.findLastIndex((attempt) => attempt.status === "routing");
    if (index !== -1) state.routingAttempts.splice(index, 1);
}

function assignDefined(target, values) {
    for (const [key, value] of Object.entries(values)) {
        if (value !== undefined) target[key] = value;
    }
}

function seen(state, id) {
    if (state.processedIds.has(id)) return true;
    state.processedIds.add(id);
    state.processedIdQueue.push(id);
    while (state.processedIdQueue.length > MAX_EVENT_IDS) {
        state.processedIds.delete(state.processedIdQueue.shift());
    }
    return false;
}

function invalid(state, code, feature) {
    recordError(state, {
        code,
        feature,
        message: "A diagnostics event was missing required metadata.",
    });
    touch(state);
    return true;
}

function recordError(state, error) {
    if (!error?.code || state.errors.some((item) => item.code === error.code)) return;
    state.errors.push({
        code: error.code,
        feature: error.feature ?? "unknown",
        message: error.message ?? "Diagnostics data is partially unavailable.",
    });
}

function touch(state) {
    state.session.lastUpdatedAt = new Date().toISOString();
}
