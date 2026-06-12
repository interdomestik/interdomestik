export function normalizeReviewerOutput(output, route = {}) {
  if (route.outputExtractor === 'copilot-jsonl') {
    return extractCopilotJsonl(output) || output;
  }
  return output;
}

function extractCopilotJsonl(output) {
  const messages = [];
  for (const line of output.split('\n')) {
    if (!line.trim().startsWith('{')) continue;
    try {
      const event = JSON.parse(line);
      if (event.type === 'assistant.message' && event.data?.content) {
        messages.push(event.data.content);
      }
    } catch {}
  }
  return messages.join('\n\n').trim();
}
