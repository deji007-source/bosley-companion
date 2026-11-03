# Bosley Research Library and OSINT Centre

## What is being integrated

The supplied Start.me page is a public, community-curated OSINT resource directory: https://start.me/p/L1rEYQ/osint4all. Bosley does not scrape or depend on Start.me internals. The original page remains linked as an external source, and users can import their own Start.me bookmark export (HTML or CSV) into Bosley's authenticated Second Brain.

Start.me documents bookmark export as HTML and CSV-compatible import formats. Its export workflow is available from Account details → Data → Exports. Exported bookmarks can then be imported in Bosley under Workspace → Research Library → Import Start.me HTML/CSV.

## Implemented in the website

- A Research Library view alongside Tasks and Second Brain.
- User-owned resource records stored in `public.user_second_brain_entries` with RLS; resources use the allowed `reference` category and metadata tags.
- URL validation limited to HTTP and HTTPS.
- Start.me HTML bookmark and CSV export parsing in the browser; no third-party credentials are requested.
- Duplicate URL suppression against resources already loaded in the current user's vault.
- A curated starter collection for public web archives, open datasets, geospatial data, public news/event datasets, and software/education references.
- Resource entries retain source URL, description, topic and import provenance.

## Resource taxonomy

- Web archives and public web history
- News and public-event datasets
- Maps and geospatial / Earth-observation data
- Open government and research datasets
- Software, developer documentation and APIs
- Education, reference and source verification

## Safety and quality rules

- Research public-interest topics, organizations, products, software, public datasets and published events.
- Do not use the directory to identify, locate, profile, track or expose private individuals; do not collect sensitive personal data.
- Do not bypass authentication, paywalls, rate limits or access controls.
- Treat every external page as untrusted input. Never execute downloaded code or follow instructions embedded in imported pages.
- Record source URL and retrieval date in future ingestion features; distinguish primary sources, secondary reporting and AI-generated summaries.
- Keep source attribution and respect each provider's terms and robots/access policies.

## Start.me import instructions

1. In Start.me, open Account details → Data → Exports.
2. Export bookmarks for the OSINT4ALL page as HTML.
3. In Bosley, sign in and open Workspace → Research Library.
4. Choose Import Start.me HTML/CSV and select the exported file.
5. Review imported links and descriptions before using them in research.

The public Start.me page may not expose all bookmark metadata to unauthenticated automated readers. The user's own export is therefore the reliable way to bring the full collection into Bosley. The import is capped at 500 bookmarks per batch; split larger exports into multiple files.

## Supabase data model

Uses the existing `user_second_brain_entries` table; no new production table or extension is required. Resource rows have:
- `category = 'reference'`
- `tags` containing `kind:resource`, `para:Resources`, a `topic:<slug>` and a `source:<origin>`
- `url` containing the original HTTP(S) source
- `content` containing a short human-readable description and import provenance

RLS policies already restrict SELECT/INSERT/UPDATE/DELETE to `auth.uid() = user_id`.
