import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMigrationWorkbook } from "../../frontend/src/components/integration/excel-workbook";
import { findIntegrationLayout } from "../../frontend/src/components/integration/migration-layouts";
import { readLayoutRows } from "../../frontend/src/components/integration/read-layout-sheet";
import { mapServiceOrderStatus, parseMoney } from "../../src/modules/integration/application/integration-import.rules";

test("money and service order status follow the layout words", () => {
  assert.equal(parseMoney("1.234,50"), 1234.5);
  assert.equal(parseMoney("80,00"), 80);
  assert.equal(mapServiceOrderStatus("Pronto para retirada"), "ready_for_pickup");
  assert.equal(mapServiceOrderStatus("Em refação"), "in_rework");
});

test("the customer layout excel is read back with its columns", async () => {
  const layout = findIntegrationLayout("/integration/customers");
  assert.ok(layout);
  const bytes = buildMigrationWorkbook(layout);
  const rows = await readLayoutRows(new File([Uint8Array.from(bytes)], layout.fileName));
  assert.equal(rows.length, 1);
  assert.equal(rows[0]["Nome completo / razão social"], "Maria Silva");
  assert.equal(rows[0]["Código no sistema antigo"], "CLI-1001");
});

test("an excel file with empty cells keeps the price on the price column", async () => {
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c><c r="F1" t="s"><v>5</v></c><c r="G1" t="s"><v>6</v></c></row>
<row r="2"><c r="A2" t="s"><v>7</v></c><c r="C2" t="s"><v>8</v></c><c r="D2" s="2"/><c r="E2" s="2"/><c r="F2" t="s"><v>9</v></c><c r="G2" t="s"><v>10</v></c></row>
</sheetData>
</worksheet>`;
  const strings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Produto</t></si><si><t>Ordem do produto</t></si><si><t>Serviço</t></si><si><t>Ordem do serviço</t></si><si><t>Grau de dificuldade</t></si><si><t>Preço sugerido</t></si><si><t>Tempo previsto (minutos)</t></si><si><t>Cliente</t></si><si><t>Bainha</t></si><si><t>80,00</t></si><si><t>30</t></si></sst>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Worksheet" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
  const bytes = storedZip([
    ["xl/workbook.xml", workbook],
    ["xl/_rels/workbook.xml.rels", rels],
    ["xl/worksheets/sheet1.xml", sheet],
    ["xl/sharedStrings.xml", strings],
  ]);
  const rows = await readLayoutRows(new File([bytes], "servicos.xlsx"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].Produto, "Cliente");
  assert.equal(rows[0].Serviço, "Bainha");
  assert.equal(rows[0]["Preço sugerido"], "80,00");
  assert.equal(rows[0]["Tempo previsto (minutos)"], "30");
  assert.equal(rows[0]["Ordem do serviço"], "");
});

function storedZip(entries: Array<[string, string]>) {
  const files = entries.map(([name, data]) => ({ name, data: new TextEncoder().encode(data) }));
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(file.name);
    const crc = crc32(file.data);
    const local = concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc),
      u32(file.data.length), u32(file.data.length), u16(name.length), u16(0), name, file.data,
    ]);
    const central = concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc),
      u32(file.data.length), u32(file.data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(offset), name,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralDirectory = concat(centrals);
  return concat([
    ...locals,
    centralDirectory,
    concat([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(centralDirectory.length), u32(offset), u16(0)]),
  ]);
}

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

function u16(value: number) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function u32(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    let next = (crc ^ byte) & 0xff;
    for (let bit = 0; bit < 8; bit += 1) next = next & 1 ? 0xedb88320 ^ (next >>> 1) : next >>> 1;
    crc = (crc >>> 8) ^ next;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

test("the service order layout keeps both pieces and the status", async () => {
  const layout = findIntegrationLayout("/integration/service-orders/aberta");
  assert.ok(layout);
  const bytes = buildMigrationWorkbook(layout);
  const rows = await readLayoutRows(new File([Uint8Array.from(bytes)], layout.fileName));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].Status, "Aberta");
  assert.equal(rows[1].Peça, "2");
  assert.equal(rows[1].Produto, "Saia");
});
