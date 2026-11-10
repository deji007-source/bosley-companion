import { createClient } from "npm:@supabase/supabase-js@2";

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const validSymbol = (value: unknown, pattern: RegExp) =>
  typeof value === "string" && value.length <= 20 && pattern.test(value);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST for historical data requests." }, 405);
  const authorization = req.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ") || authorization.length < 24) {
    return json({ error: "Sign in to request provider data." }, 401);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!supabaseUrl || !supabaseKey) {
      return json({ error: "Historical data authentication is not configured on the server." }, 503);
    }
    const authClient = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const accessToken = authorization.slice("Bearer ".length).trim();
    const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return json({ error: "Your sign-in session is invalid or expired. Sign in again." }, 401);
    }

    const body = await req.json();
    const apiKey = String(body?.apiKey ?? "").trim();
    const category = String(body?.category ?? "").trim().toLowerCase();
    const symbol = String(body?.symbol ?? "").trim().toUpperCase();

    if (apiKey.length < 8 || apiKey.length > 128 || !/^[A-Za-z0-9._-]+$/.test(apiKey)) {
      return json({ error: "Enter a valid Alpha Vantage API key. The key is used for this request only and is not stored by Bosley." }, 400);
    }

    let url: URL;
    let seriesKey: string;
    let sourceFields: { open: string[]; high: string[]; low: string[]; close: string[]; volume: string[] };
    if (category === "equities") {
      if (!validSymbol(symbol, /^[A-Z0-9.^_-]{1,20}$/)) return json({ error: "Enter a valid stock or ETF ticker, such as IBM." }, 400);
      url = new URL("https://www.alphavantage.co/query");
      url.search = new URLSearchParams({ function: "TIME_SERIES_DAILY", symbol, outputsize: "compact", apikey: apiKey }).toString();
      seriesKey = "Time Series (Daily)";
      sourceFields = { open: ["1. open"], high: ["2. high"], low: ["3. low"], close: ["4. close"], volume: ["5. volume"] };
    } else if (category === "forex") {
      if (!validSymbol(symbol, /^[A-Z]{6}$/)) return json({ error: "Enter a six-letter currency pair, for example EURUSD." }, 400);
      url = new URL("https://www.alphavantage.co/query");
      url.search = new URLSearchParams({ function: "FX_DAILY", from_symbol: symbol.slice(0, 3), to_symbol: symbol.slice(3), outputsize: "full", apikey: apiKey }).toString();
      seriesKey = "Time Series FX (Daily)";
      sourceFields = { open: ["1. open"], high: ["2. high"], low: ["3. low"], close: ["4. close"], volume: [] };
    } else if (category === "crypto") {
      if (!validSymbol(symbol, /^[A-Z0-9]{3,10}$/)) return json({ error: "Enter a cryptocurrency ticker such as BTC. The quote market is USD." }, 400);
      url = new URL("https://www.alphavantage.co/query");
      url.search = new URLSearchParams({ function: "DIGITAL_CURRENCY_DAILY", symbol, market: "USD", apikey: apiKey }).toString();
      seriesKey = "Time Series (Digital Currency Daily)";
      sourceFields = { open: ["1a. open (USD)", "1b. open (USD)"], high: ["2a. high (USD)", "2b. high (USD)"], low: ["3a. low (USD)", "3b. low (USD)"], close: ["4a. close (USD)", "4b. close (USD)"], volume: ["5. volume"] };
    } else {
      return json({ error: "Choose Stocks / ETFs, Forex or Crypto. General is a category label, not a specific market instrument." }, 400);
    }

    const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) return json({ error: "The data provider returned HTTP " + response.status + ". Try again later." }, 502);
    const payload = await response.json();
    if (payload["Error Message"] || payload.Note || payload.Information) {
      const detail = String(payload["Error Message"] || payload.Note || payload.Information).slice(0, 350);
      return json({ error: "Alpha Vantage could not provide this series: " + detail }, 422);
    }

    const series = payload[seriesKey];
    if (!series || typeof series !== "object" || Array.isArray(series)) return json({ error: "The provider response did not contain the expected daily time series. Check the ticker and API plan." }, 422);
    const pick = (record: Record<string, unknown>, keys: string[]) => {
      for (const key of keys) {
        const value = Number(record[key]);
        if (Number.isFinite(value)) return value;
      }
      return null;
    };

    const today = new Date().toISOString().slice(0, 10);
    const parsed = Object.entries(series as Record<string, unknown>).map(([date, values]) => {
      const record = values && typeof values === "object" && !Array.isArray(values)
        ? values as Record<string, unknown>
        : {};
      return {
        date,
        open: pick(record, sourceFields.open),
        high: pick(record, sourceFields.high),
        low: pick(record, sourceFields.low),
        close: pick(record, sourceFields.close),
        volume: pick(record, sourceFields.volume),
      };
    });
    const isValidCalendarDate = (value: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const date = new Date(value + "T00:00:00Z");
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    };
    const valid = parsed.filter((row) =>
      isValidCalendarDate(row.date) &&
      row.date <= today &&
      row.open !== null && row.high !== null && row.low !== null && row.close !== null &&
      row.open > 0 && row.high > 0 && row.low > 0 && row.close > 0 &&
      row.high >= Math.max(row.open, row.close, row.low) &&
      row.low <= Math.min(row.open, row.close, row.high) &&
      (row.volume === null || row.volume >= 0)
    ).sort((a, b) => a.date.localeCompare(b.date));

    const seen = new Set<string>();
    const candles = valid.filter((row) => {
      if (seen.has(row.date)) return false;
      seen.add(row.date);
      return true;
    });
    if (candles.length < 60) return json({ error: "Only " + candles.length + " valid daily observations were returned. At least 60 are required for the current research backtester." }, 422);
    if (candles.length > 10000) candles.splice(0, candles.length - 10000);

    const gaps = candles.slice(1).map((row, index) =>
      (Date.parse(row.date) - Date.parse(candles[index].date)) / 86400000
    ).filter((days) => days > 7);

    return json({
      provider: "Alpha Vantage",
      providerUrl: "https://www.alphavantage.co/documentation/",
      symbol,
      category,
      timeframe: "1d",
      currency: category === "crypto" ? "USD" : null,
      retrievedAt: new Date().toISOString(),
      rows: candles,
      quality: {
        received: parsed.length,
        accepted: candles.length,
        rejected: parsed.length - valid.length,
        duplicateDates: valid.length - candles.length,
        gapsOverSevenDays: gaps.length,
        maxGapDays: gaps.length ? Math.max(...gaps) : 0,
        volumeAvailable: candles.some((row) => row.volume !== null),
      },
      notes: [
        category === "equities" ? "Stocks / ETFs use the provider's compact daily series; availability depends on provider plan." : "Daily historical observations returned by Alpha Vantage.",
        "Provider data is attributed to Alpha Vantage; verify symbol, currency, exchange calendar, adjustments and licensing before relying on it.",
        "This endpoint retrieves historical observations only. It does not connect to a broker or place orders.",
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown provider error";
    return json({ error: message.includes("timed out") ? "The provider request timed out. Try again." : "Could not retrieve historical data: " + message.slice(0, 250) }, 500);
  }
});
