async function inflate(data: Uint8Array) {
  const stream = new Blob([new Uint8Array(data).buffer]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const files = new Map<string, Uint8Array>();
  let offset = 0;
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true);
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = new TextDecoder().decode(bytes.slice(nameStart, nameStart + nameLength));
    const compressed = bytes.slice(dataStart, dataStart + size);
    if (method === 0) files.set(name, compressed);
    else if (method === 8) files.set(name, await inflate(compressed));
    offset = dataStart + size;
  }
  return files;
}

function columnIndex(reference: string) {
  const letters = reference.match(/[A-Z]+/)?.[0] ?? "A";
  return [...letters].reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

export async function parseXlsx(buffer: ArrayBuffer): Promise<{ headers: string[]; rows: string[][] }> {
  const files = await unzip(buffer);
  const decoder = new TextDecoder();
  const sharedXml = files.get("xl/sharedStrings.xml");
  const shared = sharedXml
    ? [...new DOMParser().parseFromString(decoder.decode(sharedXml), "application/xml").querySelectorAll("si")]
        .map((node) => [...node.querySelectorAll("t")].map((text) => text.textContent ?? "").join(""))
    : [];
  const sheet = files.get("xl/worksheets/sheet1.xml");
  if (!sheet) throw new Error("The workbook has no first worksheet");
  const document = new DOMParser().parseFromString(decoder.decode(sheet), "application/xml");
  const table = [...document.querySelectorAll("row")].map((row) => {
    const result: string[] = [];
    row.querySelectorAll("c").forEach((cell) => {
      const index = columnIndex(cell.getAttribute("r") ?? "A1");
      const raw = cell.querySelector("v")?.textContent ?? cell.querySelector("is t")?.textContent ?? "";
      result[index] = cell.getAttribute("t") === "s" ? shared[Number(raw)] ?? "" : raw;
    });
    return result.map((value) => value ?? "");
  });
  return { headers: table[0] ?? [], rows: table.slice(1) };
}
