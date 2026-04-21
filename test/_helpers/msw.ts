import { setupServer } from "msw/node";

export { http, HttpResponse } from "msw";

/** Global MSW server. Tests should call `server.listen()` / `close()` / `resetHandlers()`. */
export const server = setupServer();
