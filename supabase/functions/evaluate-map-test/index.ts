import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
serve((_req) => new Response(JSON.stringify({ ok: true, time: Date.now() }), {
  headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
}));
