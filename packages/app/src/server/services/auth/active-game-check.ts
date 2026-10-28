/**
 * Answers whether a user is in the middle of a game right now (login-logout Q4: the logout
 * confirmation). Games do not exist yet, so nobody is; the games feature (#21/#22) replaces
 * the implementation. Not the same as `HasActiveGame` (G5), which asks about a game that
 * was running before a session expired.
 */
export class ActiveGameCheck {
  async hasActiveGame(userId: string): Promise<boolean> {
    void userId;
    return false;
  }
}
