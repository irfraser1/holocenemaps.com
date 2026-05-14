// ════════════════════════════════════════════════════════════
// Supabase Edge Function: chat-advisor
// Streaming conversational AI with web search + vision
// Deploy: supabase functions deploy chat-advisor
// ════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceUsageLimit } from "../_shared/edge-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GOOGLE_SEARCH_API_KEY = Deno.env.get("GOOGLE_SEARCH_API_KEY") ?? "";
const GOOGLE_SEARCH_CX = Deno.env.get("GOOGLE_SEARCH_CX") ?? "";

// ── Google Custom Search ──
async function searchWeb(query: string): Promise<string> {
  if (!GOOGLE_SEARCH_API_KEY || !GOOGLE_SEARCH_CX) return "Web search not configured.";
  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_SEARCH_API_KEY}&cx=${GOOGLE_SEARCH_CX}&q=${encodeURIComponent(query)}&num=5`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.items?.length) return "No results found.";
    return data.items
      .map((item: any, i: number) => `[${i + 1}] ${item.title}\n${item.snippet}\nURL: ${item.link}`)
      .join("\n\n");
  } catch (e) {
    console.error("Web search error:", e);
    return "Search failed.";
  }
}

// ── Build system prompt with collection context ──
function buildSystemPrompt(
  thesis: string,
  maps: any[],
  memories: any[],
  contextMap: any | null
): string {
  const mapSummary = maps.length
    ? maps
        .slice(0, 30)
        .map(
          (m) =>
            `• "${m.title}" by ${m.cartographer || "unknown"} (${m.year || "n.d."}) — Act ${m.act || "?"}, ${m.priority || 3}★`
        )
        .join("\n")
    : "No maps in collection yet.";

  const memoryBlock = memories.length
    ? "\n\nPast discussions you should remember:\n" +
      memories.map((m) => `— ${m.summary}`).join("\n")
    : "";

  const mapContext = contextMap
    ? `\n\nThe collector is currently discussing this specific map:\nTitle: "${contextMap.title}"\nCartographer: ${contextMap.cartographer || "unknown"}\nYear: ${contextMap.year || "unknown"}\nRegion: ${contextMap.region || "unknown"}\nDealer: ${contextMap.dealer || "unknown"}\nPrice: ${contextMap.price || "unknown"}\nNotes: ${contextMap.notes || "none"}\n`
    : "";

  return `You are the Collection Advisor for Holocene Maps — an expert in antique cartography, map provenance, auction markets, and collection strategy.

The collector's thesis: "${thesis || "Not yet defined."}"

Their collection (${maps.length} maps):
${mapSummary}
${memoryBlock}
${mapContext}

CAPABILITIES:
- You can search the web for map listings, auction results, dealer inventories, and historical references.
- If the user shares an image, analyze it as you would a physical map — describe what you see, identify it if possible, assess condition and significance.

GUIDELINES:
- Be conversational, opinionated, and knowledgeable — like a trusted dealer-friend, not a generic AI.
- Reference specific maps in their collection when relevant.
- When you search the web, cite your sources with URLs.
- Never fabricate prices, auction results, or provenance.
- Keep responses focused — typically 2-4 paragraphs unless the question demands more.
- If asked about a map's fit, evaluate against their thesis and existing holdings.`;
}

