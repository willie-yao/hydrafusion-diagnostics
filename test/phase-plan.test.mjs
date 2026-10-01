import assert from "node:assert/strict";
import test from "node:test";

import { mergePhasePlan } from "../ui/phase-plan.js";

test("preserves repeated critic phases exactly once", () => {
    const critics = [
        { phaseId: "critic-1", kind: "critic", role: "critic", model: "model-b" },
        { phaseId: "critic-2", kind: "critic", role: "critic", model: "model-c" },
    ];
    const result = mergePhasePlan(
        [{ conditional: false, kind: "critic", role: "critic", scope: "review" }],
        critics,
        "completed",
    );
    assert.deepEqual(result.map((phase) => phase.phaseId), ["critic-1", "critic-2"]);
});

test("renders unexecuted conditional phases as not needed", () => {
    const result = mergePhasePlan(
        [{ conditional: true, kind: "repair", role: "solver", scope: "root" }],
        [],
        "completed",
    );
    assert.equal(result[0].status, "not_needed");
});
