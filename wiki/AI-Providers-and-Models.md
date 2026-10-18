# AI Providers and Models

Every AI feature in OpenGSC runs on **your own** API key, at your provider's price, with no markup. Keys live in **Settings → AI models**.

## Supported providers

| Provider | Notes |
|---|---|
| **Anthropic** (Claude) | Also used by AI Visibility (Claude engine) |
| **OpenAI** | Also used by AI Visibility (ChatGPT) and GEO Audit |
| **Google Gemini** | Also used by AI Visibility (Gemini) and GEO Audit |
| **OpenRouter** | Many models behind one key |
| **Cheaper Inference** | Low-cost relay. Billing errors can come back as `502` |
| **Z.AI** (GLM) | |
| **Kimi** (Moonshot AI) | |
| **Kie.ai** | Also a GEO Audit engine |
| **DeepSeek** | |
| **Qwen** (Alibaba Cloud) | |
| **Custom endpoint** | Any OpenAI-compatible API: base URL + key + model |

Each provider card fetches the **live model list** from the provider's API, so you choose from what your account can actually use.

Perplexity and xAI (Grok) keys are only used for AI Visibility and live in **Settings → AEO & site health**.

## Per-task models

Every AI job is a named **task**. Each task can use its own provider and model, or inherit the suite-wide default.

| Task | What it does | Default intent |
|---|---|---|
| **Structure (outline)** | Drafts H1/H2/H3 and what goes under each | best available |
| **Article text** | Body copy: articles, rewrite, humanize | best available |
| **Landing page** | Commercial page copy and wireframes | best available |
| **Content analysis** | Reads pages and SERPs, extracts findings | everyday |
| **Editorial policy** | Drafts policies from your brand pages | everyday |
| **QA judge** | Independent check that a finished article/outline is complete and publishable. Best set to a *different* model than the writer, because a same-model judge shares the writer's blind spots | everyday |
| **Utility passes** | Short mechanical passes whose output is parsed (e.g. GEO Audit's structured second pass) | cheap |
| **Domain history AI** | The Drops AI history verdict | cheap |
| **Publish respin** | Adapts a post for one platform before publishing | cheap |

Defaults aren't hard-coded model ids. They're intentions ("best available / everyday / cheap") resolved against your account's current model list, so they don't go stale when a provider ships a new generation.

**Which model runs?** The header of every SEO tool names the model that will run. Expand it to see each task the page performs, what it resolved to, and **which settings level the value came from** (task override, suite default, provider default). If an override seems to be ignored, check there first.

## Other settings on the same tab

- **Default model** for the suite, and the **custom OpenAI-compatible endpoint** card.
- **Fact-check**: auto fact-check when a text is opened (uses SERP quota), only for sections with facts, sources scraped per section, reuse of the competitor corpus.
- **Strip invisible AI marks** (on by default): zero-width spaces, bidi controls, soft hyphens, exotic spaces.
- **Page-mechanics check**: a deterministic check after writing (mixed-alphabet words, prices in the wrong market's currency…), with an optional one-call **repair**.
- **Hard-redact banned words**: replaces policy banned words with `[…]` for critical commercial pages.
- **Auto image prompts** when an article is opened (one cheap call).

## Costs and safety

- Only **Admin** and **Owner** roles can run paid AI actions.
- Every outbound call is recorded in **Settings → Provider log** with status and, where the provider reports it, cost.
- The MCP tools that call AI (`start_generation_job`, `start_rewrite_job`) refuse to run without `confirm: true`. For most tasks a connected agent can do the writing itself for free; see [MCP Server → Optimizing a page](MCP-Server#optimizing-a-page-for-free).

## When generation fails

Look in History. The job's error carries the provider's real reason: invalid key, exhausted quota, context length on a huge outline, or the provider's content-policy filter rejecting the topic. `pm2 logs opengsc` has the same information on lines starting with `[LLM]`.
