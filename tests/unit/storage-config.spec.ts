import "../support/env";
import { test, expect } from "@playwright/test";
import { StorageNotConfiguredError, getImageStore, resetImageStoresForTests, resolveStoreSettings } from "@/lib/storage";

// Which store a deployment uses is a pure function of its environment, and it fails closed: no name, an unknown name, a missing or malformed credential, or `memory` on a
// production-shaped server all mean NO store (the image routes answer 503). Nothing falls back to another backend, and no message ever echoes a value.

const KEY_ID = "AKIAIOSFODNN7EXAMPLE";
const SECRET = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
const ACCOUNT = "0123456789abcdef0123456789abcdef";
const s3 = {
  IMAGE_STORE: "s3",
  S3_BUCKET: "school-images",
  S3_REGION: "eu-west-1",
  S3_ACCESS_KEY_ID: KEY_ID,
  S3_SECRET_ACCESS_KEY: SECRET,
};
const r2 = {
  IMAGE_STORE: "r2",
  R2_ACCOUNT_ID: ACCOUNT,
  R2_BUCKET: "school-images",
  R2_ACCESS_KEY_ID: KEY_ID,
  R2_SECRET_ACCESS_KEY: SECRET,
};
const problem = (env: Record<string, string | undefined>, which?: string) => {
  const r = resolveStoreSettings(env, which);
  return r.ok ? null : r.problem;
};

test("nothing set, blank, or an unknown name: no store", () => {
  expect(problem({})).toMatch(/IMAGE_STORE is not set/);
  expect(problem({ IMAGE_STORE: "   " })).toMatch(/IMAGE_STORE is not set/);
  for (const name of ["gcs", "azure", "local", "disk", "cloudinary", "s3,r2", "s3;", "../s3", "null", "undefined", "true", "\u0000"])
    expect(problem({ IMAGE_STORE: name }), name).toMatch(/IMAGE_STORE must be one of/);
});

test("memory: fine on a development or staging server, refused on anything production-shaped unless the harness says so", () => {
  expect(resolveStoreSettings({ IMAGE_STORE: "memory", APP_ENV: "development" })).toEqual({ ok: true, settings: { name: "memory" } });
  expect(resolveStoreSettings({ IMAGE_STORE: "memory", APP_ENV: "staging" }).ok).toBe(true);
  expect(resolveStoreSettings({ IMAGE_STORE: "memory" }).ok).toBe(true); // no APP_ENV and not NODE_ENV=production: a development machine
  for (const env of [
    { IMAGE_STORE: "memory", NODE_ENV: "production" },
    { IMAGE_STORE: "memory", APP_ENV: "production" },
    { IMAGE_STORE: "memory", APP_ENV: "prod" }, // mistyped: treated as production
    { IMAGE_STORE: "memory", APP_ENV: "staging", VERCEL_ENV: "production" },
    { IMAGE_STORE: "memory", NODE_ENV: "production", ALLOW_MEMORY_IMAGE_STORE_IN_PRODUCTION: "TRUE" },
    { IMAGE_STORE: "memory", NODE_ENV: "production", ALLOW_MEMORY_IMAGE_STORE_IN_PRODUCTION: "1" },
    { IMAGE_STORE: "memory", NODE_ENV: "production", ALLOW_MEMORY_IMAGE_STORE_IN_PRODUCTION: "" },
  ])
    expect(problem(env), JSON.stringify(env)).toMatch(/memory store is for tests/);
  expect(resolveStoreSettings({ IMAGE_STORE: "memory", NODE_ENV: "production", ALLOW_MEMORY_IMAGE_STORE_IN_PRODUCTION: "true" }).ok).toBe(
    true,
  );
});

