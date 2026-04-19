import { tool } from 'ai';
import { z } from 'zod';
import { spawnSync } from 'node:child_process';

const ALCHEMIST_ROOT = process.env.ALCHEMIST_ROOT ?? '/alchemist';
const ALCHEMIST_CLI = `${ALCHEMIST_ROOT}/dist/cli/index.js`;
const ALCHEMY_TIMEOUT_MS = 30_000;

export const alchemyTool = tool({
  description: `Run the alchemy lab-notebook CLI. This is your interface to the lab: plan experiments, record measurements, log insights, navigate reasoning history, and search the corpus. The lab persists across sessions.

Pass argv as an array of strings. Always run ["<subcommand>", "--help"] first when unsure of the signature — example argv shown below can drift. Add "--json" before the subcommand for machine-readable output. Examples:
- ["list", "experiments"] — list active experiments
- ["show", "EXP-001"] — view a record (auto-routes by EXP-/TSK-/INS-/LOG- prefix)
- ["--json", "list", "tasks"]
- ["plan", "Measure embedding cache hit rate", "--hypothesis=..."] — title is a single string arg
- ["measure", "EXP-001", "hit_rate=0.82", "ratio"] — expId, then key=value, then optional unit
- ["note", "EXP-001", "observation text"] — free-form observation
- ["conclude", "EXP-001", "outcome text"]
- ["task", "Ask user for fridge temp", "--linked-exp=EXP-001"] — task tied to an experiment
- ["complete", "TSK-001", "--result=38 degF"] — close task with a finding; if the task has linked-exp, the result is also appended as an observation there
- ["search", "query text"]`,
  inputSchema: z.object({
    args: z.array(z.string()).describe('Argv passed to the alchemy binary'),
  }),
  execute: async ({ args }) => {
    const result = spawnSync('node', [ALCHEMIST_CLI, ...args], {
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
