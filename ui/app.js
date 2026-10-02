import { mergePhasePlan } from "./phase-plan.js";

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
    source.onerror = () => setConnection("disconnected");
}

function requireOk(response) {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
}

function render(state) {
    setConnection(state.connection);
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
    document.documentElement.dataset.connection = status;
}

function renderMetrics(usage = {}) {
    const totalInput = sumModels(usage.models, "inputTokens");
    const totalOutput = sumModels(usage.models, "outputTokens");
    const readings = [
        ["Requests", format(usage.totalRequests)],
        ["Input tokens", format(totalInput)],
        ["Output tokens", format(totalOutput)],
        ["API time", duration(usage.totalApiDurationMs) ?? "0 s"],
        ["Premium cost", decimal(usage.premiumRequestCost)],
        ["nano-AIU", format(usage.totalNanoAiu)],
    ];
    $("#metric-cards").replaceChildren(...readings.map(measurement));

    const models = Object.entries(usage.models ?? {}).sort(
        ([, a], [, b]) => (b.requestCount ?? 0) - (a.requestCount ?? 0),
    );
    if (!models.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.className = "table-empty";
        cell.colSpan = 6;
        cell.textContent = "No model usage reported yet.";
        row.append(cell);
        $("#model-metrics").replaceChildren(row);
        return;
    }
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
    const container = $("#turns");
    const uiState = captureTurnUiState(container);
    const entries = [
        ...turns.map((value) => ({ type: "turn", value })),
        ...routingAttempts.map((value) => ({ type: "attempt", value })),
    ].sort(compareEntries);
    const total = turns.length + routingAttempts.length;
    $("#turn-count").textContent = `${total} ${total === 1 ? "entry" : "entries"}`;
    $("#empty-state").hidden = total > 0;
    container.replaceChildren(
        ...entries.map((entry, index) => (
            entry.type === "turn"
                ? turnView(entry.value, index)
                : routingAttemptView(entry.value, index)
        )),
    );
    restoreTurnUiState(container, uiState);
}

function compareEntries(left, right) {
    const activeDifference = Number(isActiveEntry(right.value)) - Number(isActiveEntry(left.value));
    if (activeDifference) return activeDifference;
    return entryTime(right.value) - entryTime(left.value);
}

function isActiveEntry(entry) {
    return ["pending", "resolved", "routing", "running"].includes(entry.status);
}

function displayStatus(status) {
    if (status === "pending" || status === "resolved") return "running";
    return status || "pending";
}

function entryLabel(entry, featured) {
    if (featured && isActiveEntry(entry)) return "LIVE";
    const time = Date.parse(entry.startedAt ?? entry.completedAt ?? "");
    if (!Number.isFinite(time)) return "--:--";
    return new Date(time).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });
}

function modelChain(phases) {
    const models = [];
    for (const phase of phases) {
        if (phase.model && models.at(-1) !== phase.model) models.push(phase.model);
    }
    return models.join(" → ");
}

function entryTime(entry) {
    return Date.parse(entry.startedAt ?? entry.completedAt ?? 0);
}

function entryKey(type, entry) {
    return `${type}:${entry.startedAt ?? entry.completedAt ?? "unknown"}:${entry.pattern ?? entry.policy ?? ""}`;
}

function turnView(turn, index) {
    const featured = index === 0;
    const active = isActiveEntry(turn);
    const status = displayStatus(turn.status);
    const article = document.createElement(featured ? "article" : "details");
    article.className = `turn ${featured ? "turn--featured" : "turn--history"}`;
    article.dataset.entryKey = entryKey("turn", turn);

    const header = document.createElement(featured ? "div" : "summary");
    header.className = "turn__head";
    const titleGroup = document.createElement("div");
    titleGroup.className = "turn__title";
    const turnIndex = document.createElement("span");
    turnIndex.className = `turn__index${featured && active ? " turn__index--live" : ""}`;
    turnIndex.textContent = entryLabel(turn, featured);
    const title = document.createElement("h3");
    title.textContent = `${titleCase(turn.pattern || "Hydrafusion")} route`;
    titleGroup.append(turnIndex, title);
    const phases = phasesForDisplay(turn);
    header.append(titleGroup);
    if (!featured) {
        const chain = document.createElement("span");
        chain.className = "turn__chain";
        chain.textContent = modelChain(phases);
        header.append(chain);
    }
    header.append(statusLabel(status));

    const readings = metadata([
        ["policy", turn.policy],
        ["primary", turn.primaryModel],
        ["fallback", turn.fallbackModel],
        ["route", duration(turn.routingLatencyMs)],
        ["elapsed", duration(turn.durationMs)],
        ["requests", optionalFormat(turn.aggregateUsage?.requestCount)],
        ["nano-AIU", optionalFormat(turn.aggregateUsage?.totalNanoAiu)],
    ]);

    const path = document.createElement("div");
    path.className = "signal-path";
    path.tabIndex = 0;
    path.setAttribute("role", "region");
    path.setAttribute("aria-label", featured ? "Latest model route" : `Model route started ${turnIndex.textContent}`);
    let finalModel = turn.finalSourceModel;
    if (!finalModel) finalModel = active ? "Awaiting model" : "Not reported";
    let finalStatus = "pending";
    if (status === "completed" || status === "failed") finalStatus = status;
    path.replaceChildren(
        endpointView("Input", turn.syntheticModel || "hydrafusion", "completed"),
        ...(phases.length
            ? phases.map(phaseView)
            : [muted("Phase metadata has not been reported yet.")]),
        endpointView("Final output", finalModel, finalStatus),
    );
    path.dataset.activePhase = activeRouteNode(path)?.dataset.routeKey ?? "";

    if (featured) {
        article.append(header, readings, path);
    } else {
        const body = document.createElement("div");
        body.className = "turn__body";
        body.append(readings, path);
        article.append(header, body);
    }
    return article;
}

