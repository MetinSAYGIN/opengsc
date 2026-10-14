# AI Visibility (AEO)

Site → **Visibility** tab. Does your site get **cited** when real people ask AI assistants questions? This is "Answer Engine Optimization".

The tab has these sub-tabs:

| Sub-tab | Question it answers | Cost |
|---|---|---|
| **AI answers** | For *my* questions, asked live today: am I cited, mentioned or absent, per engine? | Paid (your AI keys) |
| **LLM Mentions** | What have models actually been answering about my brand, including questions I never tracked? | Paid (DataForSEO) |
| **Share of voice** | How often am I named vs. my competitors, and which domains do AIs cite instead of me? | Free (replays stored answers) |
| **Mentions** | Was my brand mentioned in the news, on Wikipedia or Wikidata, with or without a link? | Free |
| **Yandex AI** | Which queries' Yandex AI answers already cite my site? | Keys.so credits |

## AI answers (the live tracker)

You add **questions**. OpenGSC asks each engine **with live web search on**, because an answer from a model's weights says nothing about search visibility.

| Engine | How it's asked | Key |
|---|---|---|
| ChatGPT | OpenAI Responses API + `web_search` | OpenAI key (Settings → AI models) |
| Claude | Anthropic Messages API + server-side web search | Anthropic key (Settings → AI models) |
| Gemini | `generateContent` + Google Search grounding | Gemini key (Settings → AI models) |
| Perplexity | Sonar (search built in) | Perplexity key (Settings → AEO & site health) |
| Grok | xAI Live Search | xAI key (Settings → AEO & site health) |
| Google AI Overviews | Your question goes through a real Google SERP; the overview's sources become citations | DataForSEO (SERP Advanced) or A-Parser |

You only need keys for the engines you want. The others are shown with a hint about what's missing.

**Verdicts** are three-state: **cited** (linked), **mentioned** (named, no link) and **absent**. AI Overviews has a fourth, **`no_overview`**: Google showed no overview for that question, which isn't the same as "not cited" and doesn't count in share-of-voice denominators.

**The check shows its work.** Expand a question to see the full answer, every cited domain (yours highlighted), your rank among them, the model that answered and whether a live search actually happened. If ChatGPT in another tab tells you something different, you can compare.

**"Cited instead of you"** lists the domains that keep appearing across your questions: the pages your answer has to displace. Each is classified into 12 categories (forums, social, video, reviews, reference, e-commerce, …) and page types (listicle, how-to, comparison, review…), with a dedicated **Reddit & communities** cut. The classifier is deterministic and free. An **"other: NN%"** chip warns when many citations go unclassified; extend the **Domain lists** (in the AI answers settings) with domains for your market. A Greek starter set ships built in.

**Per-site settings**: model, country, city and answer language. Location matters because local answers are geolocated.

**Sentiment**: for answers where you're cited or mentioned, one cheap model call rates the tone (positive / neutral / negative / mixed). It's off by default; run it with a button (price shown first) or turn on auto-assessment.

**Question ideas**: question-shaped queries from your own Search Console data, minus what you already track. Free.

### Cost and scheduling

Each question costs several billed calls on your keys per check (about four with all engines on). **Automatic daily checking is off by default**, so a big portfolio never enrols itself. **Check all** asks for confirmation.

## LLM Mentions (the index)

A **second source with a different job**. The live tracker asks *your* questions on *your* keys today. LLM Mentions reads **DataForSEO's index** of what ChatGPT and Google AI Overview have actually been answering:

- how often the brand comes up and in which questions;
- which of your pages get cited;
- **share of voice against up to 9 competitors**.

Match by domain (answers that linked to you) or by brand name (answers that named you without a link). The index refreshes roughly monthly and covers ChatGPT and AI Overview only. A zero here isn't evidence of invisibility in Claude or Perplexity. The two panels stay side by side and labelled rather than merged.

## Share of voice

Built from answers you already paid for, so it's free:

- how often each engine names you, your citation share, per-engine numbers and a weekly trend;
- up to 10 competitors. **Adding a competitor recomputes the whole history at no cost**;
- the domains AI actually cites for your questions, ranked. Each one is one click from your Outreach Workspace;
- question ideas mined from GSC.

## Mentions

Checks **Google News, Wikipedia and Wikidata** daily for your brand terms. These are free public sources. Add context words for ambiguous brand names (`mustInclude`). A mention without a link is the cheapest link-building lead there is: one click expands the news redirect, checks for a link and files the row into the Outreach Workspace. A daily summary can go to your notification channels (event `mention`).

## GEO Audit is different

[SEO Tools → GEO Audit](SEO-Tools#geo-audit) is a one-off deep dive into **one query**: which brands and source types an AI's search trace surfaces and why. The Visibility tab is ongoing tracking of many questions.

## MCP

`get_aeo_visibility`, `get_ai_share_of_voice`, `get_brand_mentions`, `get_yandex_ai_answers`. All are free reads of stored data.
