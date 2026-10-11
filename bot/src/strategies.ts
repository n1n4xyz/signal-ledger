import Anthropic from "@anthropic-ai/sdk";

export type Direction = 1 | -1;
export type StrategyName = "trend" | "fade" | "claude";

/** The agents are deliberately simple. The product is the honest track record, not the alpha. */
export const STRATEGIES: Record<StrategyName, { description: string; decide: (closes: number[]) => Promise<Direction> }> = {
  trend: {
    description: "Follows the last 15 minutes: long if price went up, short if it went down.",
    decide: async (c) => (c[c.length - 1] >= c[Math.max(0, c.length - 16)] ? 1 : -1),
  },
  fade: {
    description: "Bets against the last 5 minutes: short after a rise, long after a drop.",
    decide: async (c) => (c[c.length - 1] >= c[Math.max(0, c.length - 6)] ? -1 : 1),
  },
  claude: {
    description: "Asks Claude to read the last 30 one-minute closes and call the next 15 minutes.",
    decide: askClaude,
  },
};

async function askClaude(closes: number[]): Promise<Direction> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set, skip the claude agent");
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: process.env.CLAUDE_MODEL ?? "claude-haiku-5-5",
    max_tokens: 100,
    messages: [
      {
        role: "user",
        content:
          `Here are the last ${closes.length} one-minute closing prices of ${process.env.ASSET ?? "ETH-USD"}, oldest first:\n` +
          closes.map((p) => p.toFixed(2)).join(", ") +
          `\n\nWill the price be higher or lower in ${Math.round(Number(process.env.HORIZON_SECONDS ?? 900) / 60)} minutes? ` +
          `Answer with exactly one word: long or short.`,
      },
    ],
  });
  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").toLowerCase();
  if (text.includes("long")) return 1;
  if (text.includes("short")) return -1;
  throw new Error(`Unclear answer from Claude: ${text}`);
}
