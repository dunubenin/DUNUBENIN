import test from 'node:test';
import assert from 'node:assert/strict';
import { hasRoleAccess } from '../src/middleware/role-access.js';

const roles = ['client', 'restaurant', 'rider', 'master', 'admin', 'finance'];
for (const role of roles) {
  test(`le rôle ${role} est reconnu uniquement dans sa liste d'accès`, () => {
    assert.equal(hasRoleAccess({ role }, [role]), true);
    assert.equal(hasRoleAccess({ role }, roles.filter(x => x !== role)), false);
  });
}
test('un utilisateur absent ou une liste invalide ne reçoit aucun accès', () => {
  assert.equal(hasRoleAccess(null, roles), false);
  assert.equal(hasRoleAccess({ role: 'admin' }, null), false);
});
