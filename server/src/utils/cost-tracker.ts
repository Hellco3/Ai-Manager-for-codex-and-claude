import { type CostStats } from '@ai_manager/shared';

export class CostTracker {
  private stats: Map<string, CostStats> = new Map();

  addEntry(model: string, inputTokens: number, outputTokens: number, durationMs: number): CostStats {
    // Approximate pricing per 1M tokens
    const PRICING: Record<string, { input: number; output: number }> = {
      'claude-opus-4-8': { input: 15, output: 75 },
      'claude-sonnet-5': { input: 3, output: 15 },
      'claude-haiku-4-5': { input: 0.8, output: 4 },
    };

    const pricing = PRICING[model] ?? { input: 3, output: 15 };
    const costUSD = (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;

    const existing = this.stats.get(model);
    const updated: CostStats = {
      model,
      inputTokens: (existing?.inputTokens ?? 0) + inputTokens,
      outputTokens: (existing?.outputTokens ?? 0) + outputTokens,
      costUSD: (existing?.costUSD ?? 0) + costUSD,
      durationMs: (existing?.durationMs ?? 0) + durationMs,
    };

    this.stats.set(model, updated);
    return updated;
  }

  getAll(): CostStats[] {
    return Array.from(this.stats.values());
  }

  getTotalCost(): number {
    return this.getAll().reduce((sum, s) => sum + s.costUSD, 0);
  }

  getTotalDuration(): number {
    return this.getAll().reduce((sum, s) => sum + s.durationMs, 0);
  }

  reset(): void {
    this.stats.clear();
  }
}
