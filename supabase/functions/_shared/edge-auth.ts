import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export type EdgeActor = {
  user: any | null;
  userId: string | null;
  anonKey: string | null;
  isAuthenticated: boolean;
};

export function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function optionsResponse() {
  return new Response("ok", { headers: corsHeaders });
}

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) return null;
  return createClient(url, key);
}

function bearerToken(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? "";
}

async function sha256(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function requestIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";
  return forwarded.split(",")[0].trim() || "unknown";
}

export async function identifyActor(req: Request, options: { allowAnonymous?: boolean } = {}): Promise<EdgeActor | Response> {
  const supabase = serviceClient();
  const token = bearerToken(req);

  if (token && supabase) {
    const { data: { user }, error } = await createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      global: { headers: { Authorization: `Bearer ${token}` } },
    }).auth.getUser();

    if (!error && user) {
      return { user, userId: user.id, anonKey: null, isAuthenticated: true };
    }
  }

  if (!options.allowAnonymous) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const fingerprint = [requestIp(req), req.headers.get("user-agent") ?? "unknown"].join("|");
  return {
    user: null,
    userId: null,
    anonKey: await sha256(fingerprint),
    isAuthenticated: false,
  };
}

export async function enforceUsageLimit(
  actor: EdgeActor,
  functionName: string,
  limits: { authenticatedDaily: number; anonymousDaily?: number }
): Promise<Response | null> {
  const supabase = serviceClient();
  if (!supabase) {
    console.warn(`[${functionName}] Supabase service credentials missing; usage not recorded.`);
    return null;
  }

  const limit = actor.isAuthenticated ? limits.authenticatedDaily : (limits.anonymousDaily ?? 0);
  if (limit <= 0) return jsonResponse({ error: "Sign in required" }, 401);

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let query = supabase
    .from("edge_function_usage")
    .select("id", { count: "exact", head: true })
    .eq("function_name", functionName)
    .gte("created_at", since);

  query = actor.userId ? query.eq("user_id", actor.userId) : query.eq("anon_key", actor.anonKey);
  const { count, error: countError } = await query;

  if (countError) {
    console.error(`[${functionName}] usage count failed`, countError);
    return null;
  }

  if ((count ?? 0) >= limit) {
    await supabase.from("edge_function_usage").insert({
      function_name: functionName,
      user_id: actor.userId,
      anon_key: actor.anonKey,
      status: "blocked",
      metadata: { reason: "daily_limit", limit },
    });
    return jsonResponse({ error: "Daily usage limit reached. Please try again tomorrow." }, 429);
  }

  const { error: insertError } = await supabase.from("edge_function_usage").insert({
    function_name: functionName,
    user_id: actor.userId,
    anon_key: actor.anonKey,
    status: "allowed",
  });

  if (insertError) console.error(`[${functionName}] usage insert failed`, insertError);
  return null;
}
