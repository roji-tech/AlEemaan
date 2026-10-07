# 0.5.G (shared API infrastructure) mutation set: one injected bug each. Run with scripts/mutations/run-mutations.py.
# A mutation that SURVIVES means a missing or weak test — or an equivalent mutant (justify those in the phase record).
PAG = "src/lib/api/pagination.ts"
VAL = "src/lib/api/validate.ts"
ENV = "src/lib/api/envelope.ts"
CSRF = "src/lib/auth/csrf.ts"
PWN = "src/lib/auth/pwned-password.ts"
R_RESET = "src/app/api/v1/auth/reset-password/route.ts"
R_CHANGE = "src/app/api/v1/auth/change-password/route.ts"
R_SETUP = "src/app/api/v1/setup/route.ts"
TENV = "tests/support/env.ts"

U = "pnpm exec playwright test --project=unit --reporter=line "
U_API = U + "tests/unit/api-infrastructure.spec.ts"
U_CSRF = U + "tests/unit/csrf.spec.ts"
U_PWN = U + "tests/unit/pwned-password.spec.ts"
I_PWN = "pnpm exec playwright test --project=setup --project=integration --reporter=line tests/integration/breached-password-routes.spec.ts"
A_PWN = "pnpm exec playwright test --project=setup --project=api --reporter=line tests/api/breached-password.spec.ts"
A_CSRF = "pnpm exec playwright test --project=setup --project=api --reporter=line tests/api/csrf.spec.ts"
HTTPS = "pnpm exec playwright test --project=setup --project=https --reporter=line"

OFFSET_LIMIT = '''  if (limit < 1 || limit > maxLimit) issues.push({ path: "limit", message: `limit must be between 1 and ${maxLimit}.` });
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, page, limit, skip'''


def m(id, desc, edits, cmd, build=False):
    return dict(id=id, desc=desc, edits=edits, cmd=cmd, build=build)


