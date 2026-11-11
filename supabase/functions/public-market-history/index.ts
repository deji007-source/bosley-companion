import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
type Candle = { date: string; open: number; high: number; low: number; close: number; volume: number | null };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Use POST." }, 405);
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return reply({ error: "Sign in first." }, 401);
  const base = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !anon || !service) return reply({ error: "Historical-data service is not configured." }, 503);
  let auditContext: { symbol: string; from: string; to: string } | null = null;
  let auditStartedAt: string | null = null;
  let auditWritten = false;
  const writeAudit = async (status: "success" | "partial" | "failed", errorMessage?: string, metrics: Record<string, unknown> = {}) => {
    if (!auditContext || auditWritten) return;
    try {
      const result = await fetch(base + "/rest/v1/market_data_ingestion_runs", {
        method: "POST",
        headers: { apikey: service, Authorization: "Bearer " + service, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ provider_slug: "stooq", symbol: auditContext.symbol, timeframe: "1d", requested_from: auditContext.from, requested_to: auditContext.to, started_at: auditStartedAt ?? new Date().toISOString(), fetched_rows: Number(metrics.fetched_rows ?? 0), accepted_rows: Number(metrics.accepted_rows ?? 0), rejected_rows: Number(metrics.rejected_rows ?? 0), cache_rows: Number(metrics.cache_rows ?? 0), status, error_message: errorMessage ?? null, quality: metrics.quality ?? {}, finished_at: new Date().toISOString() }),
      });
      if (!result.ok) console.error("Could not write ingestion audit record", await result.text());
      else auditWritten = true;
    } catch (auditError) {
      console.error("Could not write ingestion audit record", auditError);
    }
  };
  try {
    const userRes = await fetch(base + "/auth/v1/user", { headers: { apikey: anon, Authorization: auth } });
    if (!userRes.ok) return reply({ error: "Your session is invalid or expired. Sign in again." }, 401);
    const body = await req.json();
    const symbol = String(body?.symbol ?? "").trim().toLowerCase();
    const from = String(body?.from ?? "1900-01-01");
    const to = String(body?.to ?? new Date().toISOString().slice(0, 10));
    if (!/^[a-z0-9.^_-]{1,32}$/.test(symbol)) return reply({ error: "Enter a valid Stooq symbol, e.g. aapl.us or eurusd." }, 400);
    const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().slice(0,10) === s;
    if (!validDate(from) || !validDate(to) || from > to || to > new Date().toISOString().slice(0,10)) return reply({ error: "Choose a valid date range ending today or earlier." }, 400);
    auditContext = { symbol, from, to };
    auditStartedAt = new Date().toISOString();

    const rest = base + "/rest/v1/market_data_candles";
    const headers = { apikey: service, Authorization: "Bearer " + service, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" };
    const query = "?provider_slug=eq.stooq&symbol=eq." + encodeURIComponent(symbol) + "&timeframe=eq.1d&candle_date=gte." + from + "&candle_date=lte." + to + "&select=candle_date,open,high,low,close,volume&order=candle_date.asc";
    const readAllCached = async () => {
      const all: Array<Record<string, unknown>> = [];
      for (let offset = 0; offset < 50000; offset += 1000) {
        const page = await fetch(rest + query, { headers: { apikey: service, Authorization: "Bearer " + service, Range: offset + "-" + (offset + 999), "Range-Unit": "items" } });
        if (!page.ok) throw new Error("Could not read shared historical cache.");
        const rows = await page.json() as Array<Record<string, unknown>>;
        all.push(...rows);
        if (rows.length < 1000) break;
      }
      return all;
    };
    let cached = await readAllCached();
    const findInternalGaps = (rows: Array<Record<string, unknown>>) => {
      const gaps: number[] = [];
      for (let i = 1; i < rows.length; i++) {
        const previous = Date.parse(String(rows[i - 1].candle_date) + "T00:00:00Z");
        const current = Date.parse(String(rows[i].candle_date) + "T00:00:00Z");
        const days = Math.round((current - previous) / 86400000);
        if (days > 4) gaps.push(days);
      }
      return gaps;
    };
    let internalGaps = findInternalGaps(cached);
    let fetched = false;
    let sourceFetchedRows = 0;
    let sourceAcceptedRows = 0;
    let sourceRejectedRows = 0;
    let sourceDuplicateRows = 0;
    if (cached.length === 0 || cached[0]?.candle_date > from || cached[cached.length - 1]?.candle_date < to || internalGaps.length > 0) {
      const url = new URL("https://stooq.com/q/d/l/");
      url.search = new URLSearchParams({ s: symbol, i: "d", d1: from.replaceAll("-",""), d2: to.replaceAll("-","") }).toString();
      const source = await fetch(url, { headers: { Accept: "text/csv", "User-Agent": "BosleyResearch/1.0 (historical data attribution)" }, signal: AbortSignal.timeout(25000) });
      if (!source.ok) { const message = "Stooq returned HTTP " + source.status + "."; await writeAudit("failed", message); return reply({ error: message }, 502); }
      const csv = (await source.text()).trim();
      const lines = csv.split(/\r?\n/);
      sourceFetchedRows = Math.max(0, lines.length - 1);
      if (lines.length < 2 || !/^Date,Open,High,Low,Close,Volume/i.test(lines[0])) { const message = "Stooq did not return a daily OHLCV CSV for this symbol. Check the Stooq symbol format."; await writeAudit("failed", message, { fetched_rows: Math.max(0, lines.length - 1) }); return reply({ error: message }, 422); }
      const parsed: Candle[] = [];
      for (const line of lines.slice(1)) {
        const cols = line.split(",");
        if (cols.length < 5) { sourceRejectedRows++; continue; }
        const date = cols[0];
        const [open,high,low,close] = cols.slice(1,5).map(Number);
        const volume = cols[5] === undefined || cols[5] === "" ? null : Number(cols[5]);
        if (!validDate(date) || date < from || date > to || ![open,high,low,close].every(n=>Number.isFinite(n)&&n>0) ||
          high < Math.max(open,close,low) || low > Math.min(open,close,high) || (volume !== null && (!Number.isFinite(volume)||volume<0))) { sourceRejectedRows++; continue; }
        parsed.push({date,open,high,low,close,volume});
      }
      const unique = [...new Map(parsed.map(c=>[c.date,c])).values()].sort((a,b)=>a.date.localeCompare(b.date));
      sourceAcceptedRows = unique.length;
      sourceDuplicateRows = parsed.length - unique.length;
      sourceRejectedRows += sourceDuplicateRows;
      if (unique.length < 2) { const message = "Fewer than two valid daily observations were returned for this symbol and date range."; await writeAudit("failed", message, { fetched_rows: sourceFetchedRows, rejected_rows: sourceRejectedRows, accepted_rows: unique.length }); return reply({ error: message }, 422); }
      for (let i=0;i<unique.length;i+=500) {
        const batch = unique.slice(i,i+500).map(c=>({provider_slug:"stooq",symbol,timeframe:"1d",candle_date:c.date,open:c.open,high:c.high,low:c.low,close:c.close,volume:c.volume}));
        const saved = await fetch(rest, { method:"POST", headers, body:JSON.stringify(batch) });
        if (!saved.ok) throw new Error("Could not update shared historical cache.");
      }
      fetched = true;
      cached = await readAllCached();
      internalGaps = findInternalGaps(cached);
    }
    const rows = cached.map(c=>({date:String(c.candle_date),open:Number(c.open),high:Number(c.high),low:Number(c.low),close:Number(c.close),volume:c.volume===null?null:Number(c.volume)}));
    const retrievedAt = new Date().toISOString();
    const expectedWeekdays = (() => { let n=0; const d=new Date(from+"T00:00:00Z"), end=new Date(to+"T00:00:00Z"); for(;d<=end;d.setUTCDate(d.getUTCDate()+1)){const day=d.getUTCDay();if(day!==0&&day!==6)n++;} return n; })();
    const quality = {acceptedCacheRows:rows.length,sourceFetchedRows,sourceAcceptedRows,rejectedRows:sourceRejectedRows,duplicateDates:sourceDuplicateRows,internalGapCount:internalGaps.length,largestInternalGapDays:internalGaps.length?Math.max(...internalGaps):0,invalidRowsRejected:true,firstDate:rows[0]?.date??null,lastDate:rows.at(-1)?.date??null,requestedFrom:from,requestedTo:to,cachePages:Math.ceil(rows.length/1000),expectedWeekdays,coverageRatio:expectedWeekdays?Math.min(1,rows.length/expectedWeekdays):1,coverageNote:"Weekday count is indicative only; exchange holidays and provider-specific calendars affect expected observations. Internal gaps longer than four calendar days trigger a provider reconciliation and remain visible in quality metadata if unresolved."};
    await writeAudit(rows.length >= 2 && internalGaps.length === 0 ? "success" : "partial", internalGaps.length ? "Historical cache still contains one or more gaps longer than four calendar days; check exchange holidays and provider coverage." : undefined, { fetched_rows: sourceFetchedRows, accepted_rows: fetched ? sourceAcceptedRows : rows.length, rejected_rows: sourceRejectedRows, cache_rows: rows.length, quality });
    return reply({
      provider:"Stooq", providerUrl:"https://stooq.com/q/d/", symbol, timeframe:"1d",
      rows, cache:"shared", fetched, retrievedAt, quality,
      attribution:"Source: Stooq. Confirm current data-use terms and attribution requirements before redistribution or commercial use. Provider licensing has not yet been independently approved in Bosley's catalogue."
    });
  } catch (e) {
    console.error("Historical data processing failed", e);
    const message = e instanceof Error && (e.message === "Could not read shared historical cache." || e.message === "Could not update shared historical cache.") ? e.message : "Historical data processing failed. Please retry later.";
    await writeAudit("failed", message);
    return reply({ error: message }, 500);
  }
});