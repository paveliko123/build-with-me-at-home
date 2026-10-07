// spec.md > Reply Format: the JSON shape Gemini must return from guideTurn.

export const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    say: { type: 'string', description: "What the guide says, conversational and short." },
    question: { type: 'string', description: 'The one question being asked now, shown big on a card.' },
    cards: {
      type: 'array',
      description: 'Answer suggestions, only when the guidance dial allows them.',
      maxItems: 4,
      items: {
        type: 'object',
        properties: {
          emoji: { type: 'string' },
          label: { type: 'string' },
          detail: { type: 'string' },
        },
        required: ['emoji', 'label'],
      },
    },
    visualHtml: { type: 'string', description: 'Optional self-contained HTML picture or mock-up (inline CSS/SVG/emoji, under 6 KB).' },
    doc: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['learner-profile', 'scope', 'prd', 'spec', 'checklist', 'app-map'] },
        markdown: { type: 'string' },
        status: { type: 'string', enum: ['draft', 'approved'] },
      },
      required: ['kind', 'markdown', 'status'],
    },
    techSummary: { type: 'string' },
    tooBig: { type: 'boolean' },
    buildSteps: {
      type: 'array', maxItems: 6,
      description: 'Tech plan stage, with techSummary when you finish the stage: 4 to 6 parts of the app in the person\'s own words, in build order.',
      items: {
        type: 'object',
        properties: {
          step: { type: 'string', description: 'The part in their words, e.g. "the rocket" or "the scoreboard".' },
          word: { type: 'string', description: 'One short English word the code will likely use for it, e.g. "rocket" or "score".' },
          kind: { type: 'string', enum: ['look', 'drawing', 'rules', 'tap', 'move', 'sound', 'memory'] },
        },
        required: ['step', 'word', 'kind'],
      },
    },
    appEmojis: { type: 'array', maxItems: 6, items: { type: 'string' }, description: 'When the app idea is clear or changes (from the end of the Idea stage on): 4 to 6 single emojis that fit the app (its main character, object or mood), best first.' },
    laterIdea: { type: 'string', description: 'Waiting chat only: the idea in the person\'s latest answer, as a short change in their own words (e.g. "add a night mode with stars"). Leave it out when their answer has no idea for the app.' },
    stageComplete: { type: 'boolean' },
  },
  required: ['say', 'stageComplete'],
  propertyOrdering: ['say', 'question', 'cards', 'visualHtml', 'doc', 'techSummary', 'tooBig', 'buildSteps', 'appEmojis', 'laterIdea', 'stageComplete'],
} as const;
