import { describe, expect, it } from "vitest";
import { newId } from "./id";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("newId", () => {
  it("is a v4 UUID", () => {
    expect(newId()).toMatch(UUID);
  });

  it("still works without crypto.randomUUID (plain HTTP)", () => {
    // Shadow the prototype's method on this instance, then remove the shadow.
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
    try {
      const a = newId();
      expect(a).toMatch(UUID);
      expect(newId()).not.toBe(a);
    } finally {
      delete (crypto as { randomUUID?: unknown }).randomUUID;
    }
  });
});
