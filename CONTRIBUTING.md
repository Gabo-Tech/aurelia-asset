# Contributing

Thanks for considering a contribution!

## Ground rules

- Be respectful — see [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).
- Keep changes focused. One concern per pull request.
- Match the existing code style (Prettier + ESLint enforced).
- Add or update translations for all 6 supported locales when you touch
  user-facing strings (see `src/i18n/locales/`).

## Development

```bash
npm ci          # or: bun install
cp .env.example .env   # optional for local dev
npm run dev
```

Run checks before opening a PR:

```bash
npm run lint
npm run typecheck
npm run build
```

## Licensing of your contribution

By submitting a pull request you agree that your contribution is
licensed under the **GNU Affero General Public License v3.0 or later**
(the project license) and that you grant GABO, the project maintainer, a
perpetual, worldwide, non-exclusive, royalty-free right to also
distribute your contribution under a separate commercial license.

This dual-licensing arrangement lets the project stay free for personal
and open-source use while remaining viable for commercial users who
cannot meet AGPL-3.0's obligations.

You confirm that:
- The contribution is your original work, or
- You have the right to submit it under the terms above.

If your employer has rights to your work, please make sure you have
permission to contribute before opening a PR.

## Reporting bugs

Open a GitHub issue with reproduction steps, expected vs actual
behaviour, and your environment (browser / OS / app version).

Security issues: see [`SECURITY.md`](./SECURITY.md) - do **not** open a
public issue.
