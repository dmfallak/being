import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

export type Message = { role: 'user' | 'assistant'; content: string };

export async function generateResponse(
  systemPrompt: string,
  messages: Message[],
): Promise<string> {
  const { text } = await generateText({
    model: google('gemini-2.0-flash'),
    system: systemPrompt,
    messages,
  });
  return text;
}
