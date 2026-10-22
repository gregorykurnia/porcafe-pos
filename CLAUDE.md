@AGENTS.md

# Workflow

- After making a code change, commit it and push to the remote automatically (no need to ask first). Write a commit message that clearly notes what changed and why.
- `main` deploys to the live POS, so before every push run `npm run typecheck`, `npx eslint <changed files>` and `npm test` (about a minute together). Fix anything the change broke before pushing. No Playwright or build per change. If `node_modules` is missing, run `npm ci` first.
