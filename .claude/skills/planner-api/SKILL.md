---
name: planner-api
description: Build and maintain the planner API (Cloudflare Worker in planner/). Use for any task touching worker.js, the /api/plan endpoint, Turnstile, rate limiting, caching, or planner cost control. The protections in this skill are launch requirements, not nice-to-haves.
---

# Planner API

The Worker at `/api/plan` is the only public endpoint that spends money per request. It does not ship without ALL of the protections below. If a task would weaken one of them, stop and open an issue for the human instead.

## Required protections (in request order)

1. **Turnstile verification.** Every request carries a Cloudflare Turnstile token; the Worker verifies it server-side (`siteverify`) before anything else. Missing/invalid token → 403 with a friendly Dutch message. Secret lives in a Worker env var, never in the repo.
2. **Rate limit per IP**: max 3 plans per hour, 6 per day (Cloudflare rate limiting rules or Worker KV counter). Over the limit → 429 with "Je hebt je plannen voor nu even op — probeer het over een uurtje weer."
3. **Input caps**: trip description max 600 characters, rejected before any API call. No user text is ever placed in the system prompt — user input goes in the user turn only.
4. **Cache first.** Normalize the request (lowercase, trim, region + duration + key preferences) and check the cache (Worker Cache API or KV, TTL 7 days) before calling Claude. Identical trips are common; serve them for free.
5. **Small context, small model.** Only spots along the route corridor, only the schema fields the prompt uses, hard cap ~150 spots per request. Use the cheapest current Claude model that produces reliable JSON for this task (check the current lineup when building; do not default to a large model).
6. **Per-request guards**: `max_tokens` capped so one answer can never run away; one retry max on malformed JSON, then return a graceful error.
7. **Kill switch**: a `PLANNER_ENABLED` env var checked first thing. Off → 503 with a friendly message. This is the manual brake if costs spike.

## Outside the Worker (the human's checklist, document in README)

- Monthly spend limit on the API workspace in the Anthropic Console — the architectural worst case must be "planner offline", never a surprise bill.
- Separate API key for the planner (not the same key as the agent workflows), so usage is attributable and one key can be revoked without stopping the other.

## Behavior

- System prompt: `planner/PLANNER_PROMPT.md`, with the filtered spot JSON appended as context.
- Response: the planner JSON straight through to the client; the site renders it.
- Log per request (no personal data): timestamp, cache hit/miss, spot count, token usage from the API response. Weekly maintenance reads these to watch cost drift.
