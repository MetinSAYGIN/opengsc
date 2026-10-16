import assert from "node:assert/strict";
import test from "node:test";
import { classifyGscFailure, isGscQuotaError } from "./gscFailure";

test("quota errors are recognized by code, status and Google's prose", () => {
  assert.equal(isGscQuotaError({ code: 429 }), true);
  assert.equal(isGscQuotaError({ status: 429 }), true);
  assert.equal(isGscQuotaError({ code: 403, message: "Quota exceeded" }), true);
  assert.equal(isGscQuotaError({ message: "Loading cost is too high" }), true);
  assert.equal(isGscQuotaError({ message: "Request rate limit exceeded" }), true);
});

test("unrelated failures do not read as quota", () => {
  assert.equal(isGscQuotaError({ code: 401, message: "Invalid Credentials" }), false);
  assert.equal(isGscQuotaError({ code: 403, message: "insufficient permissions" }), false);
  assert.equal(isGscQuotaError(new Error("socket hang up")), false);
  assert.equal(isGscQuotaError(undefined), false);
});

test("classifyGscFailure splits quota from everything else", () => {
  assert.equal(classifyGscFailure({ code: 429 }), "quota");
  assert.equal(classifyGscFailure({ message: "daily quota exceeded" }), "quota");
  assert.equal(classifyGscFailure({ code: 401 }), "unreachable");
});
