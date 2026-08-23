import { createAIClient } from 'nextjs-share-lib/ai';

/** Provider/model settings live in nextjs-share-lib; apiKey comes from this app env. */
export const geminiAi = createAIClient({
  apiKey: process.env.GEMINI_API_KEY ?? '',
  provider: 'gemini',
});
