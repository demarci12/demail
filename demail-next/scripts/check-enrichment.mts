// Waterfall order and consensus logic with fake providers; no network.
import { runWaterfall, type Found, type WaterfallProvider } from "../src/lib/enrichment/waterfall.ts";
import { decide } from "../src/lib/enrichment/consensus.ts";
import { cleanEmail, cleanPhone } from "../src/lib/enrichment/shared.ts";
import assert from "node:assert/strict";

const person = { firstName: "Ada", lastName: "Lovelace", company: "Acme", domain: "acme.com" };
const log: string[] = [];
let budget = Infinity;
const fake = (label: string, fields: ("email" | "phone")[], answer: Found | "throw"): WaterfallProvider => ({
  label,
  fields,
  reserve: async () => (budget-- > 0),
  find: async () => {
    log.push(label);
    if (answer === "throw") throw new Error("boom");
    return answer;
  },
});

// First provider with an answer stops the chain for that field.
let r = await runWaterfall([fake("a", ["email"], { email: "ada@acme.com" }), fake("b", ["email"], { email: "other@acme.com" })], person, ["email"]);
assert.deepEqual(log, ["a"]);
assert.deepEqual(r.found.email, { value: "ada@acme.com", source: "a" });
assert.equal(r.calls, 1);

// Nothing found moves on, in list order; a failing provider counts and moves on.
log.length = 0;
r = await runWaterfall([fake("a", ["email"], {}), fake("b", ["email"], "throw"), fake("c", ["email", "phone"], { email: "x@acme.com", phone: "+36 1 234 5678" })], person, ["email", "phone"]);
assert.deepEqual(log, ["a", "b", "c"]);
assert.equal(r.failures, 1);
assert.equal(r.found.phone?.source, "c");

// A provider that cannot supply a wanted field is not called; one that already found everything ends the chain.
log.length = 0;
r = await runWaterfall([fake("mail-only", ["email"], { email: "a@acme.com" }), fake("both", ["email", "phone"], { phone: "+3612345678" })], person, ["phone"]);
assert.deepEqual(log, ["both"]);
log.length = 0;
r = await runWaterfall([fake("both", ["email", "phone"], { email: "a@acme.com", phone: "+3612345678" }), fake("later", ["email", "phone"], {})], person, ["email", "phone"]);
assert.deepEqual(log, ["both"]);

// The cap stops the run before another call is made.
log.length = 0;
budget = 1;
r = await runWaterfall([fake("a", ["email"], {}), fake("b", ["email"], { email: "z@acme.com" })], person, ["email"]);
assert.deepEqual(log, ["a"]);
assert.equal(r.capped, true);
assert.equal(r.found.email, undefined);
budget = Infinity;

// Consensus.
assert.equal(decide("valid", ["valid", "valid"])?.status, "valid");
assert.equal(decide("valid", ["valid", "catch_all"])?.status, "risky");
assert.equal(decide("valid", ["valid", "catch_all"])?.catchAll, true);
assert.equal(decide("valid", ["valid", "invalid", "valid"])?.status, "risky");
assert.equal(decide("valid", ["invalid", "invalid"])?.status, "invalid");
assert.equal(decide("valid", ["valid", "unknown"]), null, "one conclusive vote is not consensus");
assert.equal(decide("valid", ["unknown", "unknown", "unknown"]), null);
assert.equal(decide("invalid", ["valid", "valid", "valid"]), null, "built-in invalid is never upgraded");
assert.equal(decide("risky", ["valid", "valid"])?.status, "risky", "built-in risky never becomes valid");
assert.equal(decide("unknown", ["valid", "valid"])?.status, "valid");
assert.equal(decide("valid", ["valid", "valid", "valid"])?.votes, 3);

// Value cleaning.
assert.equal(cleanEmail(" Ada@Acme.com "), "ada@acme.com");
assert.equal(cleanEmail("email_not_unlocked@domain.com"), null);
assert.equal(cleanEmail("a b@c.com"), null);
assert.equal(cleanEmail("<script>@x.com"), null);
assert.equal(cleanPhone("+36 1 234 5678"), "+36 1 234 5678");
assert.equal(cleanPhone("123"), null);
assert.equal(cleanPhone("call me"), null);
console.log("enrichment logic ok");
