/**
 * Répartition contractuelle des frais de livraison DUNU :
 * 3 % Master, 7 % DUNU, solde au livreur.
 * Les montants sont en FCFA entiers ; le livreur reçoit le reliquat
 * pour que la somme des trois parts soit toujours exactement égale aux frais.
 */
export function splitDeliveryFee(deliveryFee) {
  if (!Number.isSafeInteger(deliveryFee) || deliveryFee < 0) {
    throw new TypeError('Les frais de livraison doivent être un entier positif ou nul.');
  }
  const masterAmount = Math.round(deliveryFee * 0.03);
  const dunuAmount = Math.round(deliveryFee * 0.07);
  const riderAmount = deliveryFee - masterAmount - dunuAmount;
  return { masterAmount, dunuAmount, riderAmount, total: deliveryFee };
}
