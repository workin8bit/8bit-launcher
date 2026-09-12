/**
 * D11 Contract Test Helpers — shared assertions for Adapter Contract suite
 * Same suite runs against Fake* and Real* — ensures contract preservation
 */

import assert from "node:assert/strict";

export function assertResult<T>(r: unknown, path: string): void {
  assert.equal(typeof r, "object", `${path} should be object`);
  assert.ok(r !== null && "success" in (r as object), `${path} should have success`);
  const res = r as { success: boolean };
  if (res.success) {
    assert.ok("data" in (r as object), `${path} success should have data`);
  } else {
    const err = r as { success: false; error: unknown };
    assert.ok(err.error !== null && typeof err.error === "object", `${path} failure should have error object`);
    const e = err.error as { code: string; messageKey: string };
    assert.ok(typeof e.code === "string" && e.code.length > 0, `${path} error.code should be string`);
    assert.ok(typeof e.messageKey === "string" && e.messageKey.length > 0, `${path} error.messageKey should be string`);
  }
}

export function assertNoAnyFile(content: string, file: string): void {
  assert.ok(!/:\s*any\b/.test(content) || content.includes("allow-any"), `${file} should not contain : any`);
}

export async function runSuite(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
  } catch (e) {
    console.log(`  ❌ ${name}`);
    throw e;
  }
}
