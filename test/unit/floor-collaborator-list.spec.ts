import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCollaboratorFilters,
  buildCollaboratorExcelCsv,
  collaboratorProfileText,
  collaboratorStatusLabel,
} from '../../frontend/src/components/production/floor-collaborator-list';

const records = [
  {
    id: '1',
    userId: 'u1',
    status: 'active',
    displayName: 'Técnico',
    profile: 'tecnico' as const,
    dailyRate: 150,
    piecesPerDay: 5,
  },
  {
    id: '2',
    userId: 'u2',
    status: 'active',
    displayName: 'Gerente',
    profile: null,
    dailyRate: 0,
    piecesPerDay: 0,
  },
];

test('filters collaborators by name, profile and status', () => {
  assert.equal(applyCollaboratorFilters(records, { q: 'téc' }).length, 1);
  assert.equal(applyCollaboratorFilters(records, { profile: 'none' })[0]?.displayName, 'Gerente');
  assert.equal(applyCollaboratorFilters(records, { profile: 'tecnico', status: 'inactive' }).length, 0);
  assert.equal(collaboratorProfileText(null), 'Sem perfil');
  assert.equal(collaboratorStatusLabel('inactive'), 'Inativo');
  assert.match(buildCollaboratorExcelCsv(records), /Valor|Diária/);
  assert.match(buildCollaboratorExcelCsv(records), /Sem perfil/);
});
