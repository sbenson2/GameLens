/**
 * MCP Elicitation — server-initiated structured forms.
 *
 * NOT YET SUPPORTED in @modelcontextprotocol/sdk@1.29.0.
 * When available, this will allow the server to request structured input
 * from the user via the AI client (e.g., a form with engine/genre/phase dropdowns).
 *
 * Planned schema for onboarding:
 * {
 *   engine: { type: "enum", values: ["godot", "monogame", "phaser"], label: "Game Engine" },
 *   genre: { type: "string", label: "Game Genre", placeholder: "e.g., roguelike, platformer" },
 *   skillLevel: { type: "enum", values: ["beginner", "intermediate", "advanced"], label: "Experience" },
 *   phase: { type: "enum", values: ["planning", "prototype", "production", "polish", "release"], label: "Dev Phase" },
 *   projectName: { type: "string", label: "Project Name", placeholder: "My Game" },
 * }
 *
 * When elicitation lands in the SDK, the `project hello` handler would call
 * server.elicit() to request this form instead of returning static text.
 */

export const ELICITATION_AVAILABLE = false;
