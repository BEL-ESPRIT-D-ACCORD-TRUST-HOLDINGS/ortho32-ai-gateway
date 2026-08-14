import crypto from "crypto";

// Simulated encrypted-at-rest vault. Keys are never logged or returned to clients.
const ALGO = "aes-256-gcm";
const VAULT_KEY = crypto.createHash("sha256").update(process.env.ORTHO_VAULT_MASTER_KEY || "ortho32-dev-vault-key-not-for-prod").digest();

function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, VAULT_KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}
function decrypt(blob: string): string {
  const [ivHex, tagHex, encHex] = blob.split(":");
  const decipher = crypto.createDecipheriv(ALGO, VAULT_KEY, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const dec = Buffer.concat([decipher.update(Buffer.from(encHex, "hex")), decipher.final()]);
  return dec.toString("utf8");
}

export class CredentialVault {
  private store = new Map<string, string>(); // provider -> encrypted blob

  async set(provider: string, apiKey: string): Promise<void> {
    if (!apiKey) throw new Error("apiKey required");
    this.store.set(provider, encrypt(apiKey));
  }

  // internal only — never expose to routes
  private async getDecrypted(provider: string): Promise<string | null> {
    const blob = this.store.get(provider);
    if (!blob) return null;
    return decrypt(blob);
  }

  async has(provider: string): Promise<boolean> {
    return this.store.has(provider);
  }

  // Gateway gets temporary access only when request is in flight.
  async withTemporaryAccess<T>(provider: string, fn: (key: string | null) => Promise<T>): Promise<T> {
    const key = await this.getDecrypted(provider);
    // key is scoped to this callback; caller must not log or persist it
    try {
      return await fn(key);
    } finally {
      // key goes out of scope — no retention
    }
  }

  // local providers need no credential
  async isConfigured(provider: string, isLocal: boolean): Promise<boolean> {
    if (isLocal) return true;
    return this.store.has(provider);
  }
}

// singleton for gateway
export const globalVault = new CredentialVault();
