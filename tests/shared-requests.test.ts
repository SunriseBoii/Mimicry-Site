import test from "node:test";
import assert from "node:assert/strict";
import { SharedRequests } from "../app/_photonic-skin/shared-requests";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

test("a foreground click joins an in-flight prewarm without duplicating it", async () => {
  const requests = new SharedRequests<object>();
  const ready = deferred<object>();
  let loads = 0;
  const load = () => { loads++; return ready.promise; };
  const prewarm = requests.run("shape", load);
  const click = requests.run("shape", load);
  const value = {};
  ready.resolve(value);
  assert.strictEqual(await prewarm, value);
  assert.strictEqual(await click, value);
  assert.equal(loads, 1);
});

test("cancelling one consumer does not cancel another consumer's geometry", async () => {
  const requests = new SharedRequests<number>();
  const ready = deferred<number>();
  let sharedSignal!: AbortSignal;
  const load = (signal: AbortSignal) => { sharedSignal = signal; return ready.promise; };
  const cancelled = new AbortController();
  const first = requests.run("shape", load, cancelled.signal);
  const second = requests.run("shape", load);
  await Promise.resolve();
  cancelled.abort();
  await assert.rejects(first, { name: "AbortError" });
  assert.equal(sharedSignal.aborted, false);
  ready.resolve(7);
  assert.equal(await second, 7);
});

test("obsolete work is aborted when its final consumer leaves; a new request can retry immediately", async () => {
  const requests = new SharedRequests<number>();
  const old = deferred<number>();
  let sharedSignal!: AbortSignal;
  const cancelled = new AbortController();
  const first = requests.run("shape", signal => { sharedSignal = signal; return old.promise; }, cancelled.signal);
  await Promise.resolve();
  cancelled.abort();
  await assert.rejects(first, { name: "AbortError" });
  assert.equal(sharedSignal.aborted, true);
  const next = deferred<number>();
  let loads = 0;
  const load = () => { loads++; return next.promise; };
  const second = requests.run("shape", load);
  old.resolve(1);
  await Promise.resolve();
  const third = requests.run("shape", load);
  next.resolve(2);
  assert.deepEqual(await Promise.all([second, third]), [2, 2]);
  assert.equal(loads, 1, "the obsolete completion deleted the replacement request");
});

test("failure and already-aborted callers do not poison future loads", async () => {
  const requests = new SharedRequests<number>();
  await assert.rejects(requests.run("shape", async () => { throw new Error("offline"); }), /offline/);
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(requests.run("shape", async () => assert.fail("must not run"), cancelled.signal), { name: "AbortError" });
  assert.equal(await requests.run("shape", async () => 3), 3);
});
