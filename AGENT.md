# AGENTS.md

## Project Overview
- This repository is for an Agent Security product.
- The target users are ordinary users and beginners, not advanced developers.
- The product helps users avoid damaging their local machine when using agent products such as OpenClaw or Hermes.
- The core promise is safety, clarity, and low cognitive load.

## Product Goal
- Help users deploy agents with a one-click or near one-click flow.
- Reduce fear that an agent may break the local machine, system settings, files, or development environment.
- Make the product feel safe enough for users who only understand simple installer flows.
- Present isolated execution as the default and recommended way to use agents.

## Primary User Mental Model
- Users do not want to understand containers, Linux internals, networking, or sandbox architecture.
- Users care about:
  - "Will this break my computer?"
  - "Can I undo it?"
  - "Is this running locally or in the cloud?"
  - "What permissions does it need?"
  - "If something goes wrong, how do I recover?"
- The UI and copy should optimize for reassurance, clear next steps, and explicit consequences.

## Product Modes
The product currently supports two safe usage directions:
1. Local isolated deployment:
   - Deploy agents such as OpenClaw into WSL2 Linux, not directly into the host Windows environment.
2. Cloud-hosted deployment:
   - Deploy agents such as OpenClaw or Hermes onto a cloud server and let the user access that environment remotely.

## Core Product Principles
- Isolation first:
  - Prefer isolated environments over direct host execution.
  - Never frame direct host installation as the normal or recommended path.
- Beginner-first UX:
  - Prefer one-click flows, simple decisions, and guided recovery.
  - Avoid exposing internal system concepts unless absolutely necessary.
- Trust through clarity:
  - Always make it clear where the agent is running.
  - Always make it clear what an action will change.
  - Always make it clear how to stop, rebuild, or delete an environment.
- Recoverability:
  - Dangerous or destructive actions must have confirmation and consequences explained.
  - The user should always have a visible recovery path.

## UX Rules
- Write for non-technical users by default.
- Avoid jargon such as container runtime, daemon, orchestration, mount, namespace, kernel, and similar low-level terms in user-facing copy unless there is no simpler wording.
- Prefer phrases like:
  - "isolated environment"
  - "safe runtime"
  - "separate Linux environment"
  - "cloud environment"
  - "rebuild environment"
  - "delete environment"
- Always distinguish clearly between:
  - retry
  - rebuild
  - delete
- Do not assume the user understands the difference unless the UI explains it.

## Architecture Expectations
- Router owns page flow and legal route transitions.
- XState owns environment actor behavior and action execution flow.
- Domain selectors are the only place to derive environment state, recommended actions, and summary state.
- UI components should not invent parallel business logic.

## Source Of Truth
- `deriveCheckSummary(checks)` is the only precheck aggregation entry.
- `deriveEnvironmentState(...)` is the only environment state derivation entry.
- `availableActions` and `recommendedAction` carry domain actions only.
- Page-fixed actions and domain actions must remain separate.

## Supported Product Concerns
Changes should preserve or improve these user-facing concerns:
- one-click install confidence
- environment safety messaging
- precheck clarity
- install progress clarity
- failure explanation
- recovery guidance
- permission transparency
- distinction between local WSL2 deployment and cloud deployment

## Integration Boundaries
- Do not hardcode backend behavior directly into pages.
- Keep `EnvironmentSnapshot` as the integration boundary for real backend/client state.
- Keep failure typing explicit.
- Keep room for:
  - WSL2-based local isolated runtime
  - cloud-hosted runtime
  - real permission request timing
  - real progress events
  - real health checks
  - real recovery signals

## Working Agreements
- Keep changes scoped and intentional.
- Preserve beginner-first product language.
- Do not optimize the UX for power users at the expense of beginners unless explicitly requested.
- Prefer guided flows over exposing raw controls.
- Ask before adding new dependencies.
- Ask before changing build, lint, or CI behavior.
- Add or update tests when changing state derivation, route legality, action contracts, or key user-facing flows.

## Commands
- Install: `npm install`
- Dev: `npm run dev`
- Build: `npm run build`
- Test: `npm run test`
- Lint: `npm run lint`

## Validation Expectations
- Run `npm run build` after meaningful implementation work.
- Run `npm run test` when domain logic, actions, routes, or key views change.
- Run `npm run lint` before considering the task complete.
- If a full validation pass is not run, explain what was skipped.

## Copy Priorities
When editing product copy, optimize for:
1. Safety
2. Simplicity
3. Reassurance
4. Explicit consequences
5. Recoverability

## Be Extra Careful About
- Any wording that may imply the agent runs directly on the host machine when it does not
- Any wording that weakens the "isolated environment" promise
- Any UI that hides destructive consequences
- Any change that makes retry / rebuild / delete feel interchangeable
- Any change that assumes developer knowledge

## OpenAI Docs
- Always use the OpenAI developer documentation MCP server if you need to work with the OpenAI API, ChatGPT Apps SDK, Codex without me having to explicitly ask.