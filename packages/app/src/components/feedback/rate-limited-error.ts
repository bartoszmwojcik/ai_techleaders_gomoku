/** Title and details of the "too many attempts" message; the wait is rounded up to whole minutes. */
export function rateLimitedError(retryAfterSeconds: number | undefined): { title: string; details: string } {
  const minutes = retryAfterSeconds === undefined ? undefined : Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return {
    title: "Zbyt wiele prób",
    details: minutes === undefined ? "Spróbuj ponownie za jakiś czas." : `Spróbuj ponownie za ${minutes} min.`,
  };
}
