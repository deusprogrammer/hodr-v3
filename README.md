# hodr-v3

A multi-agent browser bot that reads a web page's **accessibility tree** and uses small
local language models (e.g. Qwen 3 8B served by Ollama) to carry out plain-English tasks
such as "Add a Reading lamp to the cart." The bot never sees pixels or raw HTML; it works
only from roles, names, and refs that Playwright exposes through the accessibility tree.

The repository also contains [`test-site/`](test-site/), an accessible React + Vite site
built as a playground for the bot.

## Requirements

- Node.js 20+ (developed on Node 24)
- An OpenAI-compatible model server (Ollama, vLLM, LM Studio, …) that supports the
  Responses API
- Playwright's Chromium: `npx playwright install chromium`

## Setup

```sh
npm install
cp .env.example .env   # then fill in the values

# In another terminal, start the test site on http://localhost:5173
cd test-site && npm install && npm run dev
```

### Environment variables

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | API key for the model server (any non-empty value for Ollama) |
| `OPENAI_BASE_URL` | Base URL of the OpenAI-compatible server, e.g. `http://localhost:11434/v1` |
| `EXPLORER_MODEL`, `SUBJECT_MODEL`, `TRANSLATOR_MODEL`, `FILTER_MODEL`, `PLANNER_MODEL`, `PROCTOR_MODEL` | Per-agent model overrides; default is `qwen3-8B` |

Any of these can also be set in a test config's `env` object, which overrides `.env` and
the shell environment.

## Running tests

Test suites are JSON files in [`tests/`](tests/). Run one with:

```sh
npm start -- --config tests/shop-and-tasks.json
```

| Option | Default | Description |
| --- | --- | --- |
| `--config <path>` | `tests/profile.json` | Test config to run |
| `--reports <dir>` | `reports` | Directory where the run report is written |
| `--headless` | off | Run without a visible browser window and exit when finished |

Without `--headless`, the browser stays open after the run so you can visually check the
result; press Enter in the terminal to close it. The process exits non-zero if any step
fails.

### Test config format

```json
{
    "name": "Help page support request",
    "env": {
        "SUBJECT_MODEL": "qwen3:8b"
    },
    "steps": [
        {
            "url": "http://localhost:5173/help.html",
            "task": "Send a support request with the support topic 'Accessibility', the reply email 'jordan@example.com', and the support message 'The cart buttons are hard to find with a screen reader.'"
        }
    ]
}
```

- `name` (optional): label for the suite in reports.
- `env` (optional): overrides for the environment variables above. Unknown keys are
  rejected.
- `steps` (required): tasks run in order in a **single browser session**, so state such as
  a cart or a form carries over between steps. The bot only navigates when a step's `url`
  differs from the current page.

Configs are validated with Zod ([`src/config.js`](src/config.js)) before anything runs.

**Writing good tasks:** small models fill in anything you leave vague. Name fields by their
visible label and give exact values ("the support topic 'Accessibility'") rather than
describing intent ("about accessibility"), or the model may skip a field or invent text.

Pass conditions are not implemented yet; a suite that "completes" ran without errors,
which does not prove the page ended up in the right state. Check the report or watch
the headful browser.

## How it works

Each step runs this pipeline ([`src/index.js`](src/index.js)):

```
page ──snapshot──▶ Explorer ──section──▶ interactive elements ──▶ Subject ──prose──▶ Translator ──commands──▶ BrowserClient
```

1. **Snapshot.** [`BrowserClient`](src/browser/browser-client.js) loads the page, waits
   for network activity to settle, and captures the accessibility tree with
   `page.ariaSnapshotJSON({ mode: 'ai' })`. Every node has a `role`, an accessible
   `name`, and a `ref` (e.g. `e31`) that is valid for that snapshot only.
2. **Explorer** ([`src/agents/explorer.js`](src/agents/explorer.js)) builds an outline of
   the page's headings and asks the model which heading's section is relevant to the
   task. It then collects every node that belongs to that heading, by document order,
   and groups them by role with only `ref`, `name`, and `text`.