test("s3: a complete set resolves; the name is case- and space-insensitive; a missing value names exactly that variable", () => {
  const ok = resolveStoreSettings(s3);
  expect(ok).toEqual({
    ok: true,
    settings: { name: "s3", s3: { bucket: "school-images", region: "eu-west-1", accessKeyId: KEY_ID, secretAccessKey: SECRET } },
  });
  expect(resolveStoreSettings({ ...s3, IMAGE_STORE: "  S3 " }).ok).toBe(true);
  for (const name of ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) {
    const env: Record<string, string | undefined> = { ...s3 };
    delete env[name];
    expect(problem(env), name).toContain(name);
    expect(problem({ ...env, [name]: "   " }), `${name} blank`).toContain(name);
  }
});

test("s3: malformed values are refused, with the variable named and the value never repeated", () => {
  const cases: Array<[Record<string, string>, string]> = [
    [{ S3_BUCKET: "UPPER" }, "S3_BUCKET"],
    [{ S3_BUCKET: "a" }, "S3_BUCKET"],
    [{ S3_BUCKET: "has space" }, "S3_BUCKET"],
    [{ S3_BUCKET: "../etc" }, "S3_BUCKET"],
    [{ S3_BUCKET: "with.dot" }, "S3_BUCKET"], // dots break the https certificate of Amazon's virtual-hosted address
    [{ S3_REGION: "EU WEST" }, "S3_REGION"],
    [{ S3_REGION: "x" }, "S3_REGION"],
    [{ S3_ACCESS_KEY_ID: "short" }, "S3_ACCESS_KEY_ID"],
    [{ S3_ACCESS_KEY_ID: "AKIA IOSFODNN7EXAMPLE" }, "S3_ACCESS_KEY_ID"],
    [{ S3_SECRET_ACCESS_KEY: "tooshort" }, "S3_SECRET_ACCESS_KEY"],
    [{ S3_SECRET_ACCESS_KEY: "has a space in the secret key value" }, "S3_SECRET_ACCESS_KEY"],
    [{ S3_ENDPOINT: "http://minio.example.com" }, "S3_ENDPOINT"],
    [{ S3_ENDPOINT: "ftp://minio.example.com" }, "S3_ENDPOINT"],
    [{ S3_ENDPOINT: "not a url" }, "S3_ENDPOINT"],
    [{ S3_ENDPOINT: "https://user:pass@minio.example.com" }, "S3_ENDPOINT"],
    [{ S3_ENDPOINT: "https://minio.example.com/?x=1" }, "S3_ENDPOINT"],
  ];
  for (const [over, variable] of cases) {
    const p = problem({ ...s3, ...over });
    expect(p, JSON.stringify(over)).toContain(variable);
    for (const secret of Object.values(over)) if (secret.length > 3) expect(p, `message repeats ${secret}`).not.toContain(secret);
    expect(p).not.toContain(SECRET);
    expect(p).not.toContain(KEY_ID);
  }
});

test("s3: a custom endpoint (MinIO) is accepted over https, or over http on this machine only, and makes a dotted bucket name fine", () => {
  const r = resolveStoreSettings({ ...s3, S3_ENDPOINT: "https://minio.example.com:9000/" });
  expect(r.ok && r.settings.name === "s3" && r.settings.s3.endpoint).toBe("https://minio.example.com:9000/");
  for (const local of ["http://127.0.0.1:9000", "http://localhost:9000", "http://[::1]:9000"])
    expect(resolveStoreSettings({ ...s3, S3_ENDPOINT: local }).ok, local).toBe(true);
  expect(resolveStoreSettings({ ...s3, S3_BUCKET: "with.dot", S3_ENDPOINT: "https://minio.example.com" }).ok).toBe(true);
});

