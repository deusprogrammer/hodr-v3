import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';

export const DEFAULT_CONFIG_PATH = 'tests/profile.json';
export const DEFAULT_REPORTS_PATH = 'reports';

export const CLI_HELP = `Usage: node src/index.js [options]

Run a JSON test suite using the browser agents.
With no arguments, display this help without running tests.

Options:
  -h, --help        Show this help and exit
  --config <path>   Test config JSON (default: ${DEFAULT_CONFIG_PATH})
  --reports <dir>   Report output directory (default: ${DEFAULT_REPORTS_PATH})
  --headless        Run without a browser window or the Enter prompt

Examples:
  node src/index.js --config tests/profile.json
  npm start -- --headless --config tests/shop-and-tasks.json --reports reports

Start the target website and configure the model server before running a suite.
`;

export const envSchema = z.strictObject({
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),
  EXPLORER_MODEL: z.string().optional(),
  FILTER_MODEL: z.string().optional(),
  PLANNER_MODEL: z.string().optional(),
  SUBJECT_MODEL: z.string().optional(),
  TRANSLATOR_MODEL: z.string().optional(),
  PROCTOR_MODEL: z.string().optional(),
});

export const stepSchema = z.strictObject({
  url: z.url(),
  task: z.string().trim().min(1),
});

export const testConfigSchema = z.strictObject({
  name: z.string().optional(),
  env: envSchema.default({}),
  steps: z.array(stepSchema).min(1),
});

export function parseCliArgs(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: {
      help: { type: 'boolean', short: 'h', default: args.length === 0 },
      headless: { type: 'boolean', default: false },
      config: { type: 'string', default: DEFAULT_CONFIG_PATH },
      reports: { type: 'string', default: DEFAULT_REPORTS_PATH },
    },
    strict: true,
  });
  return values;
}

export async function loadTestConfig(path) {
  const fullPath = resolve(path);
  let raw;
  try {
    raw = JSON.parse(await readFile(fullPath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read test config ${fullPath}: ${error.message}`, { cause: error });
  }
  const result = testConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid test config ${fullPath}:\n${z.prettifyError(result.error)}`);
  }
  return { ...result.data, path: fullPath };
}

/** Config values take precedence over existing environment variables. */
export function applyEnvOverrides(env, target = process.env) {
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) target[key] = value;
  }
}
