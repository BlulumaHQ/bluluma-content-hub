import { describe, expect, it } from "bun:test";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { createCmsAuth, validateNewPassword } from "../src/lib/cms-auth";

function fixture(admin: unknown = true, userExists = true, rpcError = false) {
  const calls: string[] = [];
  const session = { user: { id: "admin-id", email: "test@example.invalid" } } as Session;
  const client = {
    auth: {
      getUser: async () => { calls.push("getUser"); return { data: { user: userExists ? session.user : null }, error: null }; },
      getSession: async () => { calls.push("getSession"); return { data: { session }, error: null }; },
      signOut: async () => { calls.push("signOut"); return { error: null }; },
      signInWithPassword: async () => { calls.push("signIn"); return { error: null }; },
    },
    rpc: async (name: string) => { calls.push(name); return { data: admin, error: rpcError ? { message: "RPC unavailable" } : null }; },
  } as unknown as SupabaseClient;
  return { calls, auth: createCmsAuth(client, async () => { calls.push("clearQueries"); }) };
}
describe("CMS authentication rules", () => {
  it("requires at least 10 characters for new passwords", () => {
    expect(validateNewPassword("123456789", "123456789")).not.toBeNull();
    expect(validateNewPassword("1234567890", "1234567890")).toBeNull();
  });
  it("requires matching password confirmation", () => {
    expect(validateNewPassword("1234567890", "1234567891")).not.toBeNull();
  });
  it("admits a validated user only after is_admin returns boolean true", async () => {
    const { auth, calls } = fixture();
    expect(await auth.signIn("test@example.invalid", "1234567890")).toEqual({ error: null });
    expect(calls).toEqual(["signIn", "getUser", "is_admin", "getSession"]);
    expect(auth.getSnapshot().isAdmin).toBe(true);
  });
  it("signs non-administrators out instead of admitting them", async () => {
    const { auth, calls } = fixture(false);
    const result = await auth.signIn("test@example.invalid", "1234567890");
    expect(result.error).not.toBeNull();
    expect(calls).toEqual(["signIn", "getUser", "is_admin", "clearQueries", "signOut"]);
    expect(auth.getSnapshot().session).toBeNull();
    expect(auth.getSnapshot().isAdmin).toBe(false);
  });
  it("rejects truthy values other than boolean true", async () => {
    const { auth } = fixture("true");
    expect(await auth.verifyAdmin()).toBe(false);
  });
  it("blocks signed-out access without querying is_admin", async () => {
    const { auth, calls } = fixture(true, false);
    expect(await auth.verifyAdmin()).toBe(false);
    expect(calls).toEqual(["getUser"]);
  });
  it("fails closed when is_admin is unavailable", async () => {
    const { auth, calls } = fixture(true, true, true);
    expect(await auth.verifyAdmin()).toBe(false);
    expect(calls).toContain("signOut");
  });
  it("revalidates a persistent session on subsequent access", async () => {
    const { auth, calls } = fixture();
    expect(await auth.verifyAdmin()).toBe(true);
    expect(await auth.verifyAdmin()).toBe(true);
    expect(calls.filter((call) => call === "is_admin")).toHaveLength(2);
  });
  it("clears cached data before signing out", async () => {
    const { auth, calls } = fixture();
    await auth.verifyAdmin();
    calls.length = 0;
    await auth.signOut();
    expect(calls).toEqual(["clearQueries", "signOut"]);
    expect(auth.getSnapshot().session).toBeNull();
  });
  it("ignores an authorization result finishing after logout", async () => {
    const { auth } = fixture();
    const checking = auth.verifyAdmin();
    await auth.signOut();
    expect(await checking).toBe(false);
    expect(auth.getSnapshot().isAdmin).toBe(false);
  });
});