# Notes for AI agents

- **Installing OpenPlate for someone?** Follow [INSTALL.md](INSTALL.md) step by step.
- **Answering food, training or body questions from the data?** Read
  `docs/MEALS_AGENT.md` (or call `get_kitchen_guide` over MCP) first. In Claude
  Code, the `meals-assistant` skill in `.claude/skills` covers this.
- **Changing the code?** See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
  - Database changes go in a new file in `supabase/migrations/` (next
    timestamp, idempotent SQL). Never edit an applied migration's behaviour
    in a way that breaks re-running it.
  - Dates in SQL use `(now() at time zone public.meals_tz())::date`, never a
    hard-coded zone.
  - Agents write through the RPCs (`meals_agent_write`, `meals_agent_nutrition`,
    `meals_agent_fitness`, `meals_agent_supplements`, …), never raw table writes,
    so the app's sync rules apply.
  - When the snapshot or a tool changes, update `docs/MEALS_AGENT.md`,
    `api/mcp.js` and `api/_lib/meals.js` together.
  - Run `npm run lint` and `npm run build` before committing.
- Never commit `.env`, database passwords, access tokens or agent keys.
