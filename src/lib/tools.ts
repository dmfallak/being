import { tool } from 'ai';
import { z } from 'zod';
import { spawnSync } from 'node:child_process';

const ALCHEMIST_ROOT = process.env.ALCHEMIST_ROOT ?? '/alchemist';
const ALCHEMIST_CLI = `${ALCHEMIST_ROOT}/src/cli/index.ts`;
const ALCHEMY_TIMEOUT_MS = 30_000;

export const alchemyTool = tool({
  description: `Run the alchemy lab-notebook CLI. This is your interface to the lab: plan experiments, record measurements, log insights, navigate reasoning history, and search the corpus. The lab persists across sessions.

Pass argv as an array of strings. Use ["--help"] or ["<subcommand>", "--help"] to discover the surface. Add "--json" before the subcommand for machine-readable output. Examples:
- ["list", "experiments"] — list active experiments
- ["show", "EXP-001"] — view an experiment (auto-routes by EXP-/TSK-/INS-/LOG- prefix)
- ["--json", "list", "tasks"]
- ["plan", "EXP", "short-slug", "--hypothesis=..."] — start an experiment
- ["measure", "EXP-001", "--key=...", "--value=..."] — record a measurement
- ["search", "query text"]`,
  inputSchema: z.object({
    args: z.array(z.string()).describe('Argv passed to the alchemy binary'),
  }),
  execute: async ({ args }) => {
    const result = spawnSync('npx', ['tsx', ALCHEMIST_CLI, ...args], {
      encoding: 'utf8',
      timeout: ALCHEMY_TIMEOUT_MS,
      cwd: ALCHEMIST_ROOT,
    });
    return {
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      exitCode: result.status,
    };
  },
});
