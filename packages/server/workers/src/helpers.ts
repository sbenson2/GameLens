/** Shared response helpers */

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
}

export function errorResponse(message: string, status: number): Response {
  return jsonResponse({ ok: false, error: message }, status);
}

export function corsPreflightResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

/** Extract section from markdown content by heading substring match */
export function extractSection(
  content: string,
  sectionQuery: string
): { found: boolean; content: string; sections: string[] } {
  const lines = content.split("\n");
  const headings: { text: string; level: number; lineIndex: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)/);
    if (match) {
      headings.push({
        text: match[2].trim(),
        level: match[1].length,
        lineIndex: i,
      });
    }
  }

  const allSections = headings.map((h) => h.text);
  const query = sectionQuery.toLowerCase();

  // Find matching heading
  const matchIdx = headings.findIndex((h) =>
    h.text.toLowerCase().includes(query)
  );

  if (matchIdx === -1) {
    return { found: false, content: "", sections: allSections };
  }

  const matched = headings[matchIdx];
  const startLine = matched.lineIndex;

  // Find end: next heading of equal or higher (lower number) level
  let endLine = lines.length;
  for (let i = matchIdx + 1; i < headings.length; i++) {
    if (headings[i].level <= matched.level) {
      endLine = headings[i].lineIndex;
      break;
    }
  }

  const extracted = lines.slice(startLine, endLine).join("\n").trim();
  return { found: true, content: extracted, sections: allSections };
}

/** Truncate content at nearest paragraph boundary */
export function truncateAtParagraph(
  content: string,
  maxLength: number
): { content: string; truncated: boolean } {
  if (content.length <= maxLength) {
    return { content, truncated: false };
  }

  // Find last double-newline before maxLength
  const searchArea = content.slice(0, maxLength);
  const lastPara = searchArea.lastIndexOf("\n\n");

  if (lastPara > maxLength * 0.5) {
    return {
      content:
        searchArea.slice(0, lastPara) +
        "\n\n---\n*[Truncated — use `section` param for specific content]*",
      truncated: true,
    };
  }

  // Fallback: cut at maxLength
  return {
    content:
      content.slice(0, maxLength) +
      "\n\n---\n*[Truncated — use `section` param for specific content]*",
    truncated: true,
  };
}
