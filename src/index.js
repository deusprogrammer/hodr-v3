import { BrowserClient } from "./browser/browser-client.js";
import { Explorer } from "./agents/explorer.js";
import { Filter } from "./agents/filter.js";
import { Subject } from "./agents/subject.js";
import { Translator } from "./agents/translator.js";
import { Reporter } from "./agents/reporter.js";
import { MessageQueue } from "./agents/message-queue.js";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const PLANNER_TASK = "Create a profile for Alex Morgan and submit it.";

// Create agents
const messageQueue = new MessageQueue();
let reporter = new Reporter({ messageQueue });
let explorer = new Explorer({ messageQueue });
let filter = new Filter({ messageQueue });
let subject = new Subject({ messageQueue });
let translator = new Translator({ messageQueue });

// Create a browser client
let client;
const errors = [];

try {
    messageQueue.publish({ type: 'workflow.started', task: PLANNER_TASK });
    client = await BrowserClient.open("http://localhost:5173/", { headless: false });
    // Get snapshot of page and traverse it
    let snapshot = await client.snapshot();
    let elements = await explorer.explore(PLANNER_TASK, snapshot);
    console.log("Sorted Elements: " + JSON.stringify(elements, null, 4));
    let filteredRoles = await filter.filterRoles(PLANNER_TASK, Object.keys(elements));
    console.log("Filtered roles: " + filteredRoles);
    let collectedElements = [];
    filteredRoles.forEach((role) => {
        collectedElements = [...collectedElements, ...(elements[role] || [])];
    });
    console.log("Filtered elements: " + JSON.stringify(collectedElements, null, 4));
    let response = await subject.query(PLANNER_TASK, collectedElements);
    console.log("Response: " + response);
    let instructions = await translator.translate(response, collectedElements);
    console.log("Instructions: " + JSON.stringify(instructions));

    messageQueue.publish({ type: 'browser.commands', commands: instructions });
    await client.runCommands(instructions);
    messageQueue.publish({
        type: 'browser.completed',
        url: client.url,
        snapshot: client.tree,
    });
    console.log("Commands completed. Inspect the browser to validate the result.");
} catch (error) {
    errors.push(error);
    messageQueue.publish({
        type: 'workflow.error',
        error: { name: error.name, message: error.message, stack: error.stack },
    });
} finally {
    try {
        const report = await reporter.finish({ task: PLANNER_TASK });
        console.log("Agent report saved to: " + report.path);
    } catch (error) {
        errors.push(error);
    } finally {
        reporter.close();
    }
}

try {
    if (errors.length) throw new AggregateError(errors, 'Demo failed; inspect the reported errors.', {
        cause: errors[0],
    });
    const terminal = createInterface({ input: stdin, output: stdout });
    try {
        await terminal.question("Press Enter to close the browser...");
    } finally {
        terminal.close();
    }
} finally {
    if (client) await client.close();
}