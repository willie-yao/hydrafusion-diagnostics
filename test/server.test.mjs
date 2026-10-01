import assert from "node:assert/strict";
import test from "node:test";

import { createDiagnosticsServer } from "../src/server.mjs";

test("serves authorized state and rejects bad tokens and methods", async (t) => {
    let listener;
    const server = await createDiagnosticsServer({
        getSnapshot: () => ({ schemaVersion: 1, connection: "ready" }),
        subscribe: (candidate) => {
            listener = candidate;
            return () => {
                listener = undefined;
            };
        },
    });
    t.after(() => server.close());

    const state = await fetch(new URL("api/state", server.url));
    assert.equal(state.status, 200);
    assert.equal(state.headers.get("cache-control"), "no-store");
    assert.equal((await state.json()).connection, "ready");

    const base = new URL(server.url);
    const badToken = await fetch(`${base.origin}/bad/api/state`);
    assert.equal(badToken.status, 404);

    const method = await fetch(new URL("api/state", server.url), { method: "POST" });
    assert.equal(method.status, 405);

    assert.equal(typeof listener, "function");
});

test("streams snapshots over SSE and closes cleanly", async () => {
    let publish;
    const server = await createDiagnosticsServer({
        getSnapshot: () => ({ schemaVersion: 1, connection: "ready" }),
        subscribe: (candidate) => {
            publish = candidate;
            return () => {};
        },
    });

    const response = await fetch(new URL("api/events", server.url));
    const reader = response.body.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    assert.match(first, /event: snapshot/);
    assert.match(first, /"connection":"ready"/);

    publish({ schemaVersion: 1, connection: "stopped" });
    const second = new TextDecoder().decode((await reader.read()).value);
    assert.match(second, /"connection":"stopped"/);

    await reader.cancel();
    const url = server.url;
    await server.close();
    await assert.rejects(fetch(url));
});

