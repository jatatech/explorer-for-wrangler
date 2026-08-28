import { describe, expect, it } from "vitest";
import { parseWhoamiIdentity } from "../src/auth";

describe("Wrangler authentication output", () => {
  it("parses authenticated whoami JSON", () => {
    expect(parseWhoamiIdentity(`{
      "loggedIn": true,
      "authType": "OAuth Token",
      "email": "worker@example.com",
      "accounts": [{ "id": "abc", "name": "Example" }]
    }`)).toMatchObject({
      loggedIn: true,
      authType: "OAuth Token",
      email: "worker@example.com"
    });
  });

  it("parses Wrangler's unauthenticated fatal JSON", () => {
    expect(parseWhoamiIdentity("wrangler error\n{\"loggedIn\":false}\n")).toEqual({ loggedIn: false });
  });

  it("does not mistake an unrelated network error for auth JSON", () => {
    expect(parseWhoamiIdentity("Network connection failed")).toBeUndefined();
  });
});
