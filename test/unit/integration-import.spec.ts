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
