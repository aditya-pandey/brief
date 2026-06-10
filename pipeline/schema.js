// Deep-dive schema — 12 sections matching the target output quality.
// Passed to the LLM via json_object mode with schema embedded in the system prompt.

export const DEEP_DIVE_SCHEMA = {
  type: "object",
  properties: {
    headline:  { type: "string", description: "Punchy, specific, informative headline (not clickbait)" },
    tldr:      { type: "string", description: "2–3 sentence executive summary capturing the core development and why it matters" },

    situational_analysis: {
      type: "object",
      description: "Classic 5W1H breakdown — each field is a full, analytical paragraph",
      properties: {
        what:  { type: "string", description: "What happened — the specific development, not just the topic" },
        why:   { type: "string", description: "Why it matters — structural significance, not just immediate cause" },
        who:   { type: "string", description: "All key actors: primary actors, secondary brokers, institutions" },
        when:  { type: "string", description: "Timeline context — when this happened and how it fits the broader arc" },
        where: { type: "string", description: "Geographic and institutional context" },
        how:   { type: "string", description: "Mechanisms, methods, and processes at play" },
      },
      required: ["what","why","who","when","where","how"],
    },

    strategic_assessment: {
      type: "string",
      description: "2–4 paragraph analytical assessment of strategic implications — short-term risks, long-term consequences, power shifts, second-order effects. Write with the depth of a senior analyst briefing a decision-maker.",
    },

    perspective_matrix: {
      type: "object",
      description: "How different media ecosystems frame this story — each field is a full paragraph grounded in the sources",
      properties: {
        western_international: { type: "string", description: "How Western and international outlets frame the story" },
        indian_media:          { type: "string", description: "How Indian media is covering and framing the story" },
        left_leaning:          { type: "string", description: "How left-leaning publications frame it" },
        center:                { type: "string", description: "How centrist / moderate outlets frame it" },
        right_leaning:         { type: "string", description: "How right-leaning / pro-establishment outlets frame it" },
      },
      required: ["western_international","indian_media","left_leaning","center","right_leaning"],
    },

    facts_vs_claims: {
      type: "object",
      properties: {
        facts:  { type: "array", items: { type: "string" }, description: "Bullet list of independently verifiable facts stated in coverage" },
        claims: { type: "array", items: { type: "string" }, description: "Bullet list of contested assertions, opinions, or unverified claims" },
      },
      required: ["facts","claims"],
    },

    blind_spot: {
      type: "string",
      description: "One sharp paragraph identifying what the mainstream coverage is missing, underplaying, or getting wrong — a genuinely insightful angle that a sophisticated reader would want to know",
    },

    editorial_expert_insight: {
      type: "object",
      description: "Opinion and analytical layer beyond the news facts",
      properties: {
        opinion:  { type: "string", description: "What prominent columnists or public intellectuals are saying — the dominant editorial view" },
        analysis: { type: "string", description: "What institutional experts, strategists, or technical analysts conclude about the deeper mechanics at play" },
      },
      required: ["opinion","analysis"],
    },

    stakeholder_impact: {
      type: "array",
      description: "Who wins, who loses, who is at risk — be specific about sectors, communities, or nations",
      items: {
        type: "object",
        properties: {
          stakeholder: { type: "string" },
          impact:      { type: "string" },
        },
        required: ["stakeholder","impact"],
      },
    },

    context_background: {
      type: "string",
      description: "1–2 paragraphs of historical context and background that a reader needs to fully understand the significance of today's development",
    },

    timeline: {
      type: "array",
      description: "Chronological key events that led to today's development",
      items: {
        type: "object",
        properties: {
          when:  { type: "string" },
          event: { type: "string" },
        },
        required: ["when","event"],
      },
    },

    simple_explanation: {
      type: "string",
      description: "3–4 sentences explaining this story to a smart 16-year-old with no background — clear, vivid, no jargon",
    },

  },
  required: [
    "headline","tldr","situational_analysis","strategic_assessment",
    "perspective_matrix","facts_vs_claims","blind_spot",
    "editorial_expert_insight","stakeholder_impact","context_background",
    "timeline","simple_explanation",
  ],
};

// Used by the master recap table generated at the end of a day's run
export const RECAP_SCHEMA = {
  type: "object",
  properties: {
    rows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          front:             { type: "string", description: "Front number and short name e.g. '1: Iran War Milestone'" },
          primary_catalyst:  { type: "string" },
          core_threat:       { type: "string" },
          horizon:           { type: "string", description: "The most immediate next flashpoint or deadline" },
        },
        required: ["front","primary_catalyst","core_threat","horizon"],
      },
    },
  },
  required: ["rows"],
};

export const SELECTION_SCHEMA = {
  type: "object",
  properties: {
    stories: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title:           { type: "string", description: "Short, neutral working title for the story" },
          region:          { type: "string", description: "'india' or 'global'" },
          article_indices: {
            type: "array",
            items: { type: "integer" },
            description: "Indices into the candidate list of articles covering this story",
          },
        },
        required: ["title","region","article_indices"],
      },
    },
  },
  required: ["stories"],
};
