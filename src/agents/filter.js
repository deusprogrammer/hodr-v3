import { Agent } from './agent.js';

export class Filter extends Agent {
  static modelEnvVar = 'FILTER_MODEL';

  constructor(options = {}) {
    super({ ...options, systemPrompt: `
  You are a bot that crawls the accessibility tree of a webpage.
  You will be provided with a step of a task and a list of available HTML element roles and you will identify one or more that could likely be used to perform that action.
  If the task involves creation, modification, filtering, or searching of data, it will likely utilize various form element roles like textfield, searchbox, button, etc.
  If nothing suits the task respond with "none".  Otherwise respond with a comma separated list of roles.
  ` });
  }

  async filterRoles(planningTask, roleList) {
    let res = await this.run(`TASK: ${planningTask}\nROLES: ${JSON.stringify(roleList)}`);
    
    if (!res || res === 'none') {
      return [];
    }

    return res.split(",");
  }
}
