import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMigrationWorkbook } from "../../frontend/src/components/integration/excel-workbook";
import { INTEGRATION_LAYOUTS, findIntegrationLayout } from "../../frontend/src/components/integration/migration-layouts";

test("each integration layout builds an Excel workbook with its columns", () => {
  const hrefs = new Set<string>();
  for (const layout of INTEGRATION_LAYOUTS) {
    assert.equal(hrefs.has(layout.href), false);
    hrefs.add(layout.href);
    assert.equal(findIntegrationLayout(layout.href)?.fileName, layout.fileName);
    assert.equal(new Set(layout.columns.map((column) => column.header)).size, layout.columns.length);
    for (const row of layout.exampleRows) {
      assert.equal(row.length, layout.columns.length);
    }

    const bytes = buildMigrationWorkbook(layout);
    assert.equal(bytes[0], 0x50);
    assert.equal(bytes[1], 0x4b);
    const text = Buffer.from(bytes).toString("utf8");
    assert.match(text, /\[Content_Types\]\.xml/);
    assert.match(text, /xl\/worksheets\/sheet1\.xml/);
    assert.match(text, /xl\/worksheets\/sheet2\.xml/);
    assert.match(text, /Instruções/);
    for (const column of layout.columns) {
      assert.equal(text.includes(column.header), true, column.header);
    }
  }
});

test("service order layouts keep the status of that file", () => {
  const open = findIntegrationLayout("/integration/service-orders/aberta");
  const picked = findIntegrationLayout("/integration/service-orders/retirada");
  assert.ok(open);
  assert.ok(picked);
  assert.equal(open.columns.find((column) => column.header === "Status")?.example, "Aberta");
  assert.equal(picked.columns.find((column) => column.header === "Status")?.example, "Retirado");
  assert.equal(picked.columns.find((column) => column.header === "Data da retirada")?.required, "Sim");
  assert.equal(open.exampleRows.length, 2);
  assert.equal(open.exampleRows[1][open.columns.findIndex((column) => column.header === "Peça")], "2");
});
