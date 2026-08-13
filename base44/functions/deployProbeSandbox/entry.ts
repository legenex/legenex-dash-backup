// Throwaway: does a function directory created purely from the sandbox shell
// (rather than through the MCP write path) actually get deployed?
Deno.serve(async (_req) => Response.json({ created_via: 'run_command', ok: true }));
