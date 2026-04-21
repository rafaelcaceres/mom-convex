import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./_helpers/msw";

// Start MSW once per test process. Individual tests that want strict unhandled
// behavior should call `server.use(...)` in their own `beforeEach`.
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
