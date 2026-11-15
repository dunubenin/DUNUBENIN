import test from 'node:test';
import assert from 'node:assert/strict';
import { splitFoodRevenue } from '../src/services/food-revenue.js';

test('répartit 1 000 FCFA de plats : 90 % restaurant, 3 % Master, 7 % DUNU', () => {
  assert.deepEqual(splitFoodRevenue(1000), {
    restaurantAmount: 900, masterAmount: 30, dunuAmount: 70, total: 1000
  });
});

test('conserve exactement le sous-total malgré les arrondis FCFA', () => {
  for (const subtotal of [0, 1, 2, 3, 7, 11, 99, 101, 333, 999, 12345]) {
    const shares = splitFoodRevenue(subtotal);
    assert.equal(shares.restaurantAmount + shares.masterAmount + shares.dunuAmount, subtotal);
    assert.ok(shares.restaurantAmount >= 0);
  }
});

test('rejette les sous-totaux invalides', () => {
  for (const value of [-1, 1.5, NaN, Infinity, '100']) {
    assert.throws(() => splitFoodRevenue(value), TypeError);
  }
});

test('la commission à la livraison correspond à 7 % DUNU + 3 % Master, soit 10 % du partage', () => {
  const shares = splitFoodRevenue(1000);
  const walletCommission = shares.masterAmount + shares.dunuAmount;
  assert.equal(walletCommission, 100);
  assert.equal(shares.restaurantAmount, 900);
  assert.equal(shares.restaurantAmount + walletCommission, 1000);
});

test('le prélèvement du portefeuille Commission ne crée ni perte ni double commission', () => {
  for (const subtotal of [1, 11, 99, 100, 333, 700, 1000, 12345]) {
    const shares = splitFoodRevenue(subtotal);
    const walletCommission = shares.masterAmount + shares.dunuAmount;
    assert.equal(shares.restaurantAmount + walletCommission, subtotal);
    assert.equal(walletCommission, subtotal - shares.restaurantAmount);
  }
});
