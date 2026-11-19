import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "../config";
import { AppError, validation } from "../errors";

export interface StorageProvider {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /** Short-lived URL the browser can use to fetch the object. */
  signedUrl(key: string, ttlSeconds?: number): Promise<string>;
}

// ── File validation: extension + declared MIME + magic bytes must all agree ──
const SIGNATURES: { mime: string; ext: string[]; magic: number[] }[] = [
  { mime: "application/pdf", ext: ["pdf"], magic: [0x25, 0x50, 0x44, 0x46] },
  { mime: "image/jpeg", ext: ["jpg", "jpeg"], magic: [0xff, 0xd8, 0xff] },
  { mime: "image/png", ext: ["png"], magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

export function validateUpload(fileName: string, declaredMime: string, body: Buffer): { mime: string; ext: string } {
  const max = config().MAX_UPLOAD_MB * 1024 * 1024;
  if (body.length === 0) throw validation("Empty file");
  if (body.length > max) throw new AppError("PAYLOAD_TOO_LARGE", `File exceeds ${config().MAX_UPLOAD_MB} MB`);
  const ext = path.extname(fileName).slice(1).toLowerCase();
  const sig = SIGNATURES.find((s) => s.ext.includes(ext));
  if (!sig) throw validation("Unsupported file type. Allowed: PDF, JPG, JPEG, PNG");
  if (declaredMime && declaredMime !== sig.mime && !(sig.mime === "image/jpeg" && declaredMime === "image/jpg")) {
    throw validation("File type does not match its extension");
  }
  if (!sig.magic.every((b, i) => body[i] === b)) throw validation("File content does not match its declared type");
  return { mime: sig.mime, ext };
}

export function newStorageKey(legalEntityId: string, ext: string) {
  const now = new Date();
  return `receipts/${legalEntityId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${ext}`;
}

// ── Signed URLs (HMAC) for the local driver ──
function sign(key: string, exp: number) {
  return createHmac("sha256", config().APP_SECRET).update(`${key}:${exp}`).digest("base64url");
}

export function verifySignature(key: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(sign(key, exp));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

class LocalStorage implements StorageProvider {
  constructor(private root: string) {}
  private resolve(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw validation("Invalid storage key");
    return full;
  }
  async put(key: string, body: Buffer) {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body, { mode: 0o600 });
  }
  async get(key: string) {
    return fs.readFile(this.resolve(key));
  }
  async delete(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }
  async signedUrl(key: string, ttlSeconds = 300) {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    return `/api/v1/files?key=${encodeURIComponent(key)}&exp=${exp}&sig=${sign(key, exp)}`;
  }
}

class S3Storage implements StorageProvider {
  private clientPromise = (async () => {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const c = config();
    return new S3Client({ region: c.S3_REGION, endpoint: c.S3_ENDPOINT || undefined, forcePathStyle: !!c.S3_ENDPOINT });
  })();
  constructor(private bucket: string) {}
  async put(key: string, body: Buffer, contentType: string) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await (await this.clientPromise).send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: "AES256" }),
    );
  }
  async get(key: string) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const res = await (await this.clientPromise).send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }
  async delete(key: string) {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await (await this.clientPromise).send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
  async signedUrl(key: string, ttlSeconds = 300) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    return getSignedUrl(await this.clientPromise, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: ttlSeconds });
  }
}

let instance: StorageProvider | null = null;
export function storage(): StorageProvider {
  if (instance) return instance;
  const c = config();
  instance = c.STORAGE_DRIVER === "s3" ? new S3Storage(c.S3_BUCKET!) : new LocalStorage(path.resolve(c.STORAGE_LOCAL_DIR));
  return instance;
}
