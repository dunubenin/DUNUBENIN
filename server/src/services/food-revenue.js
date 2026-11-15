/** Répartition des ventes de plats DUNU : 90 % restaurant, 3 % Master, 7 % DUNU. */
export function splitFoodRevenue(foodSubtotal) {
  if (!Number.isSafeInteger(foodSubtotal) || foodSubtotal < 0) {
    throw new TypeError('Le sous-total des plats doit être un entier positif ou nul.');
  }
  const masterAmount = Math.round(foodSubtotal * 0.03);
  const dunuAmount = Math.round(foodSubtotal * 0.07);
  const restaurantAmount = foodSubtotal - masterAmount - dunuAmount;
  return { restaurantAmount, masterAmount, dunuAmount, total: foodSubtotal };
}
