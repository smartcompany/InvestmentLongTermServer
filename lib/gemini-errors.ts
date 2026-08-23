export type GeminiErrorKind =
  | 'quota'
  | 'rate_limit'
  | 'high_demand'
  | 'not_found'
  | 'unauthorized'
  | 'bad_request'
  | 'server'
  | 'unknown';

export function classifyGeminiErrorMessage(
  message: string,
  statusHint?: number,
): GeminiErrorKind {
  const lower = message.toLowerCase();

  if (
    lower.includes('high demand') ||
    lower.includes('spikes in demand') ||
    lower.includes('temporarily unavailable') ||
    (lower.includes('try again later') &&
      (statusHint === 503 || lower.includes('503')))
  ) {
    return 'high_demand';
  }

  if (
    statusHint === 429 ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('ratelimit') ||
    lower.includes('too many requests') ||
    lower.includes('(429')
  ) {
    if (lower.includes('quota') || lower.includes('resource_exhausted')) {
      return 'quota';
    }
    return 'rate_limit';
  }

  if (
    statusHint === 401 ||
    statusHint === 403 ||
    lower.includes('(401') ||
    lower.includes('(403')
  ) {
    return 'unauthorized';
  }
  if (
    statusHint === 404 ||
    lower.includes('is not found') ||
    lower.includes('(404')
  ) {
    return 'not_found';
  }
  if (statusHint === 400 || lower.includes('(400')) {
    return 'bad_request';
  }
  if (statusHint === 503 || lower.includes('(503')) {
    return 'high_demand';
  }
  if (
    (statusHint != null && statusHint >= 500) ||
    /\((\d{3})\/server/.test(lower) ||
    lower.includes('(500') ||
    lower.includes('(502')
  ) {
    return 'server';
  }
  return 'unknown';
}

export function parseGeminiStatusFromMessage(message: string): number | undefined {
  const match = message.match(/Gemini API error\s*\((\d{3})/i);
  if (!match) {
    return undefined;
  }
  return Number(match[1]);
}

export function isRetryableGeminiError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const status = parseGeminiStatusFromMessage(message);
  const kind = classifyGeminiErrorMessage(message, status);
  return (
    kind === 'high_demand' || kind === 'rate_limit' || kind === 'server'
  );
}

export function clientMessageForGeminiError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const status = parseGeminiStatusFromMessage(message);
  const kind = classifyGeminiErrorMessage(message, status);
  if (kind === 'high_demand') {
    return 'AI is busy right now. Please try again in a moment.';
  }
  if (kind === 'quota' || kind === 'rate_limit') {
    return 'AI rate limit reached. Please try again later.';
  }
  if (kind === 'unauthorized') {
    return 'AI service is not configured correctly.';
  }
  if (message.trim()) {
    return message;
  }
  return 'Failed to generate investment insight';
}

export function httpStatusForGeminiError(error: unknown): number {
  const message = error instanceof Error ? error.message : String(error);
  const status = parseGeminiStatusFromMessage(message);
  const kind = classifyGeminiErrorMessage(message, status);
  if (kind === 'high_demand' || kind === 'quota' || kind === 'rate_limit') {
    return 429;
  }
  if (kind === 'not_found' || kind === 'bad_request' || kind === 'server') {
    return 502;
  }
  return 500;
}
