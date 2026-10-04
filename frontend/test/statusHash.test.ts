import test from "node:test";
import assert from "node:assert/strict";
import { statusHashId } from "../lib/statusHash.ts";

const base = "https://sportsdataverse.org/status#hoopR-nba-data";

test("bare and /status hashes resolve to the id", () => {
  assert.equal(statusHashId("#hoopR-nba-data", base), "hoopR-nba-data");
  assert.equal(statusHashId("/status#hoopR-nba-data", base), "hoopR-nba-data");
  assert.equal(statusHashId("/status/#red-workflows", base), "red-workflows");
  assert.equal(statusHashId("https://sportsdataverse.org/status#a%20b", base), "a b");
});

test("other pages, origins and empty hashes are ignored", () => {
  assert.equal(statusHashId("/packages#hoopR", base), null);
  assert.equal(statusHashId("https://example.com/status#x", base), null);
  assert.equal(statusHashId("/status", base), null);
  assert.equal(statusHashId("/status#", base), null);
  assert.equal(statusHashId("/status#%E0%A4%A", base), null);
});

test("the bare hash form depends on the current page", () => {
  assert.equal(statusHashId("#x", "https://sportsdataverse.org/packages"), null);
});
