# CrowdCampers

AI-gebouwde en AI-onderhouden campertripplanner. Beschrijf je trip in gewone taal, krijg een route met echte overnachtingsplekken (data: OpenStreetMap).

Dit hele project wordt gebouwd en onderhouden door Claude Code. Eén mens reviewt PR's.

## Setup (eenmalig, ~15 min)

1. **Repo**: push deze structuur naar GitHub.
2. **Secrets**: voeg `ANTHROPIC_API_KEY` toe onder Settings → Secrets → Actions.
   Stel in de Anthropic Console meteen een **maandelijks bestedingslimiet** in op de workspace, en gebruik straks een **aparte API-key voor de planner-Worker** (zodat je die los kunt intrekken en het verbruik kunt herleiden). Worst case is dan "planner offline", nooit een verrassingsrekening.
3. **GitHub App**: draai `/install-github-app` in een lokale Claude Code-sessie in deze repo (of installeer de Claude GitHub App handmatig).
4. **Actions**: check dat beide workflows zichtbaar zijn onder de Actions-tab. Let op: scheduled runs worden door GitHub toegeschreven aan de gebruiker die de cron het laatst wijzigde — commit de workflows dus vanaf je eigen account.
5. **Hosting** (kan later): Cloudflare Pages koppelen aan de repo, root = `site/`. De planner-Worker komt in een latere stap.
6. **Labels**: maak de labels `idee`, `bouwklaar` en `human` aan (Settings → Labels). Dit is de samenwerkingsbus tussen de agents.
7. **Branch protection** (aanrader): op `main` minimaal "require status checks". De reviewer-agent merget via `gh pr merge --auto`, dus checks blijven de poortwachter.

## Hoe het werkt na de setup

Jouw rol: open een issue met het "Idee"-template (twee zinnen is genoeg) en houd het label `human` in de gaten. De rest is de agents:

`idee` → product-agent schrijft een spec → `bouwklaar` → builder levert een PR → reviewer beoordeelt per risicoklasse en merget wat mag. Alles wat de planner-beschermingen, workflows, kosten of de grondregels raakt komt met label `human` bij jou terecht — dat is by design de enige wachtrij voor mensen.

## Eerste sessie

Open Claude Code in de repo-root en geef deze bootstrap-prompt:

> Read CLAUDE.md and all skills. Then, in this order, each as its own PR:
> 1. Generate the data pipeline scripts (data-pipeline skill) and do a first run for NL only, so we have real processed data to work with.
> 2. Build the landing page and planner page (site-builder skill), with the planner UI calling `/api/plan` and degrading gracefully while the Worker doesn't exist yet.
> 3. Generate `planner/worker.js` per the planner-api skill: Turnstile, rate limiting, input caps, caching and the kill switch are launch requirements, not later additions.

Daarna neemt het schedule het over.

## Structuur

Zie `CLAUDE.md` — dat is het contract waar elke agent-run zich aan houdt.

## Data & licentie

Plekkendata: © OpenStreetMap contributors, beschikbaar onder de [ODbL](https://opendatacommons.org/licenses/odbl/). Geen data van Park4Night, Campercontact of andere platforms.
