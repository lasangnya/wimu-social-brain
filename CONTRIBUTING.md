# Contributing

Thanks for your interest in wimu-social-brain. Issues and pull requests are welcome.

## How the project is run

This project has a single maintainer ([@ShahriarBijoy](https://github.com/ShahriarBijoy)). `main` is protected:

- No one can push to `main` directly, including bots.
- All changes land through a pull request.
- Every PR needs CI to pass and an approving review from the maintainer (enforced via `CODEOWNERS`).
- Merges are squashed, so keep each PR focused on one thing.

## Before opening a PR

- For anything beyond a small fix, open an issue first so we can agree on the approach.
- Fork the repo and work on a branch in your fork.
- Run the tests: `npm install && npm test` (Node >= 20.9).
- Keep the PR small and self-contained. Unrelated changes will be asked to be split out.

## Commit and PR style

- Use conventional-commit style subjects, e.g. `fix(export): ...`, `feat(skills): ...`, `docs: ...`.
- Fill in the PR template. Link the related issue.

## What tends to get merged

- Bug fixes with a test.
- Clear documentation improvements.
- Features that were discussed in an issue first.

## What tends not to get merged

- Large refactors without prior discussion.
- Changes to the mascot/style defaults that aren't opt-in.
- New dependencies without a strong reason.

## Reporting security issues

See [SECURITY.md](SECURITY.md).

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
