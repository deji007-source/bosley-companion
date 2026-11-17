import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const html = read("../index.html");
const migration = read("../supabase/migrations/20261117160000_bosley_learning_studio.sql");
const learning = read("../supabase/functions/learning-assistant/index.ts");
const chat = read("../supabase/functions/companion-chat/index.ts");

assert.ok(html.includes('data-open-view="learning-studio"'), "Learning Studio must be reachable from the global dock menu");
assert.ok(html.includes('id="learning-studio"'), "Learning Studio must have a full-page dock container");
assert.ok(html.includes('id="learning-upload"') && html.includes('id="learning-ask"') && html.includes('id="learning-video-search"'), "Learning Studio must expose upload, document question, and video search actions");
assert.ok(html.includes('db.storage.from("bosley-learning").upload'), "Learning files must upload to the private Supabase bucket");
assert.ok(html.includes('application/pdf') && html.includes('mammoth.extractRawText') && html.includes('pdfjs.getDocument'), "PDF and DOCX uploads must extract text before indexing");
assert.ok(migration.includes("public.learning_documents") && migration.includes("public.learning_document_chunks"), "Learning Studio tables must exist in the migration");
assert.ok(migration.includes("enable row level security") && migration.includes("(select auth.uid()) = user_id"), "Learning metadata and chunks must be protected by per-user RLS");
assert.ok(migration.includes("values ('bosley-learning','bosley-learning',false"), "Learning documents must use a private Storage bucket");
assert.ok(migration.includes("(storage.foldername(name))[1]=(select auth.uid())::text"), "Storage objects must be isolated by authenticated user folder");
assert.ok(learning.includes('body.action === "ingest"') && learning.includes('body.action === "search"') && learning.includes('body.action === "videos"'), "Learning Edge Function must support ingest, retrieval and educational video search");
assert.ok(learning.includes('storagePath.startsWith(userId + "/")') && learning.includes("500_000"), "Document ingestion must validate account ownership and extracted text size");
assert.ok(learning.includes('.eq("user_id", userId)') && learning.includes('textSearch("search_vector"'), "Document retrieval must be account-scoped and use full-text search");
assert.ok(learning.includes('safeSearch: "strict"') && learning.includes("youtube-nocookie.com/embed/"), "Video search must use safe search and privacy-enhanced embeds");
assert.ok(chat.includes("learning_document_chunks") && chat.includes("learningContext") && chat.includes("memoryContext + learningContext"), "Normal Bosley chat must automatically retrieve relevant uploaded learning passages");
assert.ok(chat.includes("untrusted reference material") && chat.includes("name the source document"), "Retrieved documents must be treated as reference material and attributed in answers");
console.log("Learning Studio checks passed.");
