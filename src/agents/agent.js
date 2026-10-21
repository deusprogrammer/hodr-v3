import 'dotenv/config';
import OpenAI from 'openai';
import { randomUUID } from 'node:crypto';
import { agentMessageQueue } from './message-queue.js';

export const DEFAULT_MODEL = 'qwen3-8B';

export class Agent {
  static modelEnvVar = null;

  messages = [];

  constructor({
    apiKey = process.env.OPENAI_API_KEY,
    systemPrompt = '',
    messageQueue = agentMessageQueue,
  } = {}) {
    this.messageQueue = messageQueue;
    this.agentId = randomUUID();
    this.systemPrompt = systemPrompt;
    const envVar = this.constructor.modelEnvVar;
    this.model = (envVar && process.env[envVar]) || DEFAULT_MODEL;
    const thinking = process.env.THINKING;
    if (thinking !== undefined && thinking !== 'true' && thinking !== 'false') {
      throw new Error('THINKING must be "true" or "false".');
    }
    this.thinking = thinking === undefined ? undefined : thinking === 'true';
    this.client = new OpenAI({ apiKey });
  }

  async run(input) {
    this.messages = [{ role: 'user', content: input }];
    return this.#respond();
  }

  async continue(input) {
    this.messages.push({ role: 'user', content: input });
    return this.#respond();
  }

  async #respond() {
    const request = {
      model: this.model,
      ...(this.thinking === undefined ? {} : {
        reasoning: { effort: this.thinking ? 'medium' : 'none' },
      }),
      input: [
        { role: 'system', content: this.systemPrompt },
        ...this.messages,
      ],
    };
    const requestId = randomUUID();
    const metadata = {
      agent: this.constructor.name,
      agentId: this.agentId,
      requestId,
      model: this.model,
      reasoning: request.reasoning,
    };
    this.messageQueue.publish({ ...metadata, type: 'agent.input', input: request.input });
    const started = Date.now();
    let response;
    try {
      response = await this.client.responses.create(request);
    } catch (error) {
      this.messageQueue.publish({
        ...metadata,
        type: 'agent.error',
        durationMs: Date.now() - started,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      });
      throw error;
    }
    this.messageQueue.publish({
      ...metadata,
      type: 'agent.output',
      output: response.output_text,
      durationMs: Date.now() - started,
      usage: response.usage,
    });
    return response.output_text;
  }
}
