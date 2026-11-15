import test from 'node:test';
import assert from 'node:assert/strict';
import { BENIN_COMMUNES, BENIN_COMMUNE_NAMES } from '../src/data/benin-communes.js';

test('le référentiel national contient exactement 77 communes distinctes', () => {
  assert.equal(BENIN_COMMUNES.length, 77);
  assert.equal(BENIN_COMMUNE_NAMES.size, 77);
});

test('les 12 départements sont représentés', () => {
  assert.equal(new Set(BENIN_COMMUNES.map(item => item.department)).size, 12);
});

test('les communes de lancement sont bien présentes', () => {
  for (const city of ['Cotonou', 'Porto-Novo', 'Abomey-Calavi', 'Bohicon', 'Akpro-Missérété']) {
    assert.ok(BENIN_COMMUNE_NAMES.has(city), `${city} doit être dans le référentiel`);
  }
});

test('seules les cinq communes de lancement sont activées par défaut', async () => {
  const { INITIAL_OPERATIONAL_COMMUNES } = await import('../src/data/benin-communes.js');
  assert.deepEqual([...INITIAL_OPERATIONAL_COMMUNES].sort(), ['Abomey-Calavi', 'Akpro-Missérété', 'Bohicon', 'Cotonou', 'Porto-Novo'].sort());
});