test("r2: the endpoint comes from the account id, the region is auto, an explicit endpoint (EU jurisdiction) wins; the s3 variables are not read", () => {
  expect(resolveStoreSettings(r2)).toEqual({
    ok: true,
    settings: {
      name: "r2",
      s3: {
        bucket: "school-images",
        region: "auto",
        accessKeyId: KEY_ID,
        secretAccessKey: SECRET,
        endpoint: `https://${ACCOUNT}.r2.cloudflarestorage.com`,
      },
    },
  });
  const eu = resolveStoreSettings({ ...r2, R2_ACCOUNT_ID: undefined, R2_ENDPOINT: `https://${ACCOUNT}.eu.r2.cloudflarestorage.com` });
  expect(eu.ok && eu.settings.name === "r2" && eu.settings.s3.endpoint).toBe(`https://${ACCOUNT}.eu.r2.cloudflarestorage.com`);
  expect(resolveStoreSettings({ ...r2, R2_ACCOUNT_ID: ACCOUNT.toUpperCase() }).ok).toBe(true);
  expect(problem({ ...r2, R2_ACCOUNT_ID: undefined })).toContain("R2_ACCOUNT_ID");
  expect(problem({ ...r2, R2_ACCOUNT_ID: "not-an-account" })).toContain("R2_ACCOUNT_ID");
  expect(problem({ ...r2, R2_BUCKET: undefined })).toContain("R2_BUCKET");
  expect(problem({ ...r2, R2_ACCESS_KEY_ID: "x" })).toContain("R2_ACCESS_KEY_ID");
  // an environment that only has the S3 variables does not satisfy r2, and the other way round
  expect(problem({ ...s3, IMAGE_STORE: "r2" })).toMatch(/r2 storage needs/);
  expect(problem({ ...r2, IMAGE_STORE: "s3" })).toMatch(/s3 storage needs/);
});

test("an old image can name another store than IMAGE_STORE: it resolves from that store's own variables", () => {
  const both = { ...s3, ...r2 }; // IMAGE_STORE is "r2" (the later spread)
  expect(resolveStoreSettings(both).ok && resolveStoreSettings(both).ok).toBe(true);
  const viaWhich = resolveStoreSettings(both, "s3");
  expect(viaWhich.ok && viaWhich.settings.name).toBe("s3");
  expect(problem(r2, "s3")).toMatch(/s3 storage needs/); // the old store's variables were removed: its images cannot be read
});

test("getImageStore: throws StorageNotConfiguredError with no usable configuration, and caches one adapter per configuration", () => {
  const saved = { ...process.env };
  const clear = () => {
    for (const k of Object.keys(process.env)) if (/^(IMAGE_STORE|S3_|R2_|ALLOW_MEMORY_IMAGE_STORE)/.test(k)) delete process.env[k];
  };
  try {
    clear();
    resetImageStoresForTests();
    expect(() => getImageStore()).toThrow(StorageNotConfiguredError);
    Object.assign(process.env, s3);
    const a = getImageStore();
    expect(a.name).toBe("s3");
    expect(getImageStore()).toBe(a);
    process.env.S3_BUCKET = "other-bucket";
    expect(getImageStore()).not.toBe(a);
    clear();
    Object.assign(process.env, r2);
    expect(getImageStore().name).toBe("r2");
    expect(() => getImageStore("s3")).toThrow(StorageNotConfiguredError);
    try {
      getImageStore("s3");
    } catch (error) {
      expect((error as Error).message).not.toContain(SECRET);
    }
  } finally {
    clear();
    Object.assign(process.env, saved);
    resetImageStoresForTests();
  }
});

test("the memory store is one object for the whole process, even when the module is loaded a second time (Next can load it once per route)", () => {
  const saved = { ...process.env };
  try {
    Object.assign(process.env, { IMAGE_STORE: "memory", APP_ENV: "development" });
    const first = getImageStore();
    // a second, independent copy of the module, as a second route bundle would get
    const path = require.resolve("../../src/lib/storage/config");
    delete require.cache[path];
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loading a SECOND copy of the module is the whole point of this test
    const second = require(path) as typeof import("@/lib/storage/config");
    expect(second.getImageStore).not.toBe(getImageStore);
    expect(second.getImageStore()).toBe(first);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});
