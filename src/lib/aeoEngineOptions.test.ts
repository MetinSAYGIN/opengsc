// AEO per-engine model choice. The failure this pins is silent in the UI: the site model (an
// OpenAI id) used to be copied into every engine's options, so with no per-engine model in
// Settings every Claude and Gemini check came back "404 model: gpt-…" and those engines simply
// dropped out of share of voice.
import { test } from "node:test";
import assert from "node:assert/strict";

import { engineRunOptions } from "./aeoEngineOptions";
import type { AeoCreds, AeoSiteConfig } from "./aeoTracker";

const keys: AeoCreds = { chatgpt: "k", claude: "k", gemini: "k", perplexity: "k", grok: "k" };
const cfg = (model?: string): AeoSiteConfig => ({
  url: "example.com", brandTerms: [],
  options: { model, country: "us", city: null, language: "en" },
});

test("the site model never reaches a non-OpenAI engine", () => {
  const c = cfg("gpt-site");
  assert.equal(engineRunOptions("chatgpt", c, keys).model, "gpt-site");
  for (const e of ["claude", "gemini", "perplexity", "grok", "ai_overview"] as const) {
    assert.equal(engineRunOptions(e, c, keys).model, undefined, e);
  }
});

test("with no site model each engine takes its Settings model, else its own default", () => {
  const creds: AeoCreds = { ...keys, chatgptModel: "gpt-acct", claudeModel: "claude-x" };
  assert.equal(engineRunOptions("chatgpt", cfg(), creds).model, "gpt-acct");
  assert.equal(engineRunOptions("claude", cfg(), creds).model, "claude-x");
  // undefined → checkGemini / checkChatGpt fall back to their own defaults
  assert.equal(engineRunOptions("gemini", cfg(), creds).model, undefined);
  assert.equal(engineRunOptions("chatgpt", cfg(), keys).model, undefined);
});

test("the site model still wins over the account model for ChatGPT", () => {
  assert.equal(engineRunOptions("chatgpt", cfg("gpt-site"), { ...keys, chatgptModel: "gpt-acct" }).model, "gpt-site");
});

test("location and language stay shared; base URLs stay per engine", () => {
  const creds: AeoCreds = { ...keys, claudeBaseUrl: "https://proxy.example/anthropic" };
  const o = engineRunOptions("claude", cfg("gpt-site"), creds);
  assert.equal(o.country, "us");
  assert.equal(o.language, "en");
  assert.equal(o.baseUrl, "https://proxy.example/anthropic");
  assert.equal(engineRunOptions("gemini", cfg(), creds).baseUrl, undefined);
});

test("ai_overview gets the SERP supplier and nothing else", () => {
  const aio = { provider: "dataforseo" as const, dataForSeoKey: "x" };
  const o = engineRunOptions("ai_overview", cfg("gpt-site"), { ...keys, ai_overview: aio });
  assert.deepEqual(o.aio, aio);
  assert.equal(o.model, undefined);
});
