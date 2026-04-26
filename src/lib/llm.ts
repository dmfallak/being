import { google } from '@ai-sdk/google';
import { generateText, stepCountIs } from 'ai';
import { alchemyTool } from './tools.js';
import { memoryTool } from './memoryTool.js';

export type Message = { role: 'user' | 'assistant'; content: string };

export type GenerateOptions = {
  temperature?: number;
};

const MAX_TOOL_STEPS = 8;

export async function generateResponse(
  systemPrompt: string,
  messages: Message[],
  options?: GenerateOptions,
): Promise<string> {
  const args: Parameters<typeof generateText>[0] = {
    model: google('gemini-3-flash-preview'),
    system: systemPrompt,
    messages,
    tools: { alchemy: alchemyTool, memory: memoryTool },
    maxSteps: MAX_TOOL_STEPS,
    stopWhen: stepCountIs(MAX_TOOL_STEPS),
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
