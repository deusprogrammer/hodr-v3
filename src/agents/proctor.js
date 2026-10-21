import { Agent } from './agent.js';

export class Proctor extends Agent {
  static modelEnvVar = 'PROCTOR_MODEL';

  prompt = '';
}