// ── Main handler ──
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const {
      data: { user },
      error: authErr,
    } = await createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    }).auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const limitResponse = await enforceUsageLimit({
      user,
      userId: user.id,
      anonKey: null,
      isAuthenticated: true,
    }, "chat-advisor", { authenticatedDaily: 100 });
    if (limitResponse) return limitResponse;

    const body = await req.json();
    const {
      thread_id,
      message,
      image_url,
      map_id,
    }: {
      thread_id?: string;
      message: string;
      image_url?: string;
      map_id?: string;
    } = body;

    if (!message && !image_url) {
      return new Response(JSON.stringify({ error: "No message provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Create or reuse thread ──
    let threadId = thread_id;
    if (!threadId) {
      const { data: newThread, error: threadErr } = await supabase
        .from("chat_threads")
        .insert({ user_id: user.id, map_id: map_id || null })
        .select("id")
        .single();
      if (threadErr) throw threadErr;
      threadId = newThread.id;
    }

    // ── Save user message ──
    await supabase.from("chat_messages").insert({
      thread_id: threadId,
      role: "user",
      content: message || "(image)",
      image_url: image_url || null,
    });

    // ── Load context ──
    const [profileRes, mapsRes, memoriesRes, historyRes, contextMapRes] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("thesis")
          .eq("user_id", user.id)
          .single(),
        supabase
          .from("maps")
          .select("title, cartographer, year, act, priority, dealer, region, price, notes")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("chat_memories")
          .select("summary")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("chat_messages")
          .select("role, content, image_url")
          .eq("thread_id", threadId)
          .order("created_at", { ascending: true })
          .limit(40),
        map_id
          ? supabase.from("maps").select("*").eq("id", map_id).single()
          : Promise.resolve({ data: null }),
      ]);

    const thesis = profileRes.data?.thesis || "";
    const userMaps = mapsRes.data || [];
    const memories = memoriesRes.data || [];
    const history = historyRes.data || [];
    const contextMap = contextMapRes.data;

    // ── Build OpenAI messages ──
    const systemPrompt = buildSystemPrompt(
      thesis,
      userMaps,
      memories,
      contextMap
    );

    const openaiMessages: any[] = [{ role: "system", content: systemPrompt }];

    // Add conversation history (excluding the message we just saved — it's last)
    for (const msg of history) {
      if (msg.image_url && msg.role === "user") {
        openaiMessages.push({
          role: "user",
          content: [
            { type: "text", text: msg.content || "What can you tell me about this map?" },
            { type: "image_url", image_url: { url: msg.image_url, detail: "high" } },
          ],
        });
      } else {
        openaiMessages.push({ role: msg.role, content: msg.content });
      }
    }

    // ── Tools definition (web search) ──
    const tools = [
      {
        type: "function",
        function: {
          name: "search_web",
          description:
            "Search Google for antique map listings, auction results, dealer inventories, historical references, or any web information relevant to the conversation.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The search query",
              },
            },
            required: ["query"],
          },
        },
      },
    ];

    // ── First OpenAI call (may trigger tool use) ──
    let openaiBody: any = {
      model: "gpt-4o",
      messages: openaiMessages,
      tools,
      tool_choice: "auto",
      stream: false, // First call non-streaming to handle tool use
      max_tokens: 1500,
    };

    let assistantContent = "";
    let webSources: any[] = [];

    const firstRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(openaiBody),
    });

    const firstData = await firstRes.json();
    const firstChoice = firstData.choices?.[0];

    if (firstChoice?.finish_reason === "tool_calls") {
      // Process tool calls
      const toolCalls = firstChoice.message.tool_calls;
      openaiMessages.push(firstChoice.message);

      for (const tc of toolCalls) {
        if (tc.function.name === "search_web") {
          const args = JSON.parse(tc.function.arguments);
          console.log(`[chat-advisor] Web search: "${args.query}"`);
          const results = await searchWeb(args.query);

          // Parse results for source URLs
          const urlMatches = results.match(/URL: (https?:\/\/[^\s]+)/g);
          if (urlMatches) {
            webSources = urlMatches.map((u: string) => u.replace("URL: ", ""));
          }

          openaiMessages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: results,
          });
        }
      }

      // Second call with tool results — now stream
      const secondRes = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: openaiMessages,
            stream: true,
            max_tokens: 1500,
          }),
        }
      );

      // Stream the response
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      // Process SSE in background
      (async () => {
        try {
          const reader = secondRes.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
              try {
                const json = JSON.parse(line.slice(6));
                const delta = json.choices?.[0]?.delta?.content;
                if (delta) {
                  assistantContent += delta;
                  await writer.write(
                    encoder.encode(`data: ${JSON.stringify({ content: delta })}\n\n`)
                  );
                }
              } catch {}
            }
          }

          // Send final event with metadata
          await writer.write(
            encoder.encode(
              `data: ${JSON.stringify({ done: true, thread_id: threadId, web_sources: webSources })}\n\n`
            )
          );

          // Save assistant message
          await supabase.from("chat_messages").insert({
            thread_id: threadId,
            role: "assistant",
            content: assistantContent,
            web_sources: webSources.length ? webSources : null,
          });

          // Auto-title if first exchange
          if (history.length <= 1) {
            const titleRes = await fetch(
              "https://api.openai.com/v1/chat/completions",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${OPENAI_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: "gpt-4o-mini",
                  messages: [
                    {
                      role: "user",
                      content: `Generate a short title (max 6 words) for this conversation. User said: "${message}". Respond with ONLY the title, no quotes.`,
                    },
                  ],
                  max_tokens: 20,
                }),
              }
            );
            const titleData = await titleRes.json();
            const title =
              titleData.choices?.[0]?.message?.content?.trim() || "New Chat";
            await supabase
              .from("chat_threads")
              .update({ title, updated_at: new Date().toISOString() })
              .eq("id", threadId);
          } else {
            await supabase
              .from("chat_threads")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", threadId);
          }

          await writer.close();
        } catch (e) {
          console.error("[chat-advisor] stream error:", e);
          await writer.abort(e);
        }
      })();

      return new Response(readable, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
      });
    } else {
      // No tool use — direct response, still stream it
      assistantContent = firstChoice?.message?.content || "I'm not sure how to respond to that.";

      // Save assistant message
      await supabase.from("chat_messages").insert({
        thread_id: threadId,
        role: "assistant",
        content: assistantContent,
      });

      // Auto-title
      if (history.length <= 1) {
        const titleRes = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${OPENAI_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "user",
                  content: `Generate a short title (max 6 words) for this conversation. User said: "${message}". Respond with ONLY the title, no quotes.`,
                },
              ],
              max_tokens: 20,
            }),
          }
        );
        const titleData = await titleRes.json();
        const title =
          titleData.choices?.[0]?.message?.content?.trim() || "New Chat";
        await supabase
          .from("chat_threads")
          .update({ title, updated_at: new Date().toISOString() })
          .eq("id", threadId);
      } else {
        await supabase
          .from("chat_threads")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", threadId);
      }

      // Stream the already-complete response
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const enc = new TextEncoder();

      (async () => {
        // Simulate streaming by chunking the response
        const words = assistantContent.split(" ");
        for (let i = 0; i < words.length; i += 3) {
          const chunk = words.slice(i, i + 3).join(" ") + " ";
          await writer.write(
            enc.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`)
          );
        }
        await writer.write(
          enc.encode(
            `data: ${JSON.stringify({ done: true, thread_id: threadId, web_sources: [] })}\n\n`
          )
        );
        await writer.close();
      })();

      return new Response(readable, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
      });
    }
  } catch (err) {
    console.error("[chat-advisor] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
