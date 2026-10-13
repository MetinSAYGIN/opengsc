// Per-engine run options for an AEO check. Kept apart from aeoTracker.ts (which pulls in
// Prisma) so the model choice can be unit-tested on its own.

import type { AeoEngine, AeoRunOptions } from "@/lib/seo/aeo";
import type { AeoCreds, AeoSiteConfig } from "@/lib/aeoTracker";

// Site.aeoModel is picked from the OpenAI model list, so it is a ChatGPT override only. It must
// never reach another provider: Claude or Gemini answer an OpenAI id with a 404, and every check
// on that engine fails. Every other engine gets its own model from Settings, or — left unset —
// its own default inside lib/seo/aeo.ts (`o.model || <ENGINE>_MODEL`).
export function engineRunOptions(engine: AeoEngine, cfg: AeoSiteConfig, creds: AeoCreds): AeoRunOptions {
  const { model: siteModel, ...shared } = cfg.options;
  const o: AeoRunOptions = { ...shared };
  switch (engine) {
    case "ai_overview":
      o.aio = creds.ai_overview ?? null;
      break;
    case "chatgpt":
      if (creds.chatgptBaseUrl) o.baseUrl = creds.chatgptBaseUrl;
      // Unset on both → callOpenAi falls back to AEO_DEFAULT_MODEL.
      if (siteModel || creds.chatgptModel) o.model = siteModel || creds.chatgptModel;
      break;
    case "claude":
      if (creds.claudeBaseUrl) o.baseUrl = creds.claudeBaseUrl;
      if (creds.claudeModel) o.model = creds.claudeModel;
      break;
    case "perplexity":
      if (creds.perplexityBaseUrl) o.baseUrl = creds.perplexityBaseUrl;
      if (creds.perplexityModel) o.model = creds.perplexityModel;
      break;
    case "grok":
      if (creds.grokBaseUrl) o.baseUrl = creds.grokBaseUrl;
      if (creds.grokModel) o.model = creds.grokModel;
      break;
    case "gemini":
      if (creds.geminiBaseUrl) o.baseUrl = creds.geminiBaseUrl;
      if (creds.geminiModel) o.model = creds.geminiModel;
      break;
  }
  return o;
}
