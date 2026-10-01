import { DURABLE_EVENT_TYPES, HISTORY_PAGE_SIZE, MAX_TURNS } from "./config.mjs";
import { projectSessionEvent } from "./sanitize.mjs";

export async function readFusionHistory(eventLog) {
    const pages = [];
    const fusionIds = new Set();
    let cursor;
    let complete = true;

    do {
        const page = await eventLog.read({
            cursor,
            direction: "backward",
            includeEphemeral: false,
            agentScope: "primary",
            max: HISTORY_PAGE_SIZE,
            types: DURABLE_EVENT_TYPES,
        });
        const projected = page.events.map(projectSessionEvent).filter(Boolean);
        pages.push(projected);
        cursor = page.cursor;

        for (const event of projected) {
            const fusionId = event?.data?.fusionId;
            if (typeof fusionId === "string") fusionIds.add(fusionId);
        }

        if (page.cursorStatus === "expired") {
            complete = false;
            break;
        }
        if (!page.hasMore || fusionIds.size >= MAX_TURNS) break;
    } while (true);

    return {
        complete,
        events: selectRecentTurns(pages.reverse().flat()),
    };
}

function selectRecentTurns(events) {
    const retainedIds = new Set();
    for (let index = events.length - 1; index >= 0; index -= 1) {
        const fusionId = events[index]?.data?.fusionId;
        if (!fusionId || retainedIds.has(fusionId)) continue;
        if (retainedIds.size === MAX_TURNS) break;
        retainedIds.add(fusionId);
    }
    return events.filter((event) => {
        const fusionId = event?.data?.fusionId;
        return !fusionId || retainedIds.has(fusionId);
    });
}
