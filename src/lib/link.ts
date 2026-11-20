// The link flow's browser half (LOOM-273, TUI W1; loomux/server
// docs/design/tui-client-design.md "The link flow"). `loomux login` makes
// its own token T, keeps it, and opens <server>/link#h=<H>&label=<host>
// with H = hex(sha256(T)). The page shows a code derived from H, and the
// user approves only if their terminal shows the same code. Approving
// creates the session for H (POST /api/v1/sessions); T never leaves the
// terminal.
//
// The link travels in the fragment so it never reaches a proxy or server
// log. Nothing here sends or logs it: the page posts only H, which is the
// approval itself.

export type LinkFragment =
  | { kind: "ok"; tokenHash: string; label: string }
  // No fragment at all: an incomplete copy, or a sign-in on the way that
  // dropped it.
  | { kind: "missing" }
  // A fragment that isn't a link the server would take.
  | { kind: "invalid" };

// What the server stores for a token, and all POST /sessions accepts
// (api/sessions.go tokenHashPattern). Upper case is refused, not folded:
// the code is computed from the exact characters.
const TOKEN_HASH = /^[0-9a-f]{64}$/;

// The server's cleanClientLabel (api/holds.go): trimmed, at most 64
// characters (code points, Go's runes), no control characters (Go's
// unicode.IsControl is Cc: C0, DEL and C1).
const MAX_LABEL = 64;
const CONTROL = /\p{Cc}/u;

function cleanLabel(label: string): string | null {
  const trimmed = label.trim();
  if ([...trimmed].length > MAX_LABEL || CONTROL.test(trimmed)) return null;
  return trimmed;
}

// parseLinkFragment reads location.hash ("#h=…&label=…"). Each key may
// appear at most once: a link that says two things is refused rather than
// guessed at. Keys it doesn't know are ignored.
export function parseLinkFragment(hash: string): LinkFragment {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (raw === "") return { kind: "missing" };
  const params = new URLSearchParams(raw);
  const hashes = params.getAll("h");
  const labels = params.getAll("label");
  if (hashes.length !== 1 || labels.length > 1) return { kind: "invalid" };
  const tokenHash = hashes[0];
  if (!TOKEN_HASH.test(tokenHash)) return { kind: "invalid" };
  const label = cleanLabel(labels[0] ?? "");
  if (label === null) return { kind: "invalid" };
  return { kind: "ok", tokenHash, label };
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; // RFC 4648

// linkCode is the verification code for a token hash:
// V = first 8 of base32(sha256("loomux-link-v1:" + H)), as ABCD-EFGH.
// Eight base32 characters are exactly the digest's first 40 bits. It
// rejects when the browser has no WebCrypto (an insecure context), so a
// page that can't compute the code shows none instead of a wrong one.
export async function linkCode(tokenHash: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("WebCrypto is not available here");
  const digest = new Uint8Array(await subtle.digest("SHA-256", new TextEncoder().encode(`loomux-link-v1:${tokenHash}`)));
  let bits = 0n;
  for (const b of digest.subarray(0, 5)) bits = (bits << 8n) | BigInt(b);
  let code = "";
  for (let i = 7; i >= 0; i--) code += BASE32[Number((bits >> BigInt(i * 5)) & 31n)];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

// isFramed: is this page inside another page's frame? The server forbids
// framing (X-Frame-Options, frame-ancestors), and the link page also
// refuses on its own, so a hidden Approve can't be clicked through.
export function isFramed(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}
