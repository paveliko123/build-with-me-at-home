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
    laterIdea: { type: 'string', description: 'Waiting chat only: the idea in the person\'s latest answer, as a short change in their own words (e.g. "add a night mode with stars"). Leave it out when their answer has no idea for the app.' },
    stageComplete: { type: 'boolean' },
  },
  required: ['say', 'stageComplete'],
  propertyOrdering: ['say', 'question', 'cards', 'visualHtml', 'doc', 'techSummary', 'tooBig', 'laterIdea', 'stageComplete'],
} as const;
