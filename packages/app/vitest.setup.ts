import { vi } from "vitest";

// `server-only` throws outside the `react-server` export condition; unit tests import
// server modules directly, so it is stubbed for the whole package.
vi.mock("server-only", () => ({}));
