import { getDictionary } from "./dictionary";

export type BotChallenge = { answer: string; startTime: number; text: string };

export function createChallenge(locale: string): BotChallenge {
  const a = Math.floor(Math.random() * 12) + 1;
  const b = Math.floor(Math.random() * 12) + 1;
  return {
    answer: String(a + b),
    startTime: Date.now(),
    text: getDictionary(locale).storefront.botCheck.question.replace("{a}", String(a)).replace("{b}", String(b))
  };
}
