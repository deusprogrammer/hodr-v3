import OpenAI from 'openai';

export class Agent {
  prompt = 'Say hello.';
  model = 'gpt-4.1-mini';

  constructor({ apiKey = process.env.OPENAI_API_KEY } = {}) {
    this.client = new OpenAI({ apiKey });
    this.response = this.run();
  }

  async run() {
    const response = await this.client.responses.create({
      model: this.model,
      input: this.prompt,
    });
    return response.output_text;
  }
}
