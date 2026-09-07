// Supports quoted commas, escaped quotes, CRLF and multiline spreadsheet cells.
export function parseCSV(text: string): {
  headers: string[];
  rows: string[][];
} {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted cell.");
  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return { headers: rows.shift() ?? [], rows };
}
