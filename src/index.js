import { BrowserClient } from "./browser/browser-client.js";
import { Explorer } from "./agents/explorer.js";
import { Subject } from "./agents/subject.js";
import { Translator } from "./agents/translator.js";
import { Reporter } from "./agents/reporter.js";
import { MessageQueue } from "./agents/message-queue.js";
import { applyEnvOverrides, loadTestConfig, parseCliArgs } from "./config.js";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const options = parseCliArgs();
const config = await loadTestConfig(options.config);
// Must run before agents are constructed, since they read process.env.
applyEnvOverrides(config.env);

const messageQueue = new MessageQueue();
let reporter = new Reporter({ messageQueue });
let explorer = new Explorer({ messageQueue });
let subject = new Subject({ messageQueue });
let translator = new Translator({ messageQueue });

// Roles a bot can act on; everything else in the section is context only.
const INTERACTIVE_ROLES = [
    "button", "link", "textbox", "searchbox", "combobox", "listbox",
    "checkbox", "radio", "switch", "spinbutton", "slider", "tab", "menuitem",
];

async function runStep(client, { url, task }) {
    if (client.url !== url) await client.goto(url);
    let snapshot = await client.snapshot();
    let elements = await explorer.explore(task, snapshot);
    console.log("Sorted Elements: " + JSON.stringify(elements, null, 4));
    let collectedElements = INTERACTIVE_ROLES.flatMap((role) => elements[role] || [])
        .filter((element) => element.ref);
    console.log("Interactive elements: " + JSON.stringify(collectedElements, null, 4));
    let response = await subject.query(task, collectedElements);
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
}

let client;
const errors = [];
const suite = { name: config.name, config: config.path, steps: config.steps };

try {
    messageQueue.publish({ type: 'workflow.started', ...suite });
    client = await BrowserClient.open(config.steps[0].url, { headless: options.headless });
    for (const [index, step] of config.steps.entries()) {
        console.log(`\nStep ${index + 1}/${config.steps.length}: ${step.task} (${step.url})`);
        messageQueue.publish({ type: 'step.started', index, ...step });
        await runStep(client, step);
        messageQueue.publish({ type: 'step.completed', index, url: client.url });
    }
    console.log("All steps completed.");
} catch (error) {
    errors.push(error);
    messageQueue.publish({
        type: 'workflow.error',
        error: { name: error.name, message: error.message, stack: error.stack },
    });
} finally {
    try {
        const report = await reporter.finish({ directory: options.reports, task: suite });
        console.log("Agent report saved to: " + report.path);
    } catch (error) {
        errors.push(error);
    } finally {
        reporter.close();
    }
}

try {
    if (errors.length) throw new AggregateError(errors, 'Test run failed; inspect the reported errors.', {
        cause: errors[0],
    });
    if (!options.headless) {
        const terminal = createInterface({ input: stdin, output: stdout });
        try {
            await terminal.question("Press Enter to close the browser...");
        } finally {
            terminal.close();
        }
    }
} finally {
    if (client) await client.close();
}
