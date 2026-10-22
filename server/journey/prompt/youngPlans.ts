// Kids' and teens' Idea, Design and Tech plans (owner yes D-5, 2026-10-22). The course templates
// are for adults in a hackathon; in 10 real kid and teen projects their extra sections came out
// "not discussed", stock lines or empty (stack, file structure, user stories, "why it matters"…).
// These keep the sections the plans actually fill and the builder uses. Headings stay plain, so
// the plan card (web/src/kid/journey/lib/planSummary.ts) still finds its points.
// Adults keep the course templates.

const RULES = `<!-- Kids' and teens' version of this plan. Short and plain. Use only these sections, in this order.
     A section with nothing the person said or chose, and no technical decision of yours, is left out.
     Never write "not discussed". -->`;

export const YOUNG_SCOPE_TEMPLATE = `---
doc: scope
status: draft
---
${RULES}

# [App name]

One line: what this is.

## What makes it special
The one thing this app does that makes it theirs, in their words.

## How it works
The few steps someone repeats while using it.

## Who it's for
Only if they said it's for someone besides themselves (a sibling, friends, the family).

## How we'll know it works
What they'll see or do that shows it works.

## Leaving out for now
Ideas they had that are bigger than one page, or that we chose to save for later. Only real ones, one list.

## Open questions
Things still to decide in Design. Only if there are any.
`;

export const YOUNG_PRD_TEMPLATE = `---
doc: prd
status: draft
---
${RULES}

# [App name]: the Design plan

## How it works, step by step
The main trip through the app from opening it to the fun part, as numbered steps.

## What you see
The screens or parts of the page, and what's on each.

## The look
The look they picked: colors, style, mood, in their words.

## What it does
Each thing the app does, with its details (what happens when you tap, what changes, sounds, scores).

## When something's empty or goes wrong
Only what applies: the first time it's opened, nothing saved yet, a wrong answer, the end of a game.

## Choices you made
The choices they made and why, in a line each.

## Leaving out for now
Only real cuts or ideas saved for later.

## Open questions
Only if any remain. At the "new to this" level, decide small details yourself instead and say so under "Choices you made".
`;

export const YOUNG_SPEC_TEMPLATE = `---
doc: spec
status: draft
---
${RULES}
<!-- Every app here is one web page in one file that runs in the browser; don't write a stack,
     file structure, hosting or outside-services section. -->

# [App name]: the Tech plan

## How it works, in plain words
A few sentences anyone could follow.

## A trip through the app
What happens behind the scenes at each step of the Design plan's "How it works".

## The look
The chosen look carried forward: colors, fonts, style, anything visual to get right.

## The pieces
The parts of the page and what each one does.

## What it remembers
What it keeps on this device between visits (lists, progress, scores, settings), or "nothing".

## What could go wrong
Things to handle so it doesn't break or confuse: empty states, fast tapping, the end of a game, small screens.

## Choices I made
Your technical choices and simplifications, each in plain words with a short reason.

## Open questions
Only if any remain.
`;
