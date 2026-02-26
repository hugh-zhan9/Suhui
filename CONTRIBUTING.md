# Contributing to FreeFolo

Thanks for contributing. This repository is currently **desktop-only** and focused on a local-first RSS reader workflow.

## Getting Started

Before you start contributing, please ensure you have enabled [Corepack](https://nodejs.org/api/corepack.html). Corepack ensures you are using the correct version of the package manager specified in the `package.json`.

```sh
corepack enable && corepack prepare
```

### Installing Dependencies

To install the necessary dependencies, run:

```sh
pnpm install
```

## Development Setup

### Develop in Electron

From repository root:

```sh
pnpm --filter FreeFolo dev:electron
```

Or from `apps/desktop`:

```sh
pnpm run dev:electron
```

### Preview Build

```sh
pnpm --filter FreeFolo start
```

### Package Build

```sh
# Signed/normal path
pnpm --filter FreeFolo build:electron

# Unsigned path (recommended for local verification)
pnpm --filter FreeFolo build:electron:unsigned
```

## Contribution Guidelines

- Ensure your code follows the project's coding standards and conventions.
- Write clear, concise commit messages.
- Include relevant tests for your changes.
- Update documentation when behavior, command, or architecture changes.

## Documentation Rules

- `AI-CONTEXT.md` is the single source of truth for project context.
- `AGENTS.md`, `GEMINI.md`, `CLAUDE.md` are pointer files and must not carry independent rules.
- If packaging commands, runtime mode, or module layout changes, update at least:
  - `README.md`
  - `CONTRIBUTING.md`
  - `AI-CONTEXT.md`

## Community

Join our community to discuss ideas, ask questions, and share your contributions:

- [Discord](https://discord.gg/AwWcAQ7euc)
- [Twitter](https://x.com/intent/follow?screen_name=folo_is)

## License

By contributing to FreeFolo, you agree that your contributions will be licensed under the GNU Affero General Public License version 3, with the special exceptions noted in `README.md`.
