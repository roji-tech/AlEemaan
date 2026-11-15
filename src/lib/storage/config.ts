import { appEnv } from "@/lib/dev-tools";
import { CloudinaryImageStore, type CloudinarySettings } from "./cloudinary";
import { MemoryImageStore } from "./memory";
import { S3ImageStore, type S3Settings } from "./s3";
import { STORE_NAMES, StorageNotConfiguredError, type ImageStore, type StoreName } from "./types";

// Which store this deployment uses, read from the environment and nothing else. One store per deployment: IMAGE_STORE names it and that backend's own variables carry its
// credentials. FAIL CLOSED, like every secret in this app: when the name is missing or unknown, a credential is missing or malformed, or `memory` is asked for on a
// production-shaped server, there is NO store, and the image routes answer 503 "image storage is not configured". Nothing falls back to another backend.
//
//   IMAGE_STORE = s3 | r2 | cloudinary | memory
//   s3 : S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, and optionally S3_ENDPOINT (MinIO and the like; used path-style)
//   r2 : R2_ACCOUNT_ID (or R2_ENDPOINT, for a jurisdiction such as the EU), R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY; the region is always "auto"
//   cloudinary : CLOUDINARY_NAME (the cloud name), CLOUDINARY_KEY (the API key), CLOUDINARY_SECRET (the API secret), all from Cloudinary's dashboard; CLOUDINARY_URL is not read
//   memory : tests only; refused when the server is production-shaped (APP_ENV), unless ALLOW_MEMORY_IMAGE_STORE_IN_PRODUCTION=true (only the test harness sets it)
//
// Every image records WHICH store holds it, so a deployment can move from one backend to another: new uploads go to IMAGE_STORE, and an old image is read from the store it
// names, which works for as long as that store's variables are still set. Problem messages name variables and never echo a value.

type Env = Record<string, string | undefined>;

export type StoreSettings =
  { name: "memory" } | { name: "s3" | "r2"; s3: S3Settings } | { name: "cloudinary"; cloudinary: CloudinarySettings };
export type StoreResolution = { ok: true; settings: StoreSettings } | { ok: false; problem: string };

const BUCKET = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const REGION = /^[a-z0-9-]{2,30}$/;
const KEY_ID = /^[A-Za-z0-9/+=_-]{16,128}$/;
const SECRET = /^[A-Za-z0-9/+=_-]{16,200}$/;
const ACCOUNT = /^[a-f0-9]{32}$/i;
const CLOUD_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{1,62}$/;
const CLOUDINARY_KEY = /^[0-9]{8,24}$/;
const CLOUDINARY_SECRET = /^[A-Za-z0-9_-]{16,64}$/;

const value = (env: Env, name: string) => env[name]?.trim() ?? "";

function endpointProblem(raw: string, variable: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return `${variable} is not a valid address.`;
  }
  const local = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !local) return `${variable} must be an https address.`;
  if (url.username || url.password) return `${variable} must not contain a user name or password.`;
  if (url.search || url.hash) return `${variable} must be a plain address.`;
  return null;
}

function resolveS3Family(env: Env, name: "s3" | "r2"): StoreResolution {
  const p = name === "r2" ? "R2" : "S3";
  const bucket = value(env, `${p}_BUCKET`);
  const keyId = value(env, `${p}_ACCESS_KEY_ID`);
  const secret = value(env, `${p}_SECRET_ACCESS_KEY`);
  const missing = [`${p}_BUCKET`, `${p}_ACCESS_KEY_ID`, `${p}_SECRET_ACCESS_KEY`].filter((v) => !value(env, v));
  let region = "auto";
  let endpoint = value(env, `${p}_ENDPOINT`);
  if (name === "s3") {
    region = value(env, "S3_REGION");
    if (!region) missing.push("S3_REGION");
  } else if (!endpoint) {
    const account = value(env, "R2_ACCOUNT_ID");
    if (!account) missing.push("R2_ACCOUNT_ID (or R2_ENDPOINT)");
    else if (!ACCOUNT.test(account)) return { ok: false, problem: "R2_ACCOUNT_ID is not a 32-character account id." };
    else endpoint = `https://${account.toLowerCase()}.r2.cloudflarestorage.com`;
  }
  if (missing.length > 0) return { ok: false, problem: `${name} storage needs ${missing.join(", ")}.` };
  if (!BUCKET.test(bucket) || (name === "s3" && !endpoint && bucket.includes(".")))
    return { ok: false, problem: `${p}_BUCKET is not a valid bucket name.` };
  if (!REGION.test(region)) return { ok: false, problem: "S3_REGION is not a valid region." };
  if (!KEY_ID.test(keyId)) return { ok: false, problem: `${p}_ACCESS_KEY_ID is not a valid access key id.` };
  if (!SECRET.test(secret)) return { ok: false, problem: `${p}_SECRET_ACCESS_KEY is not a valid secret access key.` };
  if (endpoint) {
    const problem = endpointProblem(endpoint, `${p}_ENDPOINT`);
    if (problem) return { ok: false, problem };
  }
  return {
    ok: true,
    settings: { name, s3: { bucket, region, accessKeyId: keyId, secretAccessKey: secret, ...(endpoint ? { endpoint } : {}) } },
  };
}

