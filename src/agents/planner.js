import { Agent } from './agent.js';

export class Planner extends Agent {
  static modelEnvVar = 'PLANNER_MODEL';

  prompt = '';
}
