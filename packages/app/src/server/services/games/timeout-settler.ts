/**
 * Port to the lazy "lost on time" settlement of #23. `settleFor(userId)` finalizes the
 * user's `active` games whose clock ran out, so that BR-13 checks see a free slot (#21 Q17).
 */
export interface TimeoutSettler {
  settleFor(userId: string): Promise<void>;
}

/** Placeholder until #23 delivers the clock: games have no deadline yet, nothing to settle. */
export class NoopTimeoutSettler implements TimeoutSettler {
  async settleFor(userId: string): Promise<void> {
    // The parameter is the contract the real implementation keeps.
    void userId;
  }
}
