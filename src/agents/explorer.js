import { Agent } from './agent.js';

export class Explorer extends Agent {
  static modelEnvVar = 'EXPLORER_MODEL';

  constructor(options = {}) {
    super({ ...options, systemPrompt: `
  You are a bot that crawls the accessibility tree of a webpage.
  You will be provided with a planner step and the header tree of a webpage.  Please select the header you feel would most likely contain what you need to complete the provided task.
  Please just make a best guess.
  Please respond with the ref field of the header you choose.  If you cannot find anything, return the terminal value 'none'.
  ` });
  }

  /**
   * Returns [heading root, flattened node map] for a snapshot or node.
   * Heading entries contain only name, ref, and subheadings.
   * Heading levels determine the outline, independent of container nesting.
   * Map keys prefixed with "local:" are traversal IDs, not browser refs.
   */
  getHeadingTree(snapshot) {
    const rootHeading = { name: 'root', ref: 'root', subheadings: [] };
    const headingStack = [{ level: 0, heading: rootHeading }];
    const flattenedSnapshot = {};
    let localId = 0;

    const visit = (node, parentElement = 'root') => {
      if (typeof node === 'string') {
        flattenedSnapshot[`local:${localId++}`] = {
          role: 'text',
          text: node,
          parentRef: parentElement,
          headingRef: headingStack[headingStack.length - 1].heading.ref,
        };
        return;
      }

      if (node.role === 'heading') {
        if (!Number.isInteger(node.level) || node.level < 1) {
          throw new TypeError('Heading nodes must have a positive integer level.');
        }

        const heading = { name: node.name, ref: node.ref, subheadings: [] };
        while (headingStack.length > 1 &&
          headingStack[headingStack.length - 1].level >= node.level) {
          headingStack.pop();
        }

        headingStack[headingStack.length - 1].heading.subheadings.push(heading);
        headingStack.push({ level: node.level, heading });
      }

      let nodeCopy = { ...node };
      delete nodeCopy.children;
      const key = node.ref ?? `local:${localId++}`;
      flattenedSnapshot[key] = {
        ...nodeCopy,
        parentRef: parentElement,
        headingRef: headingStack[headingStack.length - 1].heading.ref,
      };
      node.children?.forEach((child) => { visit(child, key) });
    }

    (Array.isArray(snapshot) ? snapshot : [snapshot]).forEach((child) => { visit(child) });
    return [rootHeading, flattenedSnapshot];
  }

  async explore(planningTask, snapshot) {
    const [rootHeading, flattenedSnapshot] = this.getHeadingTree(snapshot);
    const headingRef = (await this.run(`TASK: ${planningTask}\nHEADING TREE: ${JSON.stringify(rootHeading)}`)).trim();
    
    console.log("Returned ref:    " + headingRef);
    console.log("Header selected: " + JSON.stringify(flattenedSnapshot[headingRef], null, 4));

    if (headingRef === 'none') {
      throw new Error("Unable to find a node");
    }
    
    const filteredContent = Object.values(flattenedSnapshot)
      .filter((node) => node.headingRef === headingRef)
      .reduce((groups, { ref, name, text, role }) => {
        (groups[role] ??= []).push({ ref, name, text, role });
        return groups;
      }, Object.create(null));

    return filteredContent;
  }
}
