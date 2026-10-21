import { Agent } from './agent.js';

export class Subject extends Agent {
  static modelEnvVar = 'SUBJECT_MODEL';

  constructor(options = {}) {
    super({ ...options, systemPrompt: `
  You are a user of a website.
  You will be provided with a planner step and a JSON object containing a reduced selection of webpage controls with ref values another agent has decided would prove helpful in this task.
  You need to respond with what you would do with one or many of these elements to complete the task.
  For example "I click on textbox e26, type 'Dog', and then click on button e56"
  ` });
  }

  async query(plannerTask, elementSelection) {
    return await this.run(`TASK: ${plannerTask}\nELEMENTS: ${JSON.stringify(elementSelection)}`);
  }
}
