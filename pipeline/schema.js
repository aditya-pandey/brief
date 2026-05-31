// Nine-section deep-dive schema expressed as a JSON Schema object.
// Passed to Gemini via responseSchema + responseMimeType:"application/json"
// to force structured output — exactly what the Python pydantic models did.

export const DEEP_DIVE_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    tldr:     { type: "string" },
    situational_analysis: {
      type: "object",
      properties: {
        what:  { type: "string" },
        why:   { type: "string" },
        who:   { type: "string" },
        when:  { type: "string" },
        where: { type: "string" },
        how:   { type: "string" },
      },
      required: ["what","why","who","when","where","how"],
    },
    strategic_assessment: { type: "string" },
    perspective_matrix: {
      type: "object",
      properties: {
        left_leaning:  { type: "string", description: "How left-leaning outlets frame it" },
        center:        { type: "string", description: "How centrist outlets frame it" },
        right_leaning: { type: "string", description: "How right-leaning outlets frame it" },
        indian_media:  { type: "string", description: "How Indian media is covering it" },
        global_media:  { type: "string", description: "How global media is covering it" },
      },
      required: ["left_leaning","center","right_leaning","indian_media","global_media"],
    },
    facts_vs_claims: {
      type: "object",
      properties: {
        facts:  { type: "array", items: { type: "string" }, description: "Verifiable facts stated in coverage" },
        claims: { type: "array", items: { type: "string" }, description: "Opinions / assertions / unverified claims" },
      },
      required: ["facts","claims"],
    },
    blind_spot: { type: "string" },
    stakeholder_impact: {
      type: "array",
      items: {
        type: "object",
        properties: {
          stakeholder: { type: "string" },
          impact:      { type: "string" },
        },
        required: ["stakeholder","impact"],
      },
    },
    timeline: {
      type: "array",
      items: {
        type: "object",
        properties: {
          when:  { type: "string" },
          event: { type: "string" },
        },
        required: ["when","event"],
      },
    },
    confidence: {
      type: "object",
      properties: {
        level: { type: "string", description: "High / Medium / Low" },
        notes: { type: "string", description: "Why — source diversity, corroboration, transparency" },
      },
      required: ["level","notes"],
    },
  },
  required: [
    "headline","tldr","situational_analysis","strategic_assessment",
    "perspective_matrix","facts_vs_claims","blind_spot",
    "stakeholder_impact","timeline","confidence",
  ],
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
