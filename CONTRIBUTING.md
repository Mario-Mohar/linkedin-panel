# Contributing

Thanks for taking the time. This is a small project, so the process is short.

## Getting set up

```bash
git clone https://github.com/Mario-Mohar/linkedin-panel.git
cd linkedin-panel
npm ci
npm run setup
```

Node 20 or newer. You do not need a LinkedIn account to work on this: the
repository ships example data, every test runs against fixtures, and the one
test that drives a real browser only checks that a blank page is correctly
detected as "not signed in".

## Running the checks

The pipeline runs exactly what you can run here:

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run
```

The browser test needs a real Chromium. If you have not got one:

```bash
npx playwright install --with-deps chromium
```

## The rule this project exists under

**It is read-only, and it stays read-only.** It signs in, reads your own posts
and metrics, and writes them to a local database. It never posts, likes,
comments, follows, connects, messages, or writes anything back to LinkedIn — and
it never touches anybody else's data. A pull request that adds a write path is
out of scope regardless of how it is framed, and so is anything that collects
another person's posts or profile.

This is not only an ethical line, it is what keeps the tool defensible under
LinkedIn's terms. Please do not ask for an exception.

**Everything stays local.** No telemetry, no analytics endpoint, no third-party
service. The data is the user's and it lives on their machine.

**Be gentle with the source.** Collection is paced deliberately. If you change
anything about how often or how fast it fetches, say so explicitly in the pull
request — that is the part most worth a second pair of eyes.

## Working on the code

`src/` and `tests/` mirror each other, so a change in `src/parser/` belongs with
a change in `tests/parser/`. New parsing code in particular should come with a
fixture: LinkedIn's markup changes without notice, and a fixture is what tells
you which of the two broke.

The dashboard's German and English strings live in `src/i18n/`. Both languages
are first class; a string added to one belongs in the other.

## Pull requests

- Branch off `main`. Any branch name is fine.
- Commit messages follow `fix(scope):`, `feat(scope):`, `docs:`, `chore:`.
  The pipeline reads the pull request title's prefix to label it.
- The pipeline comments the result and updates that comment on every push.
  Green plus not-a-draft gets a `ready-to-merge` label.
- Maintainers can ask for a deeper look with `/claude review`.

A bug fix that comes with the test that would have caught it is the ideal, not
the entry fee.

## Reporting something

Use the issue templates. **Never paste a session cookie, a password, or a
screenshot with your own or anybody else's real post content.** The bundled
example data is there precisely so bugs can be shown without real data.

## Licence

MIT, same as the project. By contributing you agree your work ships under it.
