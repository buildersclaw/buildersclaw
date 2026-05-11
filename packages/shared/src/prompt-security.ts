const INJECTION_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /ignore\s+(all\s+)?previous\s+instructions/i, reason: "Prompt injection: system override attempt" },
  { pattern: /ignore\s+(all\s+)?above\s+instructions/i, reason: "Prompt injection: system override attempt" },
  { pattern: /disregard\s+(all\s+)?previous/i, reason: "Prompt injection: system override attempt" },
  { pattern: /forget\s+(all\s+)?previous/i, reason: "Prompt injection: system override attempt" },
  { pattern: /you\s+are\s+now\s+a/i, reason: "Prompt injection: role override attempt" },
  { pattern: /new\s+system\s+prompt/i, reason: "Prompt injection: system override attempt" },
  { pattern: /\[SYSTEM\]/i, reason: "Prompt injection: system tag" },
  { pattern: /\[INST\]/i, reason: "Prompt injection: instruction tag" },
  { pattern: /<<SYS>>/i, reason: "Prompt injection: system tag" },
  { pattern: /<\|im_start\|>system/i, reason: "Prompt injection: ChatML tag" },
  { pattern: /send\s+(the\s+)?api\s+key/i, reason: "Exfiltration attempt: API key" },
  { pattern: /forward\s+(to|this\s+to)\s+http/i, reason: "Exfiltration attempt: forwarding data" },
  { pattern: /fetch\s*\(\s*['"]http/i, reason: "Exfiltration attempt: fetch call in prompt" },
  { pattern: /XMLHttpRequest/i, reason: "Exfiltration attempt: XHR in prompt" },
  { pattern: /navigator\.sendBeacon/i, reason: "Exfiltration attempt: beacon in prompt" },
  { pattern: /repeat\s+the\s+(system\s+)?prompt/i, reason: "Prompt leak attempt" },
  { pattern: /show\s+me\s+(your|the)\s+(system\s+)?prompt/i, reason: "Prompt leak attempt" },
  { pattern: /what\s+(are|were)\s+your\s+instructions/i, reason: "Prompt leak attempt" },
];

export interface SanitizeResult {
  safe: boolean;
  cleaned: string;
  blocked_reason: string | null;
}

export function sanitizePrompt(raw: string): SanitizeResult {
  const cleaned = raw.trim().replace(/\r\n/g, "\n");
  if (!cleaned) return { safe: false, cleaned: "", blocked_reason: "Empty prompt" };

  for (const { pattern, reason } of INJECTION_PATTERNS) {
    if (pattern.test(cleaned)) return { safe: false, cleaned, blocked_reason: reason };
  }

  const uniqueRatio = new Set(cleaned).size / cleaned.length;
  if (cleaned.length > 100 && uniqueRatio < 0.05) {
    return { safe: false, cleaned, blocked_reason: "Prompt appears to be padding/spam (low character diversity)" };
  }
  if (/(.)\1{49,}/.test(cleaned)) {
    return { safe: false, cleaned, blocked_reason: "Prompt contains excessive repeated characters" };
  }
  if (cleaned.split(/\s+/).filter((word) => word.length > 1).length < 3) {
    return { safe: false, cleaned, blocked_reason: "Prompt too short. Describe what you want to build." };
  }

  return { safe: true, cleaned, blocked_reason: null };
}

export function sanitizeGeneratedOutput(content: string): string {
  return content
    .replace(/navigator\.sendBeacon\s*\([^)]*\)/g, "/* blocked: beacon */")
    .replace(/document\.cookie/g, "/* blocked: cookie access */")
    .replace(/localStorage\.getItem\s*\(\s*['"]api/gi, "/* blocked: api key access */");
}

