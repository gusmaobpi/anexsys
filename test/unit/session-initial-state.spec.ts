import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createIdleSessionState, statusFromStoredSession } from '../../frontend/src/components/providers/session-context';

describe('session first paint', () => {
  it('starts loading with no session so SSR and the client render the same text', () => {
    assert.deepEqual(createIdleSessionState(), {
      status: 'loading',
      session: null,
    });
  });

  it('keeps a stored session on screen while the tokens are restored', () => {
    assert.equal(statusFromStoredSession({ activeBranchId: 'branch-1', companySelectionRequired: false }), 'authenticated');
    assert.equal(statusFromStoredSession({ activeBranchId: null, companySelectionRequired: false }), 'branch-selection');
    assert.equal(statusFromStoredSession({ activeBranchId: 'branch-1', companySelectionRequired: true }), 'company-selection');
  });
});
