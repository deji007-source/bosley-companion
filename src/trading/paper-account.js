/* Paper-only account ledger. No network, broker, exchange or order-routing capability. */
(() => {
  const round = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  const makeId = () => "paper-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  function createAccount({ label = "Paper account", currency = "USD", startingBalance = 10000 } = {}) {
    const balance = Number(startingBalance);
    if (!Number.isFinite(balance) || balance <= 0 || balance > 100000000) throw new Error("Starting balance must be between 0.01 and 100,000,000.");
    return { id: makeId(), label: String(label).trim().slice(0, 48) || "Paper account", currency, mode: "paper", initialBalance: round(balance), cash: round(balance), equity: round(balance), createdAt: new Date().toISOString(), ledger: [] };
  }
  function record(account, entry) {
    if (!account || account.mode !== "paper") throw new Error("Only paper accounts are supported.");
    const amount = Number(entry?.amount);
    if (!Number.isFinite(amount) || amount === 0) throw new Error("Ledger amount must be a non-zero finite number.");
    const reference = entry?.reference ? String(entry.reference).slice(0, 96) : "";
    if (reference && (account.ledger || []).some(item => item.reference === reference)) return account;
    const cash = round(account.cash + amount);
    if (cash < 0) throw new Error("The simulated account cannot have a negative cash balance.");
    const next = { ...account, cash, equity: round(cash + Number(account.unrealizedPnl || 0)), ledger: [...(account.ledger || []).slice(-499), { id: makeId(), type: String(entry.type || "adjustment").slice(0, 32), amount: round(amount), note: String(entry.note || "").slice(0, 160), ...(reference ? { reference } : {}), at: new Date().toISOString() }] };
    return next;
  }
  function summary(account) {
    const equity = Number(account?.equity ?? account?.cash);
    const initial = Number(account?.initialBalance);
    const pnl = Number.isFinite(equity) && Number.isFinite(initial) ? round(equity - initial) : null;
    return { mode: "paper", equity: Number.isFinite(equity) ? round(equity) : null, pnl, returnPct: pnl !== null && initial > 0 ? pnl / initial * 100 : null, ledgerEntries: Array.isArray(account?.ledger) ? account.ledger.length : 0 };
  }
  window.BosleyPaperAccounts = Object.freeze({ createAccount, record, summary });
})();
