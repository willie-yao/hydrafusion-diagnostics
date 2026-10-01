import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

import { MAX_SSE_CLIENTS } from "./config.mjs";

const assets = new Map([
    ["/", ["../ui/index.html", "text/html; charset=utf-8"]],
    ["/assets/styles.css", ["../ui/styles.css", "text/css; charset=utf-8"]],
    ["/assets/app.js", ["../ui/app.js", "text/javascript; charset=utf-8"]],
    ["/assets/phase-plan.js", ["../ui/phase-plan.js", "text/javascript; charset=utf-8"]],
]);

export async function createDiagnosticsServer({ getSnapshot, subscribe }) {
    const token = randomBytes(32).toString("hex");
    const clients = new Set();
    let unsubscribe;
    let keepalive;
    let host;

    const server = createServer(async (request, response) => {
        try {
            if (request.headers.host !== host) {
                response.writeHead(421).end();
                return;
            }
            if (request.method !== "GET") {
                response.writeHead(405, { Allow: "GET" }).end();
                return;
            }

            const url = new URL(request.url ?? "/", `http://${host}`);
            const prefix = `/${token}`;
            if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) {
                response.writeHead(404).end();
                return;
            }

            const route = url.pathname.slice(prefix.length) || "/";
            setSecurityHeaders(response);

            if (route === "/api/state") {
                response.setHeader("Content-Type", "application/json; charset=utf-8");
                response.end(JSON.stringify(getSnapshot()));
                return;
            }

            if (route === "/api/events") {
                if (clients.size >= MAX_SSE_CLIENTS) {
                    response.writeHead(503).end();
                    return;
                }
                response.writeHead(200, {
                    "Content-Type": "text/event-stream; charset=utf-8",
                    Connection: "keep-alive",
                });
                response.write(`event: snapshot\ndata: ${JSON.stringify(getSnapshot())}\n\n`);
                clients.add(response);
                request.once("close", () => clients.delete(response));
                return;
            }

            const asset = assets.get(route);
            if (!asset) {
                response.writeHead(404).end();
                return;
            }
            const [relativePath, contentType] = asset;
            response.setHeader("Content-Type", contentType);
            response.end(await readFile(new URL(relativePath, import.meta.url)));
        } catch {
            if (!response.headersSent) response.writeHead(500);
            response.end();
        }
    });

    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address();
    if (!address || typeof address === "string") {
        await closeServer(server);
        throw new Error("Diagnostics server did not receive a TCP address.");
    }
    host = `127.0.0.1:${address.port}`;

    unsubscribe = subscribe((snapshot) => {
        const frame = `event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`;
        for (const client of clients) client.write(frame);
    });
    keepalive = setInterval(() => {
        for (const client of clients) client.write(": keepalive\n\n");
    }, 15_000);
    keepalive.unref();

    return {
        url: `http://${host}/${token}/`,
        async close() {
            clearInterval(keepalive);
            unsubscribe?.();
            for (const client of clients) client.end();
            clients.clear();
            await closeServer(server);
        },
    };
}

function setSecurityHeaders(response) {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
    );
}

function closeServer(server) {
    return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
    });
}
