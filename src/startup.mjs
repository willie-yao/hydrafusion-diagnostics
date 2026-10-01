const outcomeTypes = new Set([
    "session.fusion_route_failed",
    "session.fusion_resolved",
    "assistant.fusion_phase_completed",
    "assistant.fusion_phase_failed",
    "session.fusion_completed",
]);

export function mergeInitializationEvents(history, live) {
    const seen = new Set();
    return [...history, ...live]
        .filter((event) => {
            if (!event?.id) return true;
            if (seen.has(event.id)) return false;
            seen.add(event.id);
            return true;
        })
        .map((event, index) => ({ event, index }))
        .sort((left, right) => {
            const timeDifference = timestamp(left.event) - timestamp(right.event);
            if (timeDifference !== 0) return timeDifference;
            const priorityDifference = priority(left.event) - priority(right.event);
            return priorityDifference !== 0 ? priorityDifference : left.index - right.index;
        })
        .map(({ event }) => event);
}

function timestamp(event) {
    const value = Date.parse(event?.timestamp ?? "");
    return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function priority(event) {
    if (event?.type === "session.fusion_route_started") return 0;
    if (outcomeTypes.has(event?.type)) return 2;
    return 1;
}
