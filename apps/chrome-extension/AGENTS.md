# AGENTS

## Scope
These instructions apply to the 10x Chat Browser extension located in this directory.

## Development Workflow
- Use `bun run dev` for local development.
- Build distributables with `bun run build` and create zip archives with `bun run package`.
- Run unit tests with `bun run test`; use `bun run test:watch` or `bun run test:coverage` as needed.
- Typecheck with `bun run compile`.

## Code Style
- Follow WXT + React conventions; entrypoints live under `src/entrypoints/`, components and shared logic live under `src/`.
- Stick to Tailwind CSS utilities and shadcn-style components already present in the project.
- Keep TypeScript strict: no `any`, no `React.FC`, and align with current import sorting.
- Avoid adding comments unless explicitly requested by the user.

## Localization
- Localization files live in `public/_locales/` (and `locales/`). Keep translations synced when adjusting text.
