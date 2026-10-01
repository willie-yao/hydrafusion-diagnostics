function envelope(event, data) {
    return {
        id: typeof event.id === "string" ? event.id : undefined,
        timestamp: typeof event.timestamp === "string" ? event.timestamp : undefined,
        type: event.type,
        data,
    };
}

function usage(data = {}) {
    return {
        cachedTokens: number(data.cachedTokens),
        cacheWriteTokens: number(data.cacheWriteTokens),
        inputTokens: number(data.inputTokens),
        outputTokens: number(data.outputTokens),
        requestCount: number(data.requestCount),
        totalNanoAiu: number(data.totalNanoAiu),
    };
}

function number(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function optionalNumber(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalString(value) {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

function strings(value) {
    return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

export function projectSessionEvent(event) {
    if (!event || typeof event !== "object" || typeof event.type !== "string") {
        return undefined;
    }

    const data = event.data ?? {};
    switch (event.type) {
        case "session.model_change":
            return envelope(event, {
                modelId: optionalString(data.newModel),
                reasoningEffort: optionalString(data.reasoningEffort),
                contextTier: optionalString(data.contextTier),
                autoTier: optionalString(data.autoTier),
            });
        case "session.fusion_route_started":
            return envelope(event, {
                attemptId: optionalString(data.attemptId),
                policy: optionalString(data.policy),
                syntheticModel: optionalString(data.syntheticModel),
                turnKind: optionalString(data.turnKind),
            });
        case "session.fusion_route_failed":
            return envelope(event, {
                attemptId: optionalString(data.attemptId),
                fallbackModel: optionalString(data.fallbackModel),
                policy: optionalString(data.policy),
                reason: optionalString(data.reason),
                routingLatencyMs: optionalNumber(data.routingLatencyMs),
                syntheticModel: optionalString(data.syntheticModel),
            });
        case "session.fusion_resolved":
            return envelope(event, {
                contractVersion: optionalNumber(data.contractVersion),
                critics: Array.isArray(data.critics)
                    ? data.critics.map((critic) => ({
                          model: optionalString(critic?.model),
                          phaseId: optionalString(critic?.phaseId),
                          reasoningEffort: optionalString(critic?.reasoningEffort),
                      }))
                    : [],
                fallbackModel: optionalString(data.fallbackModel),
                followUpModel: optionalString(data.followUpModel),
                fusionId: optionalString(data.fusionId),
                judgeModel: optionalString(data.judgeModel),
                modelUniverseVersion: optionalString(data.modelUniverseVersion),
                pattern: optionalString(data.pattern),
                phasePlan: Array.isArray(data.phasePlan)
                    ? data.phasePlan.map((phase) => ({
                          conditional: phase?.conditional === true,
                          kind: optionalString(phase?.kind),
                          role: optionalString(phase?.role),
                          scope: optionalString(phase?.scope),
                      }))
                    : [],
                planVersion: optionalString(data.planVersion),
                policy: optionalString(data.policy),
                policyVersion: optionalString(data.policyVersion),
                primaryModel: optionalString(data.primaryModel),
                repairModel: optionalString(data.repairModel),
                routeSource: optionalString(data.routeSource),
                routingLatencyMs: optionalNumber(data.routingLatencyMs),
                ruleId: optionalString(data.ruleId),
                ruleIndex: optionalNumber(data.ruleIndex),
                ruleName: optionalString(data.ruleName),
                scores: data.scores
                    ? {
                          codeGen: optionalNumber(data.scores.codeGen),
                          debugging: optionalNumber(data.scores.debugging),
                          reasoning: optionalNumber(data.scores.reasoning),
                          toolUse: optionalNumber(data.scores.toolUse),
                      }
                    : undefined,
                secondaryModel: optionalString(data.secondaryModel),
                syntheticModel: optionalString(data.syntheticModel),
                turnId: optionalString(data.turnId),
            });
        case "assistant.fusion_phase_started":
            return envelope(event, {
                conversationScope: optionalString(data.conversationScope),
                fusionId: optionalString(data.fusionId),
                model: optionalString(data.model),
                pattern: optionalString(data.pattern),
                phaseId: optionalString(data.phaseId),
                phaseKind: optionalString(data.phaseKind),
                reasoningEffort: optionalString(data.reasoningEffort),
                role: optionalString(data.role),
            });
        case "assistant.fusion_phase_activity":
            return envelope(event, {
                activity: optionalString(data.activity),
                conversationScope: optionalString(data.conversationScope),
                fusionId: optionalString(data.fusionId),
                pattern: optionalString(data.pattern),
                phaseId: optionalString(data.phaseId),
                phaseKind: optionalString(data.phaseKind),
                role: optionalString(data.role),
            });
        case "assistant.fusion_phase_completed":
            return envelope(event, {
                conversationScope: optionalString(data.conversationScope),
                durationMs: number(data.durationMs),
                fusionId: optionalString(data.fusionId),
                model: optionalString(data.model),
                phaseId: optionalString(data.phaseId),
                phaseKind: optionalString(data.phaseKind),
                reasoningEffort: optionalString(data.reasoningEffort),
                role: optionalString(data.role),
                status: optionalString(data.status),
                usage: usage(data.usage),
            });
        case "assistant.fusion_phase_failed":
            return envelope(event, {
                conversationScope: optionalString(data.conversationScope),
                degradedToPhaseId: optionalString(data.degradedToPhaseId),
                durationMs: number(data.durationMs),
                fusionId: optionalString(data.fusionId),
                model: optionalString(data.model),
                phaseId: optionalString(data.phaseId),
                phaseKind: optionalString(data.phaseKind),
                reason: optionalString(data.reason),
                reasoningEffort: optionalString(data.reasoningEffort),
                role: optionalString(data.role),
                status: optionalString(data.status),
                usage: usage(data.usage),
            });
        case "session.fusion_completed":
            return envelope(event, {
                cachedTokens: number(data.cachedTokens),
                cacheWriteTokens: number(data.cacheWriteTokens),
                degradedReason: optionalString(data.degradedReason),
                durationMs: number(data.durationMs),
                finalSourceModel: optionalString(data.finalSourceModel),
                finalSourcePhaseId: optionalString(data.finalSourcePhaseId),
                followUpModel: optionalString(data.followUpModel),
                fusionId: optionalString(data.fusionId),
                inputTokens: number(data.inputTokens),
                outcome: optionalString(data.outcome),
                outputTokens: number(data.outputTokens),
                pattern: optionalString(data.pattern),
                phaseCount: number(data.phaseCount),
                requestCount: number(data.requestCount),
                syntheticModel: optionalString(data.syntheticModel),
                totalNanoAiu: number(data.totalNanoAiu),
                turnId: optionalString(data.turnId),
            });
        case "tool.execution_start":
            return envelope(event, {
                fusionId: optionalString(data.fusion?.fusionId),
                phaseId: optionalString(data.fusion?.phaseId),
                toolCallId: optionalString(data.toolCallId),
                toolName: optionalString(data.toolName),
            });
        case "tool.execution_complete":
            return envelope(event, {
                fusionId: optionalString(data.fusion?.fusionId),
                phaseId: optionalString(data.fusion?.phaseId),
                success: data.success === true,
                toolCallId: optionalString(data.toolCallId),
            });
        default:
            return undefined;
    }
}

export function projectCurrentModel(model = {}) {
    return {
        selectedModel: optionalString(model.modelId),
        reasoningEffort: optionalString(model.reasoningEffort),
        contextTier: optionalString(model.contextTier),
        autoTier: optionalString(model.autoTier),
    };
}

export function projectUsageMetrics(metrics = {}) {
    const models = {};
    for (const modelId of strings(Object.keys(metrics.modelMetrics ?? {}))) {
        const metric = metrics.modelMetrics[modelId] ?? {};
        models[modelId] = {
            requestCount: number(metric.requests?.count),
            premiumRequestCost: number(metric.requests?.cost),
            inputTokens: number(metric.usage?.inputTokens),
            outputTokens: number(metric.usage?.outputTokens),
            reasoningTokens: number(metric.usage?.reasoningTokens),
            cacheReadTokens: number(metric.usage?.cacheReadTokens),
            cacheWriteTokens: number(metric.usage?.cacheWriteTokens),
            totalNanoAiu: number(metric.totalNanoAiu),
        };
    }

    return {
        totalRequests: number(metrics.totalUserRequests),
        premiumRequestCost: number(metrics.totalPremiumRequestCost),
        totalApiDurationMs: number(metrics.totalApiDurationMs),
        totalNanoAiu: number(metrics.totalNanoAiu),
        lastCallInputTokens: number(metrics.lastCallInputTokens),
        lastCallOutputTokens: number(metrics.lastCallOutputTokens),
        models,
    };
}
