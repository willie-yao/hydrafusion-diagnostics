const $ = (selector) => document.querySelector(selector);
const number = new Intl.NumberFormat();
let source;

async function start() {
    try {
        render(await fetch("./api/state", { cache: "no-store" }).then(requireOk).then((r) => r.json()));
    } catch {
        setConnection("disconnected");
    }
    connect();
}

function connect() {
    source?.close();
    source = new EventSource("./api/events");
    source.addEventListener("snapshot", (event) => render(JSON.parse(event.data)));
    source.onopen = () => {};
    source.onerror = () => setConnection("disconnected");
}

function requireOk(response) {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
}

function render(state) {
    setConnection(state.connection);
    renderSession(state.session);
    renderMetrics(state.usage);
    renderTurns(state.fusionTurns ?? [], state.routingAttempts ?? []);
    renderTools(state.tools ?? {});
    renderErrors(state.errors ?? []);
}

function setConnection(status) {
    const labels = {
        ready: "Live",
        loading: "Loading",
        stopped: "Stopped",
        degraded: "Partial data",
        disconnected: "Disconnected",
    };
    $("#connection-label").textContent = labels[status] ?? "Unknown";
    $("#connection-dot").className = `status-dot ${labels[status] ? status : ""}`;
}

function renderSession(session = {}) {
    const values = [
        ["Selected model", session.selectedModel],
        ["Reasoning", session.reasoningEffort],
        ["Context tier", session.contextTier],
        ["Auto tier", session.autoTier],
    ];
    $("#session-grid").replaceChildren(
        ...values.map(([label, value]) => {
            const wrapper = document.createElement("div");
            const term = document.createElement("dt");
            const detail = document.createElement("dd");
            term.textContent = label;
            detail.textContent = value || "Not reported";
            wrapper.append(term, detail);
            return wrapper;
        }),
    );
}

function renderMetrics(usage = {}) {
    const totalInput = sumModels(usage.models, "inputTokens");
    const totalOutput = sumModels(usage.models, "outputTokens");
    const cards = [
        ["Requests", format(usage.totalRequests)],
        ["Input tokens", format(totalInput)],
        ["Output tokens", format(totalOutput)],
        ["API time", duration(usage.totalApiDurationMs)],
        ["Premium cost", decimal(usage.premiumRequestCost)],
        ["nano-AIU", format(usage.totalNanoAiu)],
    ];
    $("#metric-cards").replaceChildren(...cards.map(metric));

    const models = Object.entries(usage.models ?? {}).sort(
        ([, a], [, b]) => (b.requestCount ?? 0) - (a.requestCount ?? 0),
    );
    $("#model-metrics").replaceChildren(
        ...models.map(([modelId, item]) => {
            const row = document.createElement("tr");
            for (const value of [
                modelId,
                format(item.requestCount),
                format(item.inputTokens),
                format(item.outputTokens),
                format(item.cacheReadTokens),
                format(item.totalNanoAiu),
            ]) {
                const cell = document.createElement("td");
                cell.textContent = value;
                row.append(cell);
            }
            return row;
        }),
    );
}

function renderTurns(turns, routingAttempts) {
    const ordered = [...turns].sort(
        (left, right) => Date.parse(right.startedAt ?? 0) - Date.parse(left.startedAt ?? 0),
    );
    const total = turns.length + routingAttempts.length;
    $("#turn-count").textContent = `${total} ${total === 1 ? "entry" : "entries"}`;
    $("#empty-state").hidden = total > 0;
    $("#turns").replaceChildren(
        ...routingAttempts.map(routingAttemptView),
        ...ordered.map(turnView),
    );
}

function turnView(turn) {
    const article = document.createElement("article");
    article.className = "turn";

    const header = document.createElement("div");
    header.className = "turn-header";
    const title = document.createElement("h3");
    title.textContent = titleCase(turn.pattern || "Hydrafusion turn");
    header.append(title, badge(turn.status));

    const meta = metadata([
        ["Primary", turn.primaryModel],
        ["Final", turn.finalSourceModel],
        ["Fallback", turn.fallbackModel],
        ["Route", duration(turn.routingLatencyMs)],
        ["Total", duration(turn.durationMs)],
        ["nano-AIU", format(turn.aggregateUsage?.totalNanoAiu)],
    ]);

    const phases = document.createElement("div");
    phases.className = "phases";
    const observed = phasesForDisplay(turn);
    phases.replaceChildren(
        ...(observed.length
            ? observed.map(phaseView)
            : [muted("No completed phase metadata was reported.")]),
    );

    article.append(header, meta, phases);
    return article;
}

