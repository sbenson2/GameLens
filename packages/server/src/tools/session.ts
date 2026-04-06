import {
  SessionState,
  createDefaultState,
  handleSessionAction,
  serializeState,
} from "../core/session.js";

// In-memory session state (persists across calls within a server instance)
let currentState: SessionState = createDefaultState();

export function handleSession(args: {
  action: string;
}): { content: Array<{ type: "text"; text: string }> } {
  const { output, state } = handleSessionAction(args.action, currentState);
  currentState = state;

  // Include serialized state as a note for the AI to save
  const stateNote = `\n\n---\n_Session state (save to .claude/session-state.md):_\n\`\`\`markdown\n${serializeState(currentState)}\`\`\``;

  return {
    content: [{ type: "text", text: output + stateNote }],
  };
}

export function getSessionState(): SessionState {
  return currentState;
}
