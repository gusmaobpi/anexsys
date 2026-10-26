function concat(parts: Uint8Array[]) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function findEnd(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = bytes.length - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      return {
        count: view.getUint16(offset + 10, true),
        size: view.getUint32(offset + 12, true),
        start: view.getUint32(offset + 16, true),
      };
    }
  }
  throw new Error("O arquivo não é uma planilha Excel.");
}

async function inflate(data: Uint8Array) {
  const stream = new Blob([Uint8Array.from(data)]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function unzip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = findEnd(bytes);
  const files = new Map<string, Uint8Array>();
  let cursor = end.start;
  for (let index = 0; index < end.count; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error("O arquivo não é uma planilha Excel.");
    }
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    files.set(name, method === 0 ? compressed : await inflate(compressed));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");
}

function columnIndex(ref: string) {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let index = 0;
  for (const char of letters) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index - 1;
}

function sharedStrings(xml: string) {
  const values: string[] = [];
  for (const item of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const texts = [...item[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1]));
    values.push(texts.join(""));
  }
  return values;
}

function sheetRows(xml: string, strings: string[]) {
  const rows: string[][] = [];
  for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const values: string[] = [];
    for (const cell of row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const ref = /r="([A-Z]+\d+)"/.exec(cell[1])?.[1] ?? "";
      const type = /t="([^"]+)"/.exec(cell[1])?.[1] ?? "";
      const index = ref ? columnIndex(ref) : values.length;
      let text = "";
      if (type === "inlineStr") {
        text = decodeXml(/<t[^>]*>([\s\S]*?)<\/t>/.exec(cell[2])?.[1] ?? "");
      } else if (type === "s") {
        text = strings[Number(/<v>([\s\S]*?)<\/v>/.exec(cell[2])?.[1] ?? "")] ?? "";
      } else if (type !== "e") {
        text = /<v>([\s\S]*?)<\/v>/.exec(cell[2])?.[1] ?? "";
      }
      values[index] = text;
    }
    rows.push(values.map((value) => value ?? ""));
  }
  return rows;
}

function layoutSheetPath(files: Map<string, Uint8Array>) {
  const workbook = new TextDecoder().decode(files.get("xl/workbook.xml") ?? new Uint8Array());
  const rels = new TextDecoder().decode(files.get("xl/_rels/workbook.xml.rels") ?? new Uint8Array());
  const sheet = /<sheet\b[^>]*name="Layout"[^>]*r:id="([^"]+)"/.exec(workbook)
    ?? /<sheet\b[^>]*r:id="([^"]+)"[^>]*name="Layout"/.exec(workbook);
  const relationId = sheet?.[1];
  if (!relationId) {
    throw new Error("A planilha precisa ter a aba Layout.");
  }
  const target = new RegExp(`Id="${relationId}"[^>]*Target="([^"]+)"`).exec(rels)?.[1]
    ?? new RegExp(`Target="([^"]+)"[^>]*Id="${relationId}"`).exec(rels)?.[1];
  if (!target) {
    throw new Error("A planilha precisa ter a aba Layout.");
  }
  return target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\.\//, "")}`;
}

export async function readLayoutRows(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const files = await unzip(bytes);
  const sheetPath = layoutSheetPath(files);
  const sheet = files.get(sheetPath) ?? files.get(sheetPath.replace(/^xl\//, ""));
  if (!sheet) {
    throw new Error("A planilha precisa ter a aba Layout.");
  }
  const strings = sharedStrings(new TextDecoder().decode(files.get("xl/sharedStrings.xml") ?? new Uint8Array()));
  const rows = sheetRows(new TextDecoder().decode(sheet), strings);
  const [header, ...body] = rows;
  if (!header || header.every((column) => !column.trim())) {
    throw new Error("A aba Layout está sem o cabeçalho.");
  }
  return body
    .map((row) => {
      const record: Record<string, string> = {};
      header.forEach((column, index) => {
        const name = column.trim();
        if (name) record[name] = (row[index] ?? "").trim();
      });
      return record;
    })
    .filter((row) => Object.values(row).some((value) => value.trim()));
}
