import { agentMessageQueue } from './agents/message-queue.js';

function tokenCounts(usage) {
  const input = usage?.input_tokens ?? usage?.prompt_tokens ?? 0;
  const output = usage?.output_tokens ?? usage?.completion_tokens ?? 0;
  return { input, output, total: usage?.total_tokens ?? input + output };
}

function emptyTotals() {
  return { calls: 0, modelMs: 0, usageMs: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, callsWithoutUsage: 0 };
}

function addCall(totals, event) {
  totals.calls += 1;
  totals.modelMs += event.durationMs ?? 0;
  if (!event.usage) {
    totals.callsWithoutUsage += 1;
    return;
  }
  totals.usageMs += event.durationMs ?? 0;
  const tokens = tokenCounts(event.usage);
  totals.inputTokens += tokens.input;
  totals.outputTokens += tokens.output;
  totals.totalTokens += tokens.total;
}

/**
 * Tokens per second of model time for calls that reported usage, so browser
 * time and failed calls do not dilute it.
 */
function withThroughput({ usageMs, ...totals }) {
  const seconds = usageMs / 1000;
  return {
    ...totals,
    outputTokensPerSecond: seconds ? totals.outputTokens / seconds : 0,
    totalTokensPerSecond: seconds ? totals.totalTokens / seconds : 0,
  };
}

/**
 * Collects per-step timing and token usage from the message queue.
 * Agent calls are attributed to whichever step was running when they finished.
 */
export class RunMetrics {
  #unsubscribe;
  #startedAt = null;
  #steps = [];
  #current = null;
  #agents = new Map();

  constructor({ messageQueue = agentMessageQueue } = {}) {
    this.#unsubscribe = messageQueue.subscribe((event) => this.#record(event));
  }

  #record(event) {
    const time = Date.parse(event.timestamp);
    switch (event.type) {
      case 'workflow.started':
        this.#startedAt = time;
        break;
      case 'step.started':
        this.#current = { index: event.index, task: event.task, startedAt: time, status: 'running', ...emptyTotals() };
        this.#steps.push(this.#current);
        break;
      case 'step.completed':
        if (this.#current) Object.assign(this.#current, { status: 'passed', endedAt: time });
        this.#current = null;
        break;
      case 'workflow.error':
        if (this.#current) Object.assign(this.#current, { status: 'failed', endedAt: time });
        this.#current = null;
        break;
      case 'agent.output':
      case 'agent.error': {
        if (this.#current) addCall(this.#current, event);
        if (!this.#agents.has(event.agent)) this.#agents.set(event.agent, emptyTotals());
        addCall(this.#agents.get(event.agent), event);
        break;
      }
    }
  }

  close() {
    this.#unsubscribe();
  }

  summary(endedAt = Date.now()) {
    const steps = this.#steps.map(({ startedAt, endedAt: stepEnd, ...step }) =>
      withThroughput({ ...step, durationMs: (stepEnd ?? endedAt) - startedAt }));
    const totals = emptyTotals();
    for (const agentTotals of this.#agents.values()) {
      for (const key of Object.keys(totals)) totals[key] += agentTotals[key];
    }
    return {
      durationMs: this.#startedAt === null ? 0 : endedAt - this.#startedAt,
      steps,
      agents: Object.fromEntries([...this.#agents].map(([name, value]) => [name, withThroughput(value)])),
      totals: withThroughput(totals),
    };
  }
}

const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;
const rate = (value) => `${value.toFixed(1)}/s`;
const count = (value) => value.toLocaleString('en-US');

function table(headers, rows) {
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => String(row[column]).length)));
  const line = (cells) => cells.map((cell, column) =>
    column === 0 ? String(cell).padEnd(widths[column]) : String(cell).padStart(widths[column])).join('  ');
  return [line(headers), widths.map((width) => '-'.repeat(width)).join('  '), ...rows.map(line)].join('\n');
}

export function formatMetrics(metrics) {
  const headers = ['Step', 'Status', 'Duration', 'Model time', 'Calls', 'In tokens', 'Out tokens', 'Total tokens', 'Out tok/s'];
  const row = (label, status, item) => [
    label, status, seconds(item.durationMs), seconds(item.modelMs), item.calls,
    count(item.inputTokens), count(item.outputTokens), count(item.totalTokens), rate(item.outputTokensPerSecond),
  ];
  const rows = metrics.steps.map((step) => row(`${step.index + 1}`, step.status, step));
  rows.push(row('Total', '', { ...metrics.totals, durationMs: metrics.durationMs }));

  const agentRows = Object.entries(metrics.agents).map(([name, agent]) => [
    name, agent.calls, seconds(agent.modelMs), count(agent.totalTokens), rate(agent.outputTokensPerSecond),
  ]);

  const lines = [
    table(headers, rows),
    '',
    table(['Agent', 'Calls', 'Model time', 'Total tokens', 'Out tok/s'], agentRows),
    '',
    `Total duration: ${seconds(metrics.durationMs)} (model time ${seconds(metrics.totals.modelMs)})`,
    `Tokens: ${count(metrics.totals.totalTokens)} total (${count(metrics.totals.inputTokens)} in, ${count(metrics.totals.outputTokens)} out)`,
    `Throughput: ${rate(metrics.totals.outputTokensPerSecond)} output tokens, ${rate(metrics.totals.totalTokensPerSecond)} total tokens (per second of model time)`,
  ];
  if (metrics.totals.callsWithoutUsage) {
    lines.push(`Note: ${metrics.totals.callsWithoutUsage} model call(s) returned no usage data; token counts are incomplete.`);
  }
  return lines.join('\n');
}
