Deno.serve(async (_req) => {
  return Response.json({ status: 'ok' }, { status: 200 });
});