function phasesForDisplay(turn) {
    return mergePhasePlan(turn.phasePlan, turn.phases, turn.status);
}

function routingAttemptView(attempt) {
    const article = document.createElement("article");
    article.className = "turn";
    const header = document.createElement("div");
    header.className = "turn-header";
    const title = document.createElement("h3");
    title.textContent = attempt.status === "failed" ? "Routing fallback" : "Routing";
    header.append(title, badge(attempt.status));
    article.append(
        header,
        metadata([
            ["Policy", attempt.policy],
            ["Fallback", attempt.fallbackModel],
            ["Reason", attempt.degradedReason],
            ["Route", duration(attempt.routingLatencyMs)],
        ]),
    );
    return article;
}

function phaseView(phase) {
    const item = document.createElement("div");
    item.className = "phase";
    const header = document.createElement("div");
    header.className = "phase-header";
    const title = document.createElement("strong");
    title.textContent = titleCase(phase.role || phase.kind || "Phase");
    header.append(title, badge(phase.status));
    item.append(
        header,
        metadata([
            ["Model", phase.model],
            ["Scope", phase.scope],
            ["Reasoning", phase.reasoningEffort],
            ["Duration", duration(phase.durationMs)],
            ["Input", format(phase.usage?.inputTokens)],
            ["Output", format(phase.usage?.outputTokens)],
            ["nano-AIU", format(phase.usage?.totalNanoAiu)],
        ]),
    );
    return item;
}

function renderTools(tools) {
    $("#tool-summary").replaceChildren(
        ...[
            ["Active", format(tools.activeCount)],
            ["Completed", format(tools.completedCount)],
            ["Failed", format(tools.failedCount)],
        ].map(metric),
    );
    $("#tool-list").replaceChildren(
        ...Object.entries(tools.byName ?? {})
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, counts]) => {
                const chip = document.createElement("span");
                chip.className = "tool-chip";
                chip.textContent = `${name}: ${format((counts.completed ?? 0) + (counts.failed ?? 0))}`;
                return chip;
            }),
    );
}

function renderErrors(errors) {
    $("#errors").replaceChildren(
        ...errors.map((item) => {
            const message = document.createElement("div");
            message.className = "error";
            message.textContent = item.message;
            return message;
        }),
    );
}

function metric([label, value]) {
    const item = document.createElement("div");
    item.className = "metric";
    const labelNode = document.createElement("div");
    const valueNode = document.createElement("div");
    labelNode.className = "metric-label";
    valueNode.className = "metric-value";
    labelNode.textContent = label;
    valueNode.textContent = value;
    item.append(labelNode, valueNode);
    return item;
}

function badge(status = "unknown") {
    const node = document.createElement("span");
    node.className = `badge ${status}`;
    node.textContent = titleCase(status);
    return node;
}

function metadata(entries) {
    const node = document.createElement("div");
    node.className = "turn-meta";
    for (const [label, value] of entries) {
        if (value === undefined || value === null || value === "0 ms") continue;
        const item = document.createElement("span");
        item.textContent = `${label}: ${value}`;
        node.append(item);
    }
    return node;
}

function muted(text) {
    const node = document.createElement("span");
    node.className = "muted";
    node.textContent = text;
    return node;
}

function format(value) {
    return number.format(Number.isFinite(value) ? value : 0);
}

function decimal(value) {
    return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function duration(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return undefined;
    if (ms < 1000) return `${Math.round(ms)} ms`;
    return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}

function sumModels(models = {}, field) {
    return Object.values(models).reduce((total, item) => total + (item?.[field] ?? 0), 0);
}

function titleCase(value) {
    return String(value)
        .replaceAll("_", " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

void start();
import { mergePhasePlan } from "./phase-plan.js";
