export type AltchaChallenge = {
  parameters: {
    algorithm: string;
    nonce: string;
    salt: string;
    cost: number;
    keyLength: number;
    keyPrefix: string;
    expiresAt?: number;
    data?: Record<string, unknown>;
  };
  signature: string;
};

type AltchaSolution = { counter: number; derivedKey: string; time: number };

function hexBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) throw new Error("invalid_challenge");
  return Uint8Array.from({ length: hex.length / 2 }, (_, index) => Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16));
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
}

function expired(signal?: AbortSignal, started = 0, timeout = 90_000): boolean {
  return Boolean(signal?.aborted) || performance.now() - started >= timeout;
}

export async function solveSessionProof(
  challenge: string,
  difficulty: number,
  signal?: AbortSignal,
  timeout = 30_000,
): Promise<string> {
  if (!/^[0-9a-f]{64}$/i.test(challenge) || !Number.isInteger(difficulty) || difficulty < 1 || difficulty > 24) {
    throw new Error("invalid_challenge");
  }
  const encoder = new TextEncoder();
  const bytes = Math.floor(difficulty / 8);
  const bits = difficulty % 8;
  const started = performance.now();
  for (let nonce = 0; Number.isSafeInteger(nonce); nonce += 1) {
    if (expired(signal, started, timeout)) throw new Error("security_timeout");
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(`${challenge}:${nonce}`)));
    const whole = digest.subarray(0, bytes).every((value) => value === 0);
    if (whole && (bits === 0 || digest[bytes] >>> (8 - bits) === 0)) return String(nonce);
  }
  throw new Error("security_timeout");
}

export async function solveAltcha(
  challenge: AltchaChallenge,
  signal?: AbortSignal,
  timeout = 90_000,
): Promise<string> {
  const parameters = challenge?.parameters;
  if (
    parameters?.algorithm !== "PBKDF2/SHA-256" ||
    !Number.isInteger(parameters.cost) || parameters.cost < 1 || parameters.cost > 100_000 ||
    !Number.isInteger(parameters.keyLength) || parameters.keyLength < 16 || parameters.keyLength > 64 ||
    !/^[0-9a-f]{32}$/i.test(parameters.nonce) ||
    !/^[0-9a-f]{32}$/i.test(parameters.salt) ||
    !/^[0-9a-f]{1,8}$/i.test(parameters.keyPrefix) ||
    !/^[0-9a-f]{64}$/i.test(challenge.signature)
  ) throw new Error("invalid_challenge");

  const nonceBytes = hexBytes(parameters.nonce);
  const salt = hexBytes(parameters.salt);
  const password = new Uint8Array(nonceBytes.length + 4);
  password.set(nonceBytes);
  const view = new DataView(password.buffer);
  const started = performance.now();

  for (let counter = 0; counter <= 0xffff_ffff; counter += 1) {
    if (expired(signal, started, timeout)) throw new Error("security_timeout");
    view.setUint32(nonceBytes.length, counter, false);
    const key = await crypto.subtle.importKey("raw", password, "PBKDF2", false, ["deriveBits"]);
    const derived = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", iterations: parameters.cost, salt },
      key,
      parameters.keyLength * 8,
    );
    const derivedKey = toHex(derived);
    if (derivedKey.startsWith(parameters.keyPrefix.toLowerCase())) {
      return encodeAltchaPayload(challenge, {
        counter,
        derivedKey,
        time: Math.floor((performance.now() - started) * 10) / 10,
      });
    }
  }
  throw new Error("security_timeout");
}

export function encodeAltchaPayload(challenge: AltchaChallenge, solution: AltchaSolution): string {
  const bytes = new TextEncoder().encode(JSON.stringify({ challenge, solution }));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
