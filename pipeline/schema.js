// Deep-dive schema — 12 sections matching the target output quality.
// Passed to the LLM via json_object mode with schema embedded in the system prompt.

export const DEEP_DIVE_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string", description: "kebab-case-slug-of-headline" },
    headline: { type: "string", description: "Punchy, specific, informative headline (not clickbait)" },
    tldr: { type: "string", description: "Overview / TL;DR text" },
    region: { type: "string", enum: ["india", "global"] },
    simple_explanation: { type: "string", description: "In plain English explanation using simple analogies" },
    sections: {
      type: "array",
      description: "Analytical question-answer sections",
      items: {
        type: "object",
        properties: {
          question: { type: "string", description: "The analytical question ending in ?" },
          answer: { type: "string", description: "Verbatim answer to that question" },
          table: {
            type: "object",
            properties: {
              headers: { type: "array", items: { type: "string" } },
              rows: { type: "array", items: { type: "array", items: { type: "string" } } }
            },
            required: ["headers", "rows"]
          }
        },
        required: ["question", "answer"]
      }
    },
    strategic_assessment: { type: "string", description: "Verbatim answer to the final strategic/horizon question" },
    conclusion: { type: "string", description: "Optional conclusion summarizing the final thoughts" },
    facts_vs_claims: {
      type: "object",
      properties: {
        facts: { type: "array", items: { type: "string" } },
        claims: { type: "array", items: { type: "string" } }
      },
      required: ["facts", "claims"]
    },
    confidence_note: { type: "string", description: "Confidence notes details" },
    sources: {
      type: "array",
      items: {
        type: "object",
        properties: {
          outlet: { type: "string" },
          desk: { type: "string" },
          lean: { type: "string", enum: ["left", "center", "right"] },
          region: { type: "string", enum: ["india", "global"] },
          title: { type: "string" },
          url: { type: "string" }
        },
        required: ["outlet", "desk", "lean", "region", "title", "url"]
      }
    }
  },
  required: ["id", "headline", "tldr", "region", "simple_explanation", "sections", "strategic_assessment", "facts_vs_claims", "confidence_note", "sources"]
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
