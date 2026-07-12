import { afterAll, afterEach, beforeAll } from "vitest";
import { _setEmbeddingModelOverride } from "../convex/memory/_libs/embedding";
import { mockEmbeddingModel } from "./_helpers/embedding";
import { server } from "./_helpers/msw";

// Start MSW once per test process. Individual tests that want strict unhandled
// behavior should call `server.use(...)` in their own `beforeEach`.
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// The `memory` trigger (M3-T02) schedules an embedding action on *every*
// content write, so any suite that writes a memory would otherwise reach for
// the real OpenAI provider and fail on a missing `OPENAI_EMBEDDING_KEY`.
// Default every suite to a deterministic fake; suites that specifically test
// embedding behaviour override it themselves.
//
// Installed at module scope, not in `beforeAll`, and deliberately never torn
// down: suites that don't drain the scheduler leave `runAfter(0)` jobs to fire
// on real timers *after* the test body finishes. An `afterAll` that cleared
// the override would hand those late jobs the real resolver, and they'd fail
// on the missing key — noisy errors from a test that already passed.
_setEmbeddingModelOverride(mockEmbeddingModel());
