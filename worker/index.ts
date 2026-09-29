import type { Env } from "./env";
import { app } from "./app";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return app.fetch(request, env, ctx);
    }
    // static assets + SPA fallback handled by the ASSETS binding
    return env.ASSETS.fetch(request);
  },
};
