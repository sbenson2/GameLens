/**
 * Memory MCP tool — persistent project memory.
 *
 * SOURCE: MooBot archive
 * - Persistent memory.md that survives across all conversations
 * - READ it at the start of important conversations to recall context
 * - WRITE to it when you learn something worth remembering
 * - Use the Edit tool to update specific sections
 * - Section-based: User, Preferences, Ongoing, Notes, Decisions
 *
 * SOURCE: Claude Code source analysis
 * - Memory types: user, feedback, project, reference
 * - Each memory has name, description, type frontmatter
 * - MEMORY.md index with one-line pointers
 *
 * ADAPTATION:
 * - Exposed as MCP tool (read/write/append/list)
 * - Per-project isolation
 * - Section-based operations
 */

import { z } from "zod";
import { MemoryStore } from "../core/memory.js";
import { ToolResult } from "../tool-definition.js";

export function handleMemory(
  args: {
    action: string;
    project?: string;
    section?: string;
    content?: string;
  },
  memory: MemoryStore
): ToolResult {
  const project = args.project ?? "default";

  switch (args.action) {
    case "read": {
      if (args.section) {
        const sectionContent = memory.readSection(project, args.section);
        if (!sectionContent) {
          const full = memory.read(project);
          // List available sections
          const sections = full
            .split("\n")
            .filter((l) => l.startsWith("## "))
            .map((l) => l.substring(3).trim());
          return {
            content: [{
              type: "text",
              text: `Section "${args.section}" not found.\n\nAvailable sections: ${sections.join(", ")}`,
            }],
          };
        }
        return {
          content: [{
            type: "text",
            text: `## ${args.section}\n\n${sectionContent}`,
          }],
        };
      }

      const full = memory.read(project);
      const size = memory.getSize(project);
      return {
        content: [{
          type: "text",
          text: `${full}\n\n---\n_Memory: ${size} bytes_`,
        }],
      };
    }

    case "write": {
      if (!args.content) {
        return {
          content: [{ type: "text", text: "Error: `content` is required for write action." }],
        };
      }

      if (args.section) {
        const ok = memory.updateSection(project, args.section, args.content);
        if (!ok) {
          return {
            content: [{
              type: "text",
              text: `Section "${args.section}" not found. Use "read" to see available sections.`,
            }],
          };
        }
        return {
          content: [{ type: "text", text: `Updated section "${args.section}" in ${project} memory.` }],
        };
      }

      memory.write(project, args.content);
      return {
        content: [{ type: "text", text: `Wrote full memory for project "${project}".` }],
      };
    }

    case "append": {
      if (!args.section) {
        return {
          content: [{ type: "text", text: "Error: `section` is required for append action." }],
        };
      }
      if (!args.content) {
        return {
          content: [{ type: "text", text: "Error: `content` is required for append action." }],
        };
      }

      const ok = memory.appendToSection(project, args.section, args.content);
      if (!ok) {
        return {
          content: [{
            type: "text",
            text: `Section "${args.section}" not found. Use "read" to see available sections.`,
          }],
        };
      }
      return {
        content: [{ type: "text", text: `Appended to "${args.section}" in ${project} memory.` }],
      };
    }

    case "clear": {
      memory.clear(project);
      return {
        content: [{ type: "text", text: `Cleared memory for project "${project}" (reset to template).` }],
      };
    }

    case "list_projects": {
      const projects = memory.listProjects();
      if (projects.length === 0) {
        return {
          content: [{ type: "text", text: "No project memories found. Use `memory` with action `read` or `write` to create one." }],
        };
      }

      let output = "# Project Memories\n\n";
      for (const p of projects) {
        const size = memory.getSize(p);
        output += `- **${p}** (${size} bytes)\n`;
      }
      return { content: [{ type: "text", text: output }] };
    }

    default:
      return {
        content: [{
          type: "text",
          text: `Unknown action "${args.action}". Valid actions: read, write, append, clear, list_projects`,
        }],
      };
  }
}
