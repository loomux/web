import { afterEach, describe, expect, it, vi } from "vitest";
import { linkCode, parseLinkFragment } from "./link";

// The shared test vector for the link flow's verification code
// (loomux/server docs/design/tui-client-design.md, "The link flow"). The
// terminal (loomux/tui T2) must compute the same values: a token T, its
// hash H = hex(sha256(T)) as the server stores it, and the code
// V = first 8 of base32(sha256("loomux-link-v1:" + H)), as ABCD-EFGH.
// Cross-checked with Go's encoding/base32 (StdEncoding) and Python's
// base64.b32encode.
const VECTOR = {
  token: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8", // bytes 0x00…0x1f, base64url without padding
  hash: "ea866a757e4c38babfa8127cbe9a409d3e1f93a00ff1488ff735fcf917afffd0",
  code: "7ESB-UHZP",
};

async function sha256Hex(s: string) {
  const sum = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(sum)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("linkCode", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("the vector's hash is the server's hash of its token", async () => {
    expect(await sha256Hex(VECTOR.token)).toBe(VECTOR.hash);
  });

  it("matches the shared test vector", async () => {
    expect(await linkCode(VECTOR.hash)).toBe(VECTOR.code);
  });

  it.each([
    ["0".repeat(64), "VS4Z-3W2A"],
    ["225f7e75329dd45aa354975d73987319309393af3a4c6733bc13601a4f1b8796", "HLE5-QIHC"],
  ])("gives %s the code %s", async (hash, code) => {
    expect(await linkCode(hash)).toBe(code);
  });

  it("fails without WebCrypto (an insecure context) instead of showing a code", async () => {
    vi.stubGlobal("crypto", {});
    await expect(linkCode(VECTOR.hash)).rejects.toThrow();
  });
});

describe("parseLinkFragment", () => {
  const h = VECTOR.hash;

  it("reads the hash and the label", () => {
    expect(parseLinkFragment(`#h=${h}&label=laptop`)).toEqual({ kind: "ok", tokenHash: h, label: "laptop" });
  });

  it.each([
    ["%20", "my laptop"],
    ["+", "my laptop"],
  ])("decodes a label's space written as %s", (space, label) => {
    expect(parseLinkFragment(`#h=${h}&label=my${space}laptop`)).toEqual({ kind: "ok", tokenHash: h, label });
  });

  it("decodes a non-ASCII label", () => {
    expect(parseLinkFragment(`#h=${h}&label=${encodeURIComponent("bürö-mac")}`)).toMatchObject({ label: "bürö-mac" });
  });

  it("trims the label, as the server does", () => {
    expect(parseLinkFragment(`#h=${h}&label=%20laptop%20`)).toMatchObject({ label: "laptop" });
  });

  it("takes a link without a label (the server's label is optional)", () => {
    expect(parseLinkFragment(`#h=${h}`)).toEqual({ kind: "ok", tokenHash: h, label: "" });
  });

  it("ignores parameters it doesn't know, for later terminals", () => {
    expect(parseLinkFragment(`#h=${h}&label=laptop&v=2`)).toEqual({ kind: "ok", tokenHash: h, label: "laptop" });
  });

  it.each(["", "#"])("says a fragment %j is missing, not malformed", (hash) => {
    expect(parseLinkFragment(hash)).toEqual({ kind: "missing" });
  });

  it.each([
    ["no hash", "#label=laptop"],
    ["an empty hash", "#h=&label=laptop"],
    ["a short hash", `#h=${h.slice(1)}`],
    ["a long hash", `#h=${h}0`],
    ["upper-case hex", `#h=${h.toUpperCase()}`],
    ["a non-hex hash", `#h=${"g".repeat(64)}`],
    ["the hash twice", `#h=${h}&h=${"0".repeat(64)}`],
    ["the label twice", `#h=${h}&label=a&label=b`],
    ["a 65-character label", `#h=${h}&label=${"a".repeat(65)}`],
    ["a control character in the label", `#h=${h}&label=lap%0Atop`],
    ["DEL in the label", `#h=${h}&label=lap%7Ftop`],
    ["a C1 control in the label", `#h=${h}&label=lap%C2%85top`],
  ])("refuses %s", (_why, hash) => {
    expect(parseLinkFragment(hash)).toEqual({ kind: "invalid" });
  });

  it("counts a label's length in characters, as the server does", () => {
    expect(parseLinkFragment(`#h=${h}&label=${encodeURIComponent("é".repeat(64))}`)).toMatchObject({ kind: "ok" });
    expect(parseLinkFragment(`#h=${h}&label=${encodeURIComponent("😀".repeat(64))}`)).toMatchObject({ kind: "ok" });
    expect(parseLinkFragment(`#h=${h}&label=${encodeURIComponent("😀".repeat(65))}`)).toEqual({ kind: "invalid" });
  });
});
