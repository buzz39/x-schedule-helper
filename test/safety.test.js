import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve("extension");

function javascriptFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...javascriptFiles(full));
    else if (full.endsWith(".js")) files.push(full);
  }
  return files;
}

const sources = javascriptFiles(root).map((file) => ({
  file,
  text: readFileSync(file, "utf8"),
}));

test("manifest stays on the minimum permission set", () => {
  const manifest = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual([...manifest.permissions].sort(), ["sidePanel", "storage"]);
  assert.deepEqual(manifest.host_permissions, ["https://x.com/*", "https://twitter.com/*"]);
  assert.deepEqual(manifest.content_scripts[0].matches, ["https://x.com/*", "https://twitter.com/*"]);
  assert.ok(manifest.description.length <= 132);
  assert.equal(manifest.optional_permissions, undefined);
  const serialized = JSON.stringify(manifest);
  assert.doesNotMatch(serialized, /all_urls|webRequest|cookies|identity|scripting|tabs/);
});

test("extension code does not call the network, X API, or posting controls", () => {
  const forbidden = [
    /\bfetch\s*\(/,
    /XMLHttpRequest/,
    /api\.twitter\.com/,
    /api\.x\.com/,
    /graphql/i,
    /document\.cookie/,
    /chrome\.cookies/,
    /chrome\.webRequest/,
    /chrome\.identity/,
    /chrome\.scripting/,
    /\.innerHTML/,
    /insertAdjacentHTML/,
    /innerHTML\s*=/,
    /insertHTML/,
    /tweetButton/,
    /SideNav_NewTweet/,
    /\beval\s*\(/,
    /new Function/,
  ];
  for (const source of sources) {
    for (const pattern of forbidden) {
      assert.equal(pattern.test(source.text), false, `${source.file} matched ${pattern}`);
    }
  }
});

test("content script and fill logic never click the page", () => {
  const watched = sources.filter((source) => /content\/compose\.js|lib\/(fill|handoff|page|plan)\.js$/.test(source.file));
  assert.ok(watched.length >= 4);
  for (const source of watched) {
    assert.doesNotMatch(source.text, /\.click\s*\(/, source.file);
  }
});
