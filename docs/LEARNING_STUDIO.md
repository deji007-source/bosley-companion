# Bosley Learning Studio

## User experience

Learning Studio is a full-page destination in the global Bosley dock. It supports PDF, DOCX, TXT, Markdown, CSV and RTF uploads, document library management, text retrieval, and embedded educational YouTube videos. PDF and DOCX text extraction runs in the browser; scanned PDFs without a text layer require OCR before upload.

## Backend

The Jarvis Supabase project stores original files in the private `bosley-learning` Storage bucket. Paths are prefixed with the authenticated user's UUID. `learning_documents` stores metadata and processing status; `learning_document_chunks` stores bounded text passages with a generated English full-text search vector. RLS restricts both tables and Storage objects to their owner.

The authenticated `learning-assistant` Edge Function accepts:
- `{ action: "ingest", title, file_name, mime_type, storage_path, extracted_text }`
- `{ action: "search", query }`
- `{ action: "videos", query }`

The chat Edge Function retrieves up to five relevant chunks for each latest user question and appends them as untrusted reference context. This makes uploaded material available in ordinary Bosley chat, not just in the Learning Studio page.

## YouTube configuration

The video-search endpoint requires a server-side `YOUTUBE_API_KEY` Edge Function secret. It is deliberately not exposed in the browser. Until that secret is configured, the page will display a clear setup message rather than pretending that video search succeeded.

## Limits

- 25 MB per uploaded file.
- 500 KB extracted text per document.
- Up to 80 PDF pages are extracted in the browser.
- Up to 100 text chunks are indexed per document.
- Scanned PDFs need OCR; OCR is not currently included.
- Retrieval uses English PostgreSQL full-text search, not semantic embeddings. Queries in other languages and conceptually related wording may need more exact phrasing.
- A video is only returned if YouTube marks it embeddable and safe-search filtering retains it.

## Verification

Run `npm run test:learning-studio` and `npm run test:companion`. The companion-chat function is deployed separately to the Jarvis Supabase project. Keep the GitHub branch and Supabase migration aligned when promoting this work.