function resolveCloudinary(env: Env): StoreResolution {
  const cloudName = value(env, "CLOUDINARY_NAME");
  const apiKey = value(env, "CLOUDINARY_KEY");
  const apiSecret = value(env, "CLOUDINARY_SECRET");
  const missing = ["CLOUDINARY_NAME", "CLOUDINARY_KEY", "CLOUDINARY_SECRET"].filter((v) => !value(env, v));
  if (missing.length > 0) return { ok: false, problem: `cloudinary storage needs ${missing.join(", ")}.` };
  // Three plain values, each checked against a pattern that cannot hold a `?`, `/`, `#`, `:` or `@`, so nothing can carry an option to the vendor's package (it reads a different API host
  // or a proxy from the query string of a connection string, which is why the single `CLOUDINARY_URL` is not read). A message names the variable and never repeats its value.
  if (!CLOUD_NAME.test(cloudName)) return { ok: false, problem: "CLOUDINARY_NAME is not a valid cloud name." };
  if (!CLOUDINARY_KEY.test(apiKey)) return { ok: false, problem: "CLOUDINARY_KEY is not a valid API key." };
  if (!CLOUDINARY_SECRET.test(apiSecret)) return { ok: false, problem: "CLOUDINARY_SECRET is not a valid API secret." };
  return { ok: true, settings: { name: "cloudinary", cloudinary: { cloudName, apiKey, apiSecret } } };
}

/// What store `which` (default: the one IMAGE_STORE names) would be, from `env`. Pure; unit tested over the whole matrix.
export function resolveStoreSettings(env: Env = process.env, which?: string): StoreResolution {
  const raw = (which ?? value(env, "IMAGE_STORE")).trim().toLowerCase();
  if (!raw) return { ok: false, problem: "IMAGE_STORE is not set." };
  if (!(STORE_NAMES as readonly string[]).includes(raw))
    return { ok: false, problem: `IMAGE_STORE must be one of ${STORE_NAMES.join(", ")}.` };
  const name = raw as StoreName;
  if (name === "memory") {
    return appEnv(env) === "production" && env.ALLOW_MEMORY_IMAGE_STORE_IN_PRODUCTION !== "true"
      ? { ok: false, problem: "The memory store is for tests and is refused on a production server." }
      : { ok: true, settings: { name: "memory" } };
  }
  if (name === "cloudinary") return resolveCloudinary(env);
  return resolveS3Family(env, name);
}

const cache = new Map<string, ImageStore>();

// The memory store is ONE object for the whole process. Next can load a module once per route bundle, so a module-level constant could give the route that saves an image a
// different store from the route that serves it; the process-wide object therefore lives on `globalThis`, like the Prisma client.
const MEMORY_KEY = Symbol.for("aleemaan.imageStore.memory");
function sharedMemoryStore(): MemoryImageStore {
  const holder = globalThis as unknown as Record<symbol, MemoryImageStore | undefined>;
  return (holder[MEMORY_KEY] ??= new MemoryImageStore());
}

/// The store for this deployment (or, with `which`, the one an old image names). Throws StorageNotConfiguredError when there is none; the routes answer that with a 503.
export function getImageStore(which?: string): ImageStore {
  const resolved = resolveStoreSettings(process.env, which);
  if (!resolved.ok) {
    // The routes turn this into a plain 503, so the log is the only place the person deploying can see WHICH variable is missing or wrong. The text names variables and never a value.
    console.error("image storage is not configured:", resolved.problem);
    throw new StorageNotConfiguredError(resolved.problem);
  }
  const { settings } = resolved;
  if (settings.name === "memory") return sharedMemoryStore();
  const id =
    settings.name === "cloudinary"
      ? `cloudinary|${JSON.stringify(settings.cloudinary)}`
      : `${settings.name}|${JSON.stringify(settings.s3)}`;
  let store = cache.get(id);
  if (!store) {
    store = settings.name === "cloudinary" ? new CloudinaryImageStore(settings.cloudinary) : new S3ImageStore(settings.name, settings.s3);
    cache.set(id, store);
  }
  return store;
}

/// Tests: forget every cached S3, R2 or Cloudinary adapter (the shared memory store keeps what it holds; tests use their own keys).
export function resetImageStoresForTests(): void {
  cache.clear();
}
