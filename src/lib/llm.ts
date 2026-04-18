import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

export type Message = { role: 'user' | 'assistant'; content: string };

export type GenerateOptions = {
  temperature?: number;
};

export async function generateResponse(
  systemPrompt: string,
  messages: Message[],
  options?: GenerateOptions,
): Promise<string> {
  const args: Parameters<typeof generateText>[0] = {
    model: google('gemini-3-flash-preview'),
    system: systemPrompt,
    messages,
  };
  if (options?.temperature !== undefined) {
    args.temperature = options.temperature;
  }
  const { text } = await generateText(args);
  return text;
}
