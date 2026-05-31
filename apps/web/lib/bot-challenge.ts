export type BotChallenge = { answer: string; startTime: number; text: string };

export function createChallenge(locale: string): BotChallenge {
  const a = Math.floor(Math.random() * 12) + 1;
  const b = Math.floor(Math.random() * 12) + 1;
  return {
    answer: String(a + b),
    startTime: Date.now(),
    text: locale === "de" ? `Was ist ${a} + ${b}?` : `What is ${a} + ${b}?`
  };
}
