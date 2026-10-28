/**
 * Answers whether a user is in the middle of a game right now (login-logout Q4: the logout
 * confirmation). Stateless, so it is registered as a singleton. Games do not exist yet, so
 * nobody is; this is a stub until the games feature (#21/#22) replaces the implementation.
 * Not the same as the `hasActiveGame` function (G5), which asks about a game that was
 * running before a session expired.
 */
export class GameParticipation {
  async hasActiveGame(userId: string): Promise<boolean> {
    // The stub ignores the user; the parameter is the contract the real implementation keeps.
    void userId;
    return false;
  }
}