function centerActivePhase(path) {
    if (path.scrollWidth <= path.clientWidth) return;
    const active = activeRouteNode(path);
    if (!active) return;
    const offset = active.getBoundingClientRect().left - path.getBoundingClientRect().left + path.scrollLeft;
    path.scrollLeft = Math.max(0, offset - (path.clientWidth - active.offsetWidth) / 2);
    path.dataset.centeredPhase = path.dataset.activePhase;
}

function activeRouteNode(path) {
    return path.querySelector(".route-node.running") ?? path.querySelector(".route-node.failed");
}

function phasesForDisplay(turn) {
    return mergePhasePlan(turn.phasePlan, turn.phases, turn.status);
}

function routingAttemptView(attempt, index) {
    const featured = index === 0;
    const article = document.createElement(featured ? "article" : "details");
    article.className = `turn ${featured ? "turn--featured" : "turn--history"}`;
    article.dataset.entryKey = entryKey("attempt", attempt);
    const header = document.createElement(featured ? "div" : "summary");
    header.className = "turn__head";
    const titleGroup = document.createElement("div");
    titleGroup.className = "turn__title";
    const label = document.createElement("span");
    label.className = `turn__index${featured && isActiveEntry(attempt) ? " turn__index--live" : ""}`;
    label.textContent = entryLabel(attempt, featured);
    const title = document.createElement("h3");
    title.textContent = attempt.status === "failed" ? "Routing fallback" : "Selecting route";
    titleGroup.append(label, title);
    header.append(titleGroup);
    if (!featured && attempt.fallbackModel) {
        const chain = document.createElement("span");
        chain.className = "turn__chain";
        chain.textContent = attempt.fallbackModel;
        header.append(chain);
    }
    header.append(statusLabel(attempt.status));
    const readings = metadata([
        ["policy", attempt.policy],
        ["fallback", attempt.fallbackModel],
        ["reason", attempt.degradedReason],
        ["route", duration(attempt.routingLatencyMs)],
    ]);
    if (featured) {
        article.append(header, readings);
    } else {
        const body = document.createElement("div");
        body.className = "turn__body";
        body.append(readings);
        article.append(header, body);
    }
    return article;
}

function phaseView(phase) {
    const item = document.createElement("div");
    item.className = `route-node phase ${phase.status || "pending"}`;
    item.dataset.routeKey = `phase:${phase.role || phase.kind || "unknown"}:${phase.model || "pending"}`;
    const header = document.createElement("div");
    header.className = "phase__head";
    const role = document.createElement("span");
    role.className = "phase__role";
    role.textContent = titleCase(phase.role || phase.kind || "Phase");
    header.append(role, stateLamp(phase.status));

    const model = document.createElement("div");
    model.className = "phase__model";
    model.textContent = phase.model || "Model pending";

    item.append(
        header,
        model,
        phaseReadings([
            ["state", titleCase(phase.status || "pending")],
            ["time", duration(phase.durationMs)],
            ["reasoning", phase.reasoningEffort],
            ["in", format(phase.usage?.inputTokens)],
            ["out", format(phase.usage?.outputTokens)],
            ["scope", phase.scope],
            ["nano-AIU", format(phase.usage?.totalNanoAiu)],
        ]),
    );
    return item;
}

function endpointView(kind, model, status) {
    const item = document.createElement("div");
    item.className = `route-node route-endpoint ${status || "pending"}`;
    item.dataset.routeKey = `endpoint:${kind}:${model}`;
    const header = document.createElement("div");
    header.className = "route-endpoint__head";
    const label = document.createElement("span");
    label.className = "route-endpoint__kind";
    label.textContent = kind;
    header.append(label, stateLamp(status));
    const modelNode = document.createElement("div");
    modelNode.className = "route-endpoint__model";
    modelNode.textContent = model;
    item.append(header, modelNode);
    return item;
}

