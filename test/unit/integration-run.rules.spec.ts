import assert from "node:assert/strict";
import { test } from "node:test";
import { linkedToServiceOrderMessage } from "../../src/modules/integration/application/integration-import.rules";
import { buildImportUnits, classifyImportError, describeRunProgress } from "../../src/modules/integration/application/integration-run.rules";

test("error types group the same failure even when the name changes", () => {
  const first = classifyImportError("Cliente CLI-1001 não está no cadastro. Importe os clientes antes.");
  const second = classifyImportError("Cliente CLI-1002 não está no cadastro. Importe os clientes antes.");
  assert.equal(first.code, second.code);
  assert.equal(first.label, "Cliente não encontrado");
  assert.match(first.hint, /Importe o cadastro de clientes/);
});

test("progress reports percent, remaining and a finish estimate", () => {
  const started = "2026-10-26T12:00:00.000Z";
  const progress = describeRunProgress({
    status: "running",
    total: 100,
    processed: 25,
    startedAt: started,
    finishedAt: null,
    now: Date.parse("2026-10-26T12:01:00.000Z"),
  });
  assert.equal(progress.percent, 25);
  assert.equal(progress.remaining, 75);
  assert.equal(progress.finishAt, "2026-10-26T12:04:00.000Z");
});

test("a linked service keeps the audit warning", () => {
  assert.equal(
    linkedToServiceOrderMessage("Serviço"),
    "Serviço não pode ser alterado porque já está vinculado a Ordem de Serviço",
  );
  assert.equal(
    linkedToServiceOrderMessage("Produto"),
    "Produto não pode ser alterado porque já está vinculado a Ordem de Serviço",
  );
});

test("service order rows of the same old number stay one unit", () => {
  const units = buildImportUnits("service-orders", [
    { __line: 2, "Número no sistema antigo": "4521", Peça: "1" },
    { __line: 3, "Número no sistema antigo": "4521", Peça: "2" },
    { __line: 4, "Número no sistema antigo": "4522", Peça: "1" },
  ]);
  assert.equal(units.length, 2);
  assert.equal(units[0].lineNo, 2);
  assert.equal(units[0].payload.length, 2);
});
