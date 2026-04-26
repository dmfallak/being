import { google } from '@ai-sdk/google';
import { generateText, stepCountIs } from 'ai';
import { alchemyTool } from './tools.js';
import { memoryTool } from './memoryTool.js';
import { webSearchTool } from './webSearchTool.js';

export type Message = { role: 'user' | 'assistant'; content: string };

export type GenerateOptions = {
  temperature?: number;
};

const MAX_TOOL_STEPS = 8;

function formatToolCall(name: string, args: Record<string, unknown>): string {
  if (name === 'memory') {
    const cmdArgs = args.args as string[] | undefined;
    return `memory: ${cmdArgs?.join(' ') ?? ''}`;
  }
  const argStr = Object.entries(args)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(' ');
  return `${name}${argStr ? `: ${argStr.slice(0, 80)}` : ''}`;
}

function formatToolResult(name: string, result: Record<string, unknown>): string {
  if (result.error) return `error: ${result.error}`;
  if (name === 'alchemy') {
    const exit = result.exitCode as number | undefined;
    const out = (result.stdout as string | undefined)?.trim().slice(0, 80);
    return exit === 0 ? (out || 'ok') : `exit ${exit}`;
  }
  if (name === 'web') {
    if (Array.isArray(result.results)) return `${(result.results as unknown[]).length} results`;
  }
  if (name === 'memory') {
    if (Array.isArray(result.results)) return `${(result.results as unknown[]).length} results`;
    if (result.found === false) return 'not found';
    if (result.found === true) {
      const descs = result.descriptors as unknown[] | undefined;
      const rels = result.relations as unknown[] | undefined;
      return `found (${descs?.length ?? 0} descriptors, ${rels?.length ?? 0} relations)`;
    }
  }
  return 'ok';
}

export async function generateResponse(
  systemPrompt: string,
  messages: Message[],
  options?: GenerateOptions,
): Promise<string> {
  const args: Parameters<typeof generateText>[0] = {
    model: google('gemini-3-flash-preview'),
    system: systemPrompt,
    messages,
    tools: { alchemy: alchemyTool, memory: memoryTool, web: webSearchTool },
    maxSteps: MAX_TOOL_STEPS,
    stopWhen: stepCountIs(MAX_TOOL_STEPS),
    onStepFinish: ({ toolCalls, toolResults }) => {
      for (const call of toolCalls) {
        const label = formatToolCall(call.toolName, call.input as Record<string, unknown>);
        const result = toolResults.find(r => r.toolCallId === call.toolCallId);
        const resultStr = result
          ? ` → ${formatToolResult(call.toolName, result.output as Record<string, unknown>)}`
          : '';
        process.stdout.write(`  [${label}${resultStr}]\n`);
      }
    },
  };
  if (options?.temperature !== undefined) {
    args.temperature = options.temperature;
  }
  const { text, steps } = await generateText(args);
  if (text) return text;
  // Model exhausted steps via tool calls without producing a text turn — find the last step that has text.
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i]!.text) return steps[i]!.text;
  }
  return '(I lost the thread — please try again.)';
}
