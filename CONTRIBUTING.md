# Contributing

## Contributions are welcome

This is a small project maintained by one person in his spare time, and that is
exactly why an outside pair of eyes is worth a lot. **Finding a bug and writing
it down is a real contribution** — arguably the most useful one, because I only
ever use this on my own machine, with my own setup, and most of what is broken
is broken somewhere I never look.

Three ways to help, in the order of what they cost you:

### 1. Report something that is wrong

Open an issue with the **Bug report** template. It asks for what it does because
each field is something I would otherwise have to come back and ask for, which
costs us both a day.

What actually decides whether a report is useful:

- **What you expected, and what happened instead.** Both halves. "It does not
  work" is the one report I cannot act on.
- **The steps that get there.** If you can reproduce it, say how. If it only
  happened once, say that too — an intermittent bug is still worth knowing about,
  and "I could not reproduce it" is useful information rather than a
  disqualification.
- **Your setup**, as the template asks for it.

Do not polish it. A rough report today beats a perfect one that never gets
written. If in doubt whether something counts as a bug: open it. Deciding that
is my job, not yours.

### 2. Suggest something it should do

Open an issue with the **Feature request** template.

It asks what you are trying to *achieve* before what you want built, and that is
deliberate — not a hoop. Roughly half the time there turns out to be a simpler
answer than the one either of us had in mind, and it only surfaces if I know the
underlying situation.

A wish that gets declined is not a wasted issue. "Not now" and "not in this
project" are answers you will get quickly and with a reason.

### 3. Send a fix or a feature

Very welcome, and you do not need to ask permission for something small.

**For anything bigger than a few lines, open an issue first** — or comment on
the existing one — and say you are working on it. It costs you a sentence and
saves you the case where I fixed the same thing that evening, or where I would
have wanted it solved differently.

Because you cannot push to this repository, the route is through a fork:

```bash
# 1. Fork it on GitHub, then clone your fork
git clone https://github.com/<your-username>/linkedin-panel.git
cd linkedin-panel

# 2. A branch. Any name.
git switch -c fix/the-thing

# 3. Change what you came for, then run the checks below

# 4. Push to your fork and open the pull request
git push -u origin fix/the-thing
```

GitHub then offers you the pull request button. Fill in the template, and if it
closes an issue write `Fixes #12` so it closes itself on merge.

## What happens after you send it

1. **The pipeline runs** and posts a comment on your pull request with a table
   of what passed. It updates that same comment on every push, so there is one
   place to look rather than a growing pile.
2. **It labels the pull request** by size and type, and adds `ready-to-merge`
   once everything is green.
3. **On your very first contribution here, the checks wait for me to release
   them.** GitHub does that by default so that a stranger's code cannot use the
   runners unasked. If your pull request sits at "waiting for approval",
   **nothing is broken and you do not need to do anything** — I have to click
   once.
4. **I do the merging.** The default branch takes nothing that has not been
   through a pull request with green checks, and that holds for my own commits
   too.

If a check is red, the run log says which one and why. Ask in the pull request
if it is not obvious — a red pipeline is not a rejection, and quite often it is
the pipeline that is wrong rather than you.

I do this beside a job, so a reply can take a few days. It is not disinterest.

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

- Branch off `main` **in your fork** (see above). Any branch name is fine.
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
