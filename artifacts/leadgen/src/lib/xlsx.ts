import * as XLSX from "xlsx";

export async function parseXlsx(buffer: ArrayBuffer): Promise<{ headers: string[]; rows: string[][] }> {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error("The workbook does not contain a worksheet");
  const worksheet = workbook.Sheets[firstSheetName];
  if (!worksheet) throw new Error("The first worksheet could not be read");
  const table = XLSX.utils.sheet_to_json<(string | number | boolean)[]>(worksheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });
  if (!table.length) throw new Error("The worksheet is empty");
  const normalized = table.map((row) => row.map((value) => String(value ?? "").trim()));
  return { headers: normalized[0] ?? [], rows: normalized.slice(1) };
}
