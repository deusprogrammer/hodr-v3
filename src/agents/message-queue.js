/**
 * In-process FIFO event delivery. Subscribers run synchronously; publish returns
 * after delivery, including events published by another subscriber.
 */
export class MessageQueue {
  #pending = [];
  #listeners = new Set();
  #delivering = false;
  #sequence = 0;

  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  publish(message) {
    const event = structuredClone({
      ...message,
      sequence: ++this.#sequence,
      timestamp: new Date().toISOString(),
    });
    this.#pending.push(event);
    if (this.#delivering) return;

    this.#delivering = true;
    try {
      while (this.#pending.length) {
        const next = this.#pending.shift();
        for (const listener of this.#listeners) listener(structuredClone(next));
      }
    } finally {
      this.#delivering = false;
    }
  }
}

export const agentMessageQueue = new MessageQueue();
