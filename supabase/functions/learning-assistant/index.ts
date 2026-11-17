import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const youtubeKey = Deno.env.get("YOUTUBE_API_KEY") || "";
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function splitIntoChunks(input: string, maxChars = 4200, overlap = 350) {
  const text = input.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length && chunks.length < 100) {
    let end = Math.min(text.length, start + maxChars);
    if (end < text.length) {
      const boundary = Math.max(text.lastIndexOf("\n\n", end), text.lastIndexOf(". ", end), text.lastIndexOf(" ", end));
      if (boundary > start + Math.floor(maxChars * 0.55)) end = boundary + 1;
    }
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return reply({ error: "Sign in required" }, 401);
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return reply({ error: "Sign in required" }, 401);
  const userId = auth.user.id;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ error: "Invalid JSON body" }, 400); }
  const action = body.action;

  if (action === "ingest") {
    const title = String(body.title || "").trim().slice(0, 240);
    const fileName = String(body.file_name || "").trim().slice(0, 255);
    const mimeType = String(body.mime_type || "text/plain").trim().slice(0, 120);
    const storagePath = String(body.storage_path || "");
    const extractedText = String(body.extracted_text || "");
    if (!title || !fileName || !storagePath.startsWith(userId + "/") || storagePath.includes("..")) {
      return reply({ error: "Document metadata or private storage path is invalid" }, 400);
    }
    if (!extractedText.trim() || extractedText.length > 500_000) {
      return reply({ error: "No readable text was supplied, or the extracted text exceeds the 500 KB limit" }, 400);
    }
    const chunks = splitIntoChunks(extractedText);
    if (!chunks.length) return reply({ error: "The document did not contain searchable text" }, 422);

    const { data: doc, error: docError } = await admin.from("learning_documents").upsert({
      user_id: userId,
      title,
      file_name: fileName,
      mime_type: mimeType,
      storage_path: storagePath,
      status: "processing",
      source_kind: "upload",
      error_message: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,storage_path" }).select("id,title,file_name,storage_path,status").single();
    if (docError || !doc) {
      console.error("Learning document metadata write failed", docError?.message);
      return reply({ error: "Could not save document metadata" }, 500);
    }
    const { error: deleteError } = await admin.from("learning_document_chunks").delete()
      .eq("user_id", userId).eq("document_id", doc.id);
    if (deleteError) {
      await admin.from("learning_documents").update({ status: "failed", error_message: "Could not replace existing searchable content" }).eq("id", doc.id).eq("user_id", userId);
      return reply({ error: "Could not prepare document indexing" }, 500);
    }
    const rows = chunks.map((content, chunk_index) => ({ document_id: doc.id, user_id: userId, chunk_index, content }));
    const { error: chunkError } = await admin.from("learning_document_chunks").insert(rows);
    if (chunkError) {
      await admin.from("learning_documents").update({ status: "failed", error_message: "Document text indexing failed" }).eq("id", doc.id).eq("user_id", userId);
      console.error("Learning chunk insert failed", chunkError.message);
      return reply({ error: "Could not index document text" }, 500);
    }
    const { error: readyError } = await admin.from("learning_documents").update({
      status: "ready", extracted_at: new Date().toISOString(), error_message: null, updated_at: new Date().toISOString(),
    }).eq("id", doc.id).eq("user_id", userId);
    if (readyError) return reply({ error: "Document was indexed but its status could not be updated" }, 500);
    return reply({ ok: true, document_id: doc.id, title: doc.title, chunks: rows.length, status: "ready" });
  }

  if (action === "search") {
    const query = String(body.query || "").trim().slice(0, 500);
    if (query.length < 2) return reply({ error: "Enter a longer learning question" }, 400);
    const { data, error } = await admin.from("learning_document_chunks")
      .select("id,document_id,chunk_index,content,document:learning_documents!inner(title,file_name,status)")
      .eq("user_id", userId)
      .eq("document.user_id", userId)
      .eq("document.status", "ready")
      .textSearch("search_vector", query, { type: "websearch", config: "english" })
      .limit(8);
    if (error) {
      console.error("Learning search failed", error.message);
      return reply({ error: "Could not search your learning library" }, 500);
    }
    return reply({ ok: true, matches: data || [] });
  }

  if (action === "videos") {
    const query = String(body.query || "").trim().slice(0, 180);
    if (query.length < 2) return reply({ error: "Enter a topic to search" }, 400);
    if (!youtubeKey) return reply({ error: "YouTube recommendations are not configured yet. Add YOUTUBE_API_KEY to the Supabase Edge Function secrets." }, 503);
    const params = new URLSearchParams({
      part: "snippet", type: "video", safeSearch: "strict", maxResults: "8",
      videoEmbeddable: "true", q: query + " educational explanation",
      key: youtubeKey,
    });
    const response = await fetch("https://www.googleapis.com/youtube/v3/search?" + params.toString());
    if (!response.ok) {
      console.error("YouTube search returned", response.status);
      return reply({ error: "Video search is temporarily unavailable" }, 502);
    }
    const result = await response.json();
    const videos = (result.items || []).map((item: any) => ({
      video_id: item.id?.videoId,
      title: item.snippet?.title || "",
      channel: item.snippet?.channelTitle || "",
      description: item.snippet?.description || "",
      published_at: item.snippet?.publishedAt || null,
      embed_url: item.id?.videoId ? "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(item.id.videoId) : null,
      watch_url: item.id?.videoId ? "https://www.youtube.com/watch?v=" + encodeURIComponent(item.id.videoId) : null,
    })).filter((item: any) => item.video_id && item.embed_url);
    return reply({ ok: true, videos });
  }

  return reply({ error: "Unsupported action" }, 400);
});