function captureTurnUiState(container) {
    const open = new Set(
        [...container.querySelectorAll("details[open][data-entry-key]")]
            .map((item) => item.dataset.entryKey),
    );
    const paths = new Map(
        [...container.querySelectorAll("[data-entry-key] .signal-path")]
            .map((path) => [
                path.closest("[data-entry-key]").dataset.entryKey,
                {
                    activePhase: path.dataset.activePhase,
                    centeredPhase: path.dataset.centeredPhase,
                    scrollLeft: path.scrollLeft,
                },
            ]),
    );
    const focusedTurn = document.activeElement?.closest?.("[data-entry-key]");
    let focus;
    if (focusedTurn) {
        focus = {
            entryKey: focusedTurn.dataset.entryKey,
            target: document.activeElement.matches("summary") ? "summary" : "path",
        };
    }
    return { focus, open, paths };
}

function restoreTurnUiState(container, state) {
    for (const item of container.querySelectorAll("details[data-entry-key]")) {
        item.open = state.open.has(item.dataset.entryKey);
    }
    for (const path of container.querySelectorAll("[data-entry-key] .signal-path")) {
        const key = path.closest("[data-entry-key]").dataset.entryKey;
        const previous = state.paths.get(key);
        if (
            previous?.activePhase === path.dataset.activePhase
            && previous.centeredPhase === path.dataset.activePhase
        ) {
            path.scrollLeft = previous.scrollLeft;
            path.dataset.centeredPhase = previous.centeredPhase;
        } else if (path.closest(".turn--featured")) {
            requestAnimationFrame(() => centerActivePhase(path));
        }
    }
    if (!state.focus) return;
    const turn = [...container.querySelectorAll("[data-entry-key]")]
        .find((item) => item.dataset.entryKey === state.focus.entryKey);
    const target = state.focus.target === "summary"
        ? turn?.querySelector("summary")
        : turn?.querySelector(".signal-path");
    target?.focus({ preventScroll: true });
}

function phaseReadings(entries) {
    const node = document.createElement("div");
    node.className = "phase-readings";
    for (const [label, value] of entries) {
        if (value === undefined || value === null || value === "0") continue;
        const labelNode = document.createElement("span");
        const valueNode = document.createElement("span");
        labelNode.textContent = label;
        valueNode.textContent = value;
        node.append(labelNode, valueNode);
    }
    return node;
}

function renderTools(tools) {
    $("#tool-summary").replaceChildren(
        ...[
            ["Active", format(tools.activeCount)],
            ["Completed", format(tools.completedCount)],
            ["Failed", format(tools.failedCount)],
        ].map(measurement),
    );
    $("#tool-list").replaceChildren(
        ...Object.entries(tools.byName ?? {})
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, counts]) => {
                const completed = counts.completed ?? 0;
                const failed = counts.failed ?? 0;
                const running = Math.max(0, (counts.started ?? 0) - completed - failed);
                const channel = document.createElement("div");
                channel.className = "tool-channel";
                const jack = document.createElement("span");
                let jackState = "";
                if (running) jackState = " running";
                else if (failed) jackState = " failed";
                jack.className = `tool-channel__jack${jackState}`;
                jack.setAttribute("aria-hidden", "true");
                const label = document.createElement("span");
                label.className = "tool-channel__name";
                label.textContent = name;
                const count = document.createElement("span");
                count.className = "tool-channel__count";
                const parts = [`${format(completed + failed)} done`];
                if (failed) parts.push(`${format(failed)} failed`);
                if (running) parts.push(`${format(running)} running`);
                count.textContent = parts.join(" · ");
                channel.append(jack, label, count);
                return channel;
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

function measurement([label, value]) {
    const item = document.createElement("div");
    item.className = "measurement";
    const labelNode = document.createElement("div");
    const valueNode = document.createElement("div");
    labelNode.className = "measurement__label";
    valueNode.className = "measurement__value";
    labelNode.textContent = label;
    valueNode.textContent = value;
    item.append(labelNode, valueNode);
    return item;
}

function statusLabel(status = "unknown") {
    const node = document.createElement("span");
    node.className = `status-label ${status}`;
    node.textContent = titleCase(status);
    return node;
}

function stateLamp(status = "unknown") {
    const node = document.createElement("span");
    node.className = `state-lamp ${status}`;
    node.setAttribute("aria-label", titleCase(status));
    return node;
}

function metadata(entries) {
    const node = document.createElement("div");
    node.className = "route-readings";
    for (const [label, value] of entries) {
        if (value === undefined || value === null || value === "0 ms") continue;
        const item = document.createElement("span");
        item.className = "reading-pair";
        const name = document.createElement("span");
        name.className = "reading-pair__label";
        const reading = document.createElement("strong");
        name.textContent = label;
        reading.textContent = value;
        item.append(name, reading);
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

function optionalFormat(value) {
    return Number.isFinite(value) ? number.format(value) : undefined;
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
