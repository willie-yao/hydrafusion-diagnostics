export function mergePhasePlan(plan = [], observed = [], turnStatus) {
    const remaining = [...observed];
    const result = plan.map((phase, index) => {
        const matchIndex = remaining.findIndex(
            (candidate) =>
                candidate.kind === phase.kind &&
                (!phase.role || !candidate.role || candidate.role === phase.role),
        );
        if (matchIndex !== -1) {
            return remaining.splice(matchIndex, 1)[0];
        }
        return {
            phaseId: `planned-${index}`,
            kind: phase.kind,
            role: phase.role,
            scope: phase.scope,
            status: phase.conditional && turnStatus === "completed" ? "not_needed" : "pending",
        };
    });
    return [...result, ...remaining];
}
