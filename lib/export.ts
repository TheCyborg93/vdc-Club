export function csvCell(value: unknown) {
  const text=value === null || value === undefined ? "" : String(value);
  return '"' + text.replaceAll('"','""') + '"';
}

export function toCsv(headers: string[], rows: unknown[][]) {
  return [
    headers.map(csvCell).join(";"),
    ...rows.map((row)=>row.map(csvCell).join(";")),
  ].join("\n");
}

export function exportFilename(prefix: string, ext: string) {
  const date=new Date().toISOString().slice(0,10);
  return prefix+"-"+date+"."+ext;
}