MUTATIONS = [
    # --- pagination ---------------------------------------------------------------------------------------------------
    m("P1", "a repeated parameter is accepted (first value wins)", [(PAG, "if (all.length > 1) {", "if (false) {")], U_API),
    m("P2", "a signed number is accepted ('+2')", [(PAG, r"/^\d{1,9}$/.test(all[0])", r"/^[+]?\d{1,9}$/.test(all[0])")], U_API),
    m("P3", "a decimal is accepted ('2.5')", [(PAG, r"/^\d{1,9}$/.test(all[0])", r"/^\d{1,9}(\.\d+)?$/.test(all[0])")], U_API),
    m("P4", "a padded number is accepted (' 2')", [(PAG, r"/^\d{1,9}$/.test(all[0])", r"/^\s*\d{1,9}\s*$/.test(all[0])")], U_API),
    m("P5", "the limit cap is gone (offset)", [(PAG, OFFSET_LIMIT, OFFSET_LIMIT.replace(" || limit > maxLimit", ""))], U_API),
    m("P6", "limit 0 is accepted (offset)", [(PAG, OFFSET_LIMIT, OFFSET_LIMIT.replace("limit < 1", "limit < 0"))], U_API),
    m("P7", "page 0 is accepted", [(PAG, "if (page < 1 || page > MAX_PAGE)", "if (page < 0 || page > MAX_PAGE)")], U_API),
    m("P8", "no page ceiling", [(PAG, "if (page < 1 || page > MAX_PAGE)", "if (page < 1)")], U_API),
    m("P9", "skip is off by one page", [(PAG, "skip: (page - 1) * limit", "skip: page * limit")], U_API),
    m("P10", "hasNext is true on the last page", [(PAG, "hasNext: input.page < pages", "hasNext: input.page <= pages")], U_API),
    m("P11", "an empty list has 0 pages", [(PAG, "Math.max(1, Math.ceil(", "Math.max(0, Math.ceil(")], U_API),
    m("P12", "a non-canonical cursor timestamp is accepted", [(PAG, " || createdAt.toISOString() !== t", "")], U_API),
    m("P13", "no cursor length cap", [(PAG, "raw.length > MAX_CURSOR_LENGTH || ", "")], U_API),
    m("P14", "an empty cursor id is accepted", [(PAG, "id.length === 0 || id.length > 128", "id.length > 128")], U_API),
    m("P15", "the limit cap is gone (cursor)", [(PAG, '''  const limit = readInteger(params, "limit", issues) ?? defaultLimit;
  if (limit < 1 || limit > maxLimit) issues.push({ path: "limit", message: `limit must be between 1 and ${maxLimit}.` });

  let after''', '''  const limit = readInteger(params, "limit", issues) ?? defaultLimit;
  if (limit < 1) issues.push({ path: "limit", message: `limit must be between 1 and ${maxLimit}.` });

  let after''')], U_API),
    m("P16", "a repeated 'after' is accepted", [(PAG, "if (cursors.length > 1) issues.push", "if (false) issues.push")], U_API),
    m("P17", "an invalid cursor is silently ignored", [(PAG, '    if (!after) issues.push({ path: "after", message: "after is not a valid cursor." });\n', "")], U_API),
    m("P18", "the cursor query fetches `limit` rows, not limit+1", [(PAG, "take: limit + 1, after", "take: limit, after")], U_API),
    m("P19", "a next cursor is issued when the page is exactly full", [(PAG, "rows.length > limit && last", "rows.length >= limit && last")], U_API),
    # --- validate / envelope ------------------------------------------------------------------------------------------
    m("V1", "the real body size is not checked", [(VAL, "if (Buffer.byteLength(text) > MAX_BODY_BYTES)", "if (false)")], U_API),
    m("V2", "the declared content-length is not checked", [(VAL, "declared > MAX_BODY_BYTES", "false")], U_API),
    m("V3", "the raw body is passed on (unknown keys not stripped)", [(VAL, "body = result.data;", "body = json as B;")], U_API),
    m("V4", "no cap on the number of details", [(VAL, "error.issues.slice(0, MAX_DETAILS).map", "error.issues.map")], U_API),
    m("V5", "a repeated query parameter keeps only the first", [(VAL, "raw[key] = values.length === 1 ? values[0] : values;", "raw[key] = values[0];")], U_API),
    m("V6", "invalid JSON is reported as a validation error", [(VAL, 'fail("Invalid JSON body", 400, "INVALID_BODY")', 'fail("Invalid JSON body", 400, "VALIDATION")')], U_API),
    m("V7", "an error never carries its details", [(ENV, "...(details && details.length > 0 ? { details } : {})", "")], U_API),
    m("V8", "an empty details list is still emitted", [(ENV, "details && details.length > 0 ?", "details ?")], U_API),
    # --- CSRF ---------------------------------------------------------------------------------------------------------
    m("C1", "X-Forwarded-Host is trusted unconditionally", [(CSRF, "(trustForwardedHost() ? req.headers.get", "(true ? req.headers.get")], U_CSRF),
    m("C2", "Sec-Fetch-Site is ignored", [(CSRF, '  if (site !== null && site !== "same-origin" && site !== "none") return false;\n', "")], U_CSRF),
    m("C3", "Sec-Fetch-Site: same-site is accepted", [(CSRF, 'site !== "same-origin" && site !== "none")', 'site !== "same-origin" && site !== "none" && site !== "same-site")')], U_CSRF),
    m("C4", "Sec-Fetch-Site: none is refused", [(CSRF, 'site !== "same-origin" && site !== "none")', 'site !== "same-origin")')], U_CSRF),
    m("C5", "the Referer fallback is ignored", [(CSRF, "if (referer) {", "if (false) {")], U_CSRF),
    m("C6", "no Origin and no Referer is accepted", [(CSRF, "    }\n  }\n\n  return false;\n}\n", "    }\n  }\n\n  return true;\n}\n")], U_CSRF),
    m("C7", "the port is ignored when comparing Origin with Host", [(CSRF, "return new URL(origin).host === host;", "return new URL(origin).hostname === host.split(\":\")[0];")], U_CSRF),
    m("C8", "any non-empty TRUST_FORWARDED_HOST ('false') turns trust on", [(CSRF, 'process.env.TRUST_FORWARDED_HOST === "true"', "Boolean(process.env.TRUST_FORWARDED_HOST)")], U_CSRF),
    m("C9", "an unparseable Origin is accepted", [(CSRF, "    } catch {\n      return false;\n    }\n  }\n\n  const referer", "    } catch {\n      return true;\n    }\n  }\n\n  const referer")], U_CSRF),
    m("C10", "the HTTPS test server stops trusting the proxy's X-Forwarded-Host", [(TENV, '{ ...serverEnv(HTTPS_URL), TRUST_FORWARDED_HOST: "true" }', "{ ...serverEnv(HTTPS_URL) }")], HTTPS),
    # --- breached-password check --------------------------------------------------------------------------------------
    m("W1", "the FULL hash is sent, not the 5-character prefix", [(PWN, "`${base}${prefix}`", "`${base}${sha1}`")], U_PWN),
    m("W2", "padding is not requested", [(PWN, '"Add-Padding": "true", ', "")], U_PWN),
    m("W3", "an error status fails CLOSED (reports breached)", [(PWN, "if (!res.ok) return false;", "if (!res.ok) return true;")], U_PWN),
    m("W4", "a network error fails CLOSED", [(PWN, "  } catch {\n    return false;\n  } finally", "  } catch {\n    return true;\n  } finally")], U_PWN),
    m("W5", "a padding row (count 0) counts as a match", [(PWN, " && Number(count) > 0", "")], U_PWN),
    m("W6", "matching is case-sensitive", [(PWN, "candidate?.toUpperCase() === suffix", "candidate === suffix")], U_PWN),
    m("W7", "PWNED_PASSWORD_CHECK=off is ignored", [(PWN, 'if (process.env.PWNED_PASSWORD_CHECK === "off") return false;\n', "")], U_PWN),
    m("W8", "the timeout never aborts", [(PWN, "setTimeout(() => controller.abort(), ", "setTimeout(() => undefined, ")], U_PWN),
    m("W9", "the shape rules are skipped before the breach check", [(PWN, "  if (problem) return problem;\n", "")], U_PWN),
    m("W10", "reset does not check for a breached password", [(R_RESET, 'import { checkNewPasswordOnServer } from "@/lib/auth/pwned-password";', 'import { checkNewPassword as checkNewPasswordOnServer } from "@/lib/auth/password-policy";')], I_PWN),
    m("W11", "change does not check for a breached password", [(R_CHANGE, 'import { checkNewPasswordOnServer } from "@/lib/auth/pwned-password";', 'import { checkNewPassword as checkNewPasswordOnServer } from "@/lib/auth/password-policy";')], I_PWN),
    m("W12", "setup does not check for a breached password", [(R_SETUP, "if (await isBreachedPassword(password)) {", "if (false) {")], I_PWN),
    m("W13", "change charges the password-attempt budget for a refused (breached) password", [(R_CHANGE, "    await refundAttempt(key); // they proved who they are; a weak new password isn't an attack\n", "")], A_PWN, build=True),
    m("W14", "the breach-check test server has the check switched off", [(TENV, 'PWNED_PASSWORD_CHECK: "on", PWNED_PASSWORD_URL', 'PWNED_PASSWORD_CHECK: "off", PWNED_PASSWORD_URL')], A_PWN),
]
