/**
 * Extract and parse a JSON value from Gemini/model text that may include
 * markdown fences or trailing prose after a valid JSON object.
 */
export function parseJsonFromModelText(text: string): unknown {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenceMatch ? fenceMatch[1] : trimmed).trim();

  try {
    return JSON.parse(candidate);
  } catch {
    // continue — often valid JSON followed by extra characters
  }

  const extracted = extractFirstJsonValue(candidate);
  return JSON.parse(extracted);
}

function extractFirstJsonValue(text: string): string {
  const objectStart = text.indexOf('{');
  const arrayStart = text.indexOf('[');
  let start = -1;
  if (objectStart >= 0 && (arrayStart < 0 || objectStart < arrayStart)) {
    start = objectStart;
  } else if (arrayStart >= 0) {
    start = arrayStart;
  }
  if (start < 0) {
    throw new SyntaxError('No JSON value found in model text');
  }

  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  throw new SyntaxError('Unclosed JSON value in model text');
}
