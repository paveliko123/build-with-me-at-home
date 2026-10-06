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
    stageComplete: { type: 'boolean' },
  },
  required: ['say', 'stageComplete'],
  propertyOrdering: ['say', 'question', 'cards', 'visualHtml', 'doc', 'techSummary', 'tooBig', 'stageComplete'],
} as const;
