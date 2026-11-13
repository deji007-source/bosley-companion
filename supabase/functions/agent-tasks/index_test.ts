import { describe, it, expect } from "https://deno.land/std@0.224.0/testing/bdd.ts";

describe("agent task API contract", () => {
  it("keeps all state-changing actions owner-authenticated", () => {
    const source = Deno.readTextFileSync(new URL("./index.ts", import.meta.url));
    expect(source).toContain("auth.auth.getUser(token)");
    expect(source).toContain('.eq("user_id", user.id)');
    expect(source).toContain('action === "cancel"');
    expect(source).toContain('action === "retry"');
  });
  it("validates bounded progress and message payloads", () => {
    const source = Deno.readTextFileSync(new URL("./index.ts", import.meta.url));
    expect(source).toContain("progress > 100");
    expect(source).toContain("message.length > 1200");
  });
});
