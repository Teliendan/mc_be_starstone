// Load the Starstone DIAG pack against the mock server: fire startup + worldLoad, run timers and jobs, fake a 3 s freeze inside a job step and a
// 40 ms promise continuation, and check that the wrapper names them.
// Usage: node tools/diag/load_test.mjs <out dir holding starstone_bp>   (prints "ASSERTS OK" on success, exit code 1 otherwise)
import path from "node:path";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
register("./mock/hooks.mjs", import.meta.url); // "@minecraft/server" -> ./mock/server.mjs (the module imported below)
const { subs, intervals, timeouts, jobs, chat, system } = await import("./mock/server.mjs");
if (!process.argv[2]) { console.error("usage: node load_test.mjs <out dir>"); process.exit(2); }
const outDir = path.resolve(process.argv[2]);
const errors = [], warns = [];
console.error = (m) => errors.push(String(m)); console.warn = (m) => warns.push(String(m));
const scripts = pathToFileURL(path.join(outDir, "starstone_bp/scripts/")).href;
await import(scripts + "main.js");
const comps = {};
const reg = { registerCustomComponent: (n, c) => { comps[n] = c; } };
for (const cb of subs["system.before.startup"] ?? []) cb({ blockComponentRegistry: reg, itemComponentRegistry: reg, customCommandRegistry: { registerCommand() {}, registerEnum() {} } });
const realNow = Date.now; let clock = 1e12; Date.now = () => clock;
for (const cb of subs["after.worldLoad"] ?? []) cb({});
// The engine runs microtasks right after each callback returns: flush after every call, before the fake clock moves on.
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const tick = async () => { system.currentTick++; clock += 50; for (const [fn, n] of intervals) if (system.currentTick % n === 0) { try { fn(); } catch (e) { errors.push("interval: " + e); } await flush(); } };
for (let i = 0; i < 5; i++) await tick();

// A job step that "takes" 3 s: timed through the wrapped system.runJob and named as the slowest single call.
const { __diagSystem } = await import(scripts + "diag_wrap.js");
const probeSystem = __diagSystem("slice_probe.js");
probeSystem.runJob((function* () { yield; clock += 3000; yield; })());
for (const g of jobs.splice(0)) { for (;;) { const r = g.next(); await flush(); if (r.done) break; } await tick(); }
// A job step whose resolved promise has a continuation that "takes" 40 ms: named "... +continuations".
let release;
const pending = new Promise((resolve) => { release = resolve; });
pending.then(() => { clock += 40; });
probeSystem.run(() => { release(); });
for (const cb of timeouts.splice(0)) { cb(); await flush(); }
await tick();
// engine freeze: 2.5 s with no script work
clock += 2500; await tick(); await tick(); await tick();
// 20 more gaps of 200 ms and the minute summary
for (let i = 0; i < 20; i++) { clock += 200; await tick(); }
clock += 60000; await tick(); await tick();
Date.now = realNow;
console.log("components:", Object.keys(comps).length, "intervals:", intervals.length);
console.log("errors:\n " + errors.join("\n "));
console.log("warns:\n " + warns.slice(0, +(process.env.WARNS ?? 4)).join("\n "));
console.log("chat:", chat.slice(0, 6));
const sums = chat.filter((c) => /\] min \d+:/.test(c));
const bad = [];
if (!sums.length) bad.push("no summary");
const real = errors.filter((e) => !/DIAG\] FREEZE/.test(e));
if (real.length) bad.push(`errors during load: ${real.slice(0, 2).join(" / ")}`);
if (!warns.some((w) => /diagnostic build loaded:.*\d+\/\d+ custom components/.test(w))) bad.push("no load line");
if (![...warns, ...errors].some((w) => /FREEZE 3\d\d\d ms.*slowest single call slice_probe\.js runJob 3000 ms/.test(w))) bad.push("the 3 s job step is not named as the slowest single call");
if (!warns.some((w) => /slow callback slice_probe\.js runJob 3000 ms/.test(w))) bad.push("no immediate log of the slow job step");
if (!warns.some((w) => /slow callback slice_probe\.js run \+continuations 4\d ms/.test(w) || /slice_probe\.js run \+continuations/.test(w))) bad.push("the promise continuation is not timed");
if (!/gaps >=150: [1-9]/.test(sums.at(-1) ?? "")) bad.push("last summary has no gaps");
if (chat.filter((c) => /\] (gap|freeze) /.test(c)).length > 5 * sums.length) bad.push("too many immediate lines");
console.log(bad.length ? "FAIL: " + bad.join("; ") : "ASSERTS OK");
if (bad.length) process.exitCode = 1;
