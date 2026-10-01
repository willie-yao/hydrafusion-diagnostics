export function resolvedEvent(overrides = {}) {
    return {
        id: overrides.id ?? "resolved-1",
        timestamp: "2026-10-01T12:00:00.000Z",
        type: "session.fusion_resolved",
        data: {
            fusionId: "fusion-1",
            turnId: "turn-1",
            pattern: "critique",
            policy: "balanced",
            primaryModel: "model-a",
            secondaryModel: "model-b",
            fallbackModel: "model-c",
            followUpModel: "model-a",
            phasePlan: [
                { conditional: false, kind: "draft", role: "draft", scope: "root" },
                { conditional: false, kind: "critic", role: "critic", scope: "review" },
                { conditional: false, kind: "revision", role: "revision", scope: "root" },
            ],
            ...overrides.data,
        },
    };
}

export function phaseEvent(type, overrides = {}) {
    return {
        id: overrides.id ?? `${type}-1`,
        timestamp: overrides.timestamp ?? "2026-10-01T12:00:01.000Z",
        type,
        data: {
            fusionId: "fusion-1",
            phaseId: "phase-1",
            phaseKind: "draft",
            role: "draft",
            conversationScope: "root",
            model: "model-a",
            reasoningEffort: "high",
            status: "succeeded",
            durationMs: 1200,
            usage: {
                cachedTokens: 10,
                inputTokens: 100,
                outputTokens: 50,
                requestCount: 1,
                totalNanoAiu: 300,
            },
            ...overrides.data,
        },
    };
}

export function completedEvent(overrides = {}) {
    return {
        id: overrides.id ?? "completed-1",
        timestamp: "2026-10-01T12:00:03.000Z",
        type: "session.fusion_completed",
        data: {
            fusionId: "fusion-1",
            turnId: "turn-1",
            pattern: "critique",
            outcome: "succeeded",
            durationMs: 3000,
            finalSourceModel: "model-a",
            finalSourcePhaseId: "phase-1",
            followUpModel: "model-a",
            requestCount: 3,
            inputTokens: 300,
            outputTokens: 100,
            cachedTokens: 20,
            totalNanoAiu: 900,
            phaseCount: 3,
            syntheticModel: "hydrafusion",
            ...overrides.data,
        },
    };
}

