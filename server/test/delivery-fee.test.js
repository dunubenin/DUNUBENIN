import test from 'node:test';
import assert from 'node:assert/strict';
import { splitDeliveryFee } from '../src/services/delivery-fee.js';

test('répartit 1 000 FCFA selon 3 % / 7 % / 90 %', () => {
  assert.deepEqual(splitDeliveryFee(1000), {
    masterAmount: 30, dunuAmount: 70, riderAmount: 900, total: 1000
  });
});

test('répartit 700 FCFA sans perte ni création de montant', () => {
  const shares = splitDeliveryFee(700);
  assert.deepEqual(shares, { masterAmount: 21, dunuAmount: 49, riderAmount: 630, total: 700 });
  assert.equal(shares.masterAmount + shares.dunuAmount + shares.riderAmount, 700);
});

test('le reliquat revient au livreur lorsque les arrondis interviennent', () => {
  for (const fee of [0, 1, 2, 3, 7, 11, 99, 101, 333, 999, 12345]) {
    const shares = splitDeliveryFee(fee);
    assert.equal(shares.masterAmount + shares.dunuAmount + shares.riderAmount, fee);
    assert.ok(shares.riderAmount >= 0);
  }
});

test('rejette les frais non entiers ou négatifs', () => {
  for (const fee of [-1, 1.5, NaN, Infinity, '100']) {
    assert.throws(() => splitDeliveryFee(fee), TypeError);
  }
});
