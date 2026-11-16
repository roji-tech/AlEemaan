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
const cloudinaryVars = {
  CLOUDINARY_NAME: "school-demo",
  CLOUDINARY_KEY: "123456789012345",
  CLOUDINARY_SECRET: "aBcDeFgHiJkLmNoPqRsTuVwXyZ0",
};
const cloudinary = { IMAGE_STORE: "cloudinary", ...cloudinaryVars };
// The single connection string of the earlier design: not read any more (task 0075).
const OLD_URL = "cloudinary://123456789012345:aBcDeFgHiJkLmNoPqRsTuVwXyZ0@school-demo";
const problem = (env: Record<string, string | undefined>, which?: string) => {
  const r = resolveStoreSettings(env, which);
  return r.ok ? null : r.problem;
};

test("nothing set, blank, or an unknown name: no store", () => {
  expect(problem({})).toMatch(/IMAGE_STORE is not set/);
  expect(problem({ IMAGE_STORE: "   " })).toMatch(/IMAGE_STORE is not set/);
  for (const name of [
    "gcs",
    "azure",
    "local",
    "disk",
    "cloudinary2",
    "cloudinary,s3",
    "s3,r2",
    "s3;",
    "../s3",
    "null",
    "undefined",
    "true",
    "\u0000",
  ])
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

test("cloudinary: the three variables resolve, whatever the case and spacing of the store name and the spacing of each value", () => {
  const ok = resolveStoreSettings(cloudinary);
  expect(ok).toEqual({
    ok: true,
    settings: {
      name: "cloudinary",
      cloudinary: { cloudName: "school-demo", apiKey: "123456789012345", apiSecret: "aBcDeFgHiJkLmNoPqRsTuVwXyZ0" },
    },
  });
  expect(resolveStoreSettings({ ...cloudinary, IMAGE_STORE: "cloudinry" }).ok).toBe(false); // a typo in the name: unknown, and no guessing
  expect(
    resolveStoreSettings({
      IMAGE_STORE: "  CLOUDinary ",
      CLOUDINARY_NAME: " school-demo ",
      CLOUDINARY_KEY: "123456789012345\n",
      CLOUDINARY_SECRET: "\taBcDeFgHiJkLmNoPqRsTuVwXyZ0 ",
    }),
  ).toEqual(ok); // case and spacing do not matter
});

test("cloudinary: a missing or blank variable is refused and named, and only the missing ones are named", () => {
  expect(problem({ IMAGE_STORE: "cloudinary" })).toBe("cloudinary storage needs CLOUDINARY_NAME, CLOUDINARY_KEY, CLOUDINARY_SECRET.");
  expect(problem({ ...cloudinary, CLOUDINARY_NAME: undefined })).toBe("cloudinary storage needs CLOUDINARY_NAME.");
  expect(problem({ ...cloudinary, CLOUDINARY_KEY: undefined })).toBe("cloudinary storage needs CLOUDINARY_KEY.");
  expect(problem({ ...cloudinary, CLOUDINARY_SECRET: undefined })).toBe("cloudinary storage needs CLOUDINARY_SECRET.");
  expect(problem({ ...cloudinary, CLOUDINARY_KEY: "  ", CLOUDINARY_SECRET: "" })).toBe(
    "cloudinary storage needs CLOUDINARY_KEY, CLOUDINARY_SECRET.",
  );
});

test("cloudinary: a malformed or over-long value is refused with its own variable named, and the value is never repeated", () => {
  const bad = (change: Record<string, string>) => problem({ ...cloudinary, ...change });
  // the cloud name: no space, dot, slash, colon, at sign, question mark or hash (so nothing can carry an option to the vendor's package), no leading hyphen, 2 to 63 characters
  for (const name of [
    "school demo",
    "school.demo",
    "school/demo",
    "school:demo",
    "school@demo",
    "school?upload_prefix=https://evil.example",
    "school#x",
    "-x",
    "x",
    "x".repeat(80),
    "school\u0000demo",
  ])
    expect(bad({ CLOUDINARY_NAME: name }), JSON.stringify(name)).toBe("CLOUDINARY_NAME is not a valid cloud name.");
  // the API key: 8 to 24 digits and nothing else
  for (const key of ["12345", "1234567890abcde", "1234 5678 9012", "-123456789012345", "1".repeat(30)])
    expect(bad({ CLOUDINARY_KEY: key }), JSON.stringify(key)).toBe("CLOUDINARY_KEY is not a valid API key.");
  // the API secret: 16 to 64 letters, digits, hyphens and underscores
  for (const secret of [
    "short",
    "aBcDeFgHiJkLmNoPqRsTuVwXyZ0:x",
    "aBcDeFgHiJkLmNoPqRsTuVwXyZ0@x",
    "aBcDeFgHiJkLm NoPqRsTuVwXyZ0",
    "a".repeat(80),
  ])
    expect(bad({ CLOUDINARY_SECRET: secret }), JSON.stringify(secret)).toBe("CLOUDINARY_SECRET is not a valid API secret.");
  // a value read from a file or a dashboard often ends in a newline: trimmed, not an error
  expect(bad({ CLOUDINARY_SECRET: `${cloudinaryVars.CLOUDINARY_SECRET}\n` })).toBeNull();
  // no message ever repeats a secret or a value
  const changes: Record<string, string>[] = [
    { CLOUDINARY_SECRET: "short" },
    { CLOUDINARY_KEY: "12345" },
    { CLOUDINARY_NAME: "school demo" },
  ];
  for (const change of changes) {
    const message = bad(change) ?? "";
    for (const value of [...Object.values(change), cloudinaryVars.CLOUDINARY_SECRET]) expect(message).not.toContain(value);
  }
});

test("cloudinary: CLOUDINARY_URL is not read, and cannot stand in for a missing variable", () => {
  expect(problem({ IMAGE_STORE: "cloudinary", CLOUDINARY_URL: OLD_URL })).toBe(
    "cloudinary storage needs CLOUDINARY_NAME, CLOUDINARY_KEY, CLOUDINARY_SECRET.",
  );
  expect(problem({ ...cloudinary, CLOUDINARY_SECRET: undefined, CLOUDINARY_URL: OLD_URL })).toBe(
    "cloudinary storage needs CLOUDINARY_SECRET.",
  );
  // and a stale one does not change what the three say
  const withStale = resolveStoreSettings({ ...cloudinary, CLOUDINARY_URL: "cloudinary://99999999:zzzzzzzzzzzzzzzzzzzz@other-cloud" });
  expect(withStale).toEqual(resolveStoreSettings(cloudinary));
});

test("cloudinary: the other stores' variables are not read, and an old image can name cloudinary while IMAGE_STORE names another store", () => {
  expect(problem({ ...s3, ...r2, IMAGE_STORE: "cloudinary" })).toMatch(/needs CLOUDINARY_NAME, CLOUDINARY_KEY, CLOUDINARY_SECRET/);
  const both = { ...s3, ...cloudinaryVars };
  expect(resolveStoreSettings(both).ok).toBe(true); // IMAGE_STORE=s3
  const viaWhich = resolveStoreSettings(both, "cloudinary");
  expect(viaWhich.ok && viaWhich.settings.name).toBe("cloudinary");
  expect(problem(s3, "cloudinary")).toMatch(/needs CLOUDINARY_NAME, CLOUDINARY_KEY, CLOUDINARY_SECRET/); // its variables were removed: its images cannot be read
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
    for (const k of Object.keys(process.env))
      if (/^(IMAGE_STORE|S3_|R2_|CLOUDINARY_|ALLOW_MEMORY_IMAGE_STORE)/.test(k)) delete process.env[k];
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
    clear();
    Object.assign(process.env, cloudinary);
    const c = getImageStore();
    expect(c.name).toBe("cloudinary");
    expect(getImageStore()).toBe(c);
    clear();
    Object.assign(process.env, r2);
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

test("getImageStore: a store that cannot be resolved says why in the server log, naming the variable and never a value, and a usable one logs nothing", () => {
  const saved = { ...process.env };
  const clear = () => {
    for (const k of Object.keys(process.env))
      if (/^(IMAGE_STORE|S3_|R2_|CLOUDINARY_|ALLOW_MEMORY_IMAGE_STORE)/.test(k)) delete process.env[k];
  };
  const logged: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void logged.push(args.map(String).join(" "));
  try {
    clear();
    resetImageStoresForTests();
    Object.assign(process.env, cloudinary, { CLOUDINARY_SECRET: "short" });
    expect(() => getImageStore()).toThrow(StorageNotConfiguredError);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain("CLOUDINARY_SECRET is not a valid API secret.");
    for (const value of ["short", cloudinaryVars.CLOUDINARY_NAME, cloudinaryVars.CLOUDINARY_KEY]) expect(logged[0]).not.toContain(value);
    // nothing set at all: still says why
    clear();
    expect(() => getImageStore()).toThrow(StorageNotConfiguredError);
    expect(logged).toHaveLength(2);
    expect(logged[1]).toContain("IMAGE_STORE is not set.");
    // a store that resolves does not log
    clear();
    Object.assign(process.env, cloudinary);
    expect(getImageStore().name).toBe("cloudinary");
    expect(logged).toHaveLength(2);
  } finally {
    console.error = original;
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
