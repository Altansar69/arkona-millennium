import { describe, expect, test } from "bun:test";
import { encodeAltchaPayload, type AltchaChallenge } from "./security";

describe("Arkona security payload", () => {
  test("encodes the exact challenge and solution as base64 JSON", () => {
    const challenge: AltchaChallenge = {
      parameters: {
        algorithm: "PBKDF2/SHA-256",
        nonce: "00112233445566778899aabbccddeeff",
        salt: "ffeeddccbbaa99887766554433221100",
        cost: 1000,
        keyLength: 32,
        keyPrefix: "00",
      },
      signature: "a".repeat(64),
    };
    const encoded = encodeAltchaPayload(challenge, { counter: 42, derivedKey: "b".repeat(64), time: 12.3 });
    const decoded = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    expect(decoded.challenge).toEqual(challenge);
    expect(decoded.solution.counter).toBe(42);
  });
});
