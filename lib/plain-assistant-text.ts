// Turn accidental Markdown from a chat model into readable plain text.
export function plainAssistantText(value: string, includeRecordIds = false): string {
  let input = value.trim();
  if (input.startsWith("{")) {
    try {
      const parsed = JSON.parse(input) as { answer?: unknown; response?: unknown; content?: unknown };
      const answer = parsed.answer ?? parsed.response ?? parsed.content;
      if (typeof answer === "string") input = answer;
    } catch { /* Keep the original answer. */ }
  }
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const output: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line.startsWith("|") || !line.includes("|", 1)) {
      output.push(lines[index]);
      continue;
    }
    const headers = line.replace(/^\||\|$/g, "").split("|").map((item) => item.trim());
    const separator = lines[index + 1]?.trim() || "";
    if (!separator.startsWith("|") || !/^\|?[\s:|-]+\|?$/.test(separator) ||
        !separator.includes("---")) {
      output.push(lines[index]);
      continue;
    }
    index += 2;
    while (index < lines.length && lines[index].trim().startsWith("|")) {
      const cells = lines[index].trim().replace(/^\||\|$/g, "").split("|").map((item) => item.trim());
      const details = headers.map((header, position) => {
        if (!includeRecordIds && /^(record\s*)?(id|uuid)$/i.test(header)) return "";
        return cells[position] ? `${header}: ${cells[position]}` : "";
      }).filter(Boolean);
      if (details.length) output.push(details.join(". "));
      index++;
    }
    index--;
  }
  return output.join("\n")
    .replace(/^\s*```[^\n]*$/gm, "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)")
    .replace(/\*\*|__/g, "")
    .replace(/`/g, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