3. **Interactive filter.** The runner keeps only actionable roles (button, link, textbox,
   searchbox, combobox, listbox, checkbox, radio, switch, spinbutton, slider, tab,
   menuitem) that have a ref. This keeps the prompt small without relying on a model to
   pick roles. The older model-based `Filter` agent sometimes dropped required roles such
   as `combobox`, so it is no longer part of the pipeline.
4. **Subject** ([`src/agents/subject.js`](src/agents/subject.js)) role-plays a user: given
   the task and the elements, it describes in prose what it would do, citing refs
   ("I select combobox e29 and choose 'Accessibility', type … into textbox e31 …").
5. **Translator** ([`src/agents/translator.js`](src/agents/translator.js)) turns that prose
   into JSON instructions that contain only an `operation`, a `ref`, and any value. It
   then fills in each command's `role` and `name` itself from the element map. The model
   never writes names or roles, which avoids hallucinated targets. Unknown,
   duplicated, local-only, or ambiguous refs are rejected.
6. **Execute.** `BrowserClient.runCommands()` validates the commands against the Zod
   schema in [`src/browser/commands.js`](src/browser/commands.js) and performs them with
   `page.getByRole(role, { name, exact: true })`.

### Supported commands

| Operation | Roles | Notes |
| --- | --- | --- |
| `click` | any | |
| `type` | textbox, searchbox, spinbutton | Fills the field with `value` |
| `clear` | textbox, searchbox, spinbutton | |
| `check` | checkbox, radio | `value: true` to check, `false` to uncheck |
| `select` | combobox, listbox | `value` plus `by: "label"` or `by: "value"` |
| `press` | any | Keyboard key, e.g. `Enter` |
| `focus`, `hover` | any | |
| `upload` | any (file input, located by label) | Absolute paths only, and only inside `allowedUploadPaths` |

### Agents

All agents extend [`Agent`](src/agents/agent.js), which wraps the OpenAI Responses API.
Each agent supplies a system prompt that is prepended to every request. `run()` starts a
fresh conversation and `continue()` appends to the existing one. Each agent reads its
model from its `*_MODEL` environment variable when it is constructed.

`Planner` and `Proctor` exist for future multi-step planning and verification but are
not wired into the runner yet.

### Message queue and reports

Every agent publishes `agent.input`, `agent.output`, and `agent.error` events (model,
duration, token usage) to a shared
[`MessageQueue`](src/agents/message-queue.js). The runner adds workflow events
(`workflow.started`, `step.started`, `browser.commands`, `step.completed`,
`workflow.error`). The [`Reporter`](src/agents/reporter.js) subscribes to the queue and,
at the end of a run, writes a Markdown transcript to
`<reports>/run-<timestamp>-<uuid>.md`. That file is the first place to look when a step
fails or does the wrong thing. Reports are git-ignored.

## The test site

[`test-site/`](test-site/) is a standalone Vite + React app with a range of accessible
controls whose state actually changes:

- **Main page:** profile form, preferences (radios, checkboxes, a slider), workshop
  booking with a conditional field, a shop with search, filter, sort, and cart, a task
  checklist, and counters plus a confirmation dialog.
- **Help page** (`help.html`): FAQ disclosures and a support request form, reachable
  through a link from the main page.

[`test-site/public/bot-tasks.txt`](test-site/public/bot-tasks.txt) lists about 40 example
tasks you can turn into test configs.

## Other scripts

| Command | Description |
| --- | --- |
| `npm run dump -- <url>` | Print a page's accessibility tree as YAML |

## Project layout

```
src/
  index.js              test runner / pipeline orchestration
  config.js             CLI parsing and test-config loading
  agents/               Agent base class, Explorer, Subject, Translator, Filter,
                        Planner, Proctor, MessageQueue, Reporter
  browser/              BrowserClient (Playwright) and the command schema
  examples/             standalone scripts
tests/                  JSON test suites
test-site/              React + Vite playground site
```
