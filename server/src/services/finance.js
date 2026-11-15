import { Ledger, Restaurant, User } from '../models/index.js';
import { splitDeliveryFee } from './delivery-fee.js';
import { splitFoodRevenue } from './food-revenue.js';

export async function addEntry(data, session) {
  const options = session ? { session } : {};
  const [entry] = await Ledger.create([data], options);
  return entry;
}

export async function codCommission(order, session) {
  const restaurant = await Restaurant.findById(order.restaurant).session(session);
  if (!restaurant) throw new Error('Restaurant introuvable');
  if (restaurant.walletBalance < order.commissionAmount) throw new Error('Solde restaurant insuffisant pour couvrir la commission');
  await addEntry({
    accountType: 'restaurant_commission', accountId: restaurant._id, order: order._id,
    kind: 'cod_commission', direction: 'debit', amount: order.commissionAmount,
    reference: `COD-${order.code}`, description: `Commission sur commande ${order.code}`
  }, session);
  restaurant.walletBalance -= order.commissionAmount;
  await restaurant.save({ session });
}

export async function getRestaurantBalance(id) {
  const restaurant = await Restaurant.findById(id).select('walletBalance');
  return restaurant?.walletBalance ?? 0;
}




/** Résout le Master unique de la ville ; les parts restent en attente si l'affectation est ambiguë. */
async function resolveCityMaster(city, session) {
  if (!city) return null;
  const masters = await User.find({
    role: 'master', status: 'active',
    $or: [{ city }, { masterCities: city }]
  }).select('_id name').session(session).lean();
  return masters.length === 1 ? masters[0] : null;
}

/**
 * Paiement en ligne : la commission 10 % (7 % DUNU + 3 % Master)
 * est prélevée directement sur la transaction. Le restaurant reçoit 90 %
 * dans son compte de recettes ; le portefeuille Commission n'est jamais touché.
 */
export async function recordOnlineRestaurantRevenueShares(order, session) {
  const subtotal = Number(order.foodSubtotal || 0);
  const shares = splitFoodRevenue(subtotal);
  const city = String(order.deliveryCity || '').trim();
  const restaurant = await Restaurant.findById(order.restaurant).session(session);
  if (!restaurant) throw new Error('Restaurant introuvable pour la répartition des ventes.');
  if (await Ledger.exists({ reference: `FOOD-ONLINE-CUSTOMER-${order.code}` }).session(session)) {
    return { ...shares, duplicate: true };
  }
  const master = await resolveCityMaster(city, session);
  if (subtotal > 0) {
    await addEntry({
      accountType: 'customer', accountId: order.customer, order: order._id,
      kind: 'food_sale_collection', direction: 'debit', amount: subtotal,
      reference: `FOOD-ONLINE-CUSTOMER-${order.code}`,
      description: `Paiement en ligne du sous-total des plats · commande ${order.code}`
    }, session);
    await addEntry({
      accountType: 'delivery_clearing', order: order._id,
      kind: 'food_sale_collection', direction: 'credit', amount: subtotal,
      reference: `FOOD-ONLINE-CLEAR-IN-${order.code}`,
      description: `Encaissement en ligne du sous-total des plats · commande ${order.code}`
    }, session);
    for (const [beneficiary, amount] of [['RESTAURANT', shares.restaurantAmount], ['MASTER', shares.masterAmount], ['DUNU', shares.dunuAmount]]) {
      if (amount > 0) await addEntry({
        accountType: 'delivery_clearing', order: order._id,
        kind: 'food_sale_distribution', direction: 'debit', amount,
        reference: `FOOD-ONLINE-CLEAR-${beneficiary}-${order.code}`,
        description: `Répartition du paiement en ligne (${beneficiary}) · commande ${order.code}`
      }, session);
    }
  }
  if (shares.restaurantAmount > 0) await addEntry({
    accountType: 'restaurant_proceeds', accountId: restaurant._id, order: order._id,
    kind: 'restaurant_sale_income', direction: 'credit', amount: shares.restaurantAmount,
    reference: `FOOD-ONLINE-RESTAURANT-${order.code}`,
    description: `Part restaurant (90 %) sur paiement en ligne · commande ${order.code}`
  }, session);
  if (shares.masterAmount > 0) await addEntry({
    accountType: 'master', accountId: master?._id, order: order._id,
    kind: 'commission_income', direction: 'credit', amount: shares.masterAmount,
    status: master ? 'available' : 'pending', beneficiaryCity: city,
    reference: `FOOD-ONLINE-MASTER-${order.code}`,
    description: master
      ? `Part Master (3 %) sur paiement en ligne · ${city} · commande ${order.code}`
      : `Part Master (3 %) en attente d'affectation · ${city || 'ville non renseignée'} · commande ${order.code}`
  }, session);
  if (shares.dunuAmount > 0) await addEntry({
    accountType: 'platform', order: order._id, kind: 'commission_income',
    direction: 'credit', amount: shares.dunuAmount,
    reference: `FOOD-ONLINE-DUNU-${order.code}`,
    description: `Part DUNU (7 %) sur paiement en ligne · commande ${order.code}`
  }, session);
  order.restaurantFoodAmount = shares.restaurantAmount;
  order.masterFoodAmount = shares.masterAmount;
  order.dunuFoodAmount = shares.dunuAmount;
  order.commissionAmount = shares.masterAmount + shares.dunuAmount;
  return { ...shares, masterAssigned: Boolean(master), masterAssignmentPending: shares.masterAmount > 0 && !master };
}

/**
 * Paiement à la livraison : le restaurant encaisse 100 % du prix des plats
 * directement auprès du client. La commission 10 % (7 % DUNU + 3 % Master)
 * est débitée uniquement du portefeuille Commission prépayé.
 */
export async function recordCodRestaurantCommission(order, session) {
  const subtotal = Number(order.foodSubtotal || 0);
  const shares = splitFoodRevenue(subtotal);
  const commissionAmount = shares.masterAmount + shares.dunuAmount;
  const city = String(order.deliveryCity || '').trim();
  const restaurant = await Restaurant.findById(order.restaurant).session(session);
  if (!restaurant) throw new Error('Restaurant introuvable pour le prélèvement de commission.');
  if (await Ledger.exists({ reference: `COD-${order.code}` }).session(session)) {
    return { ...shares, commissionAmount, duplicate: true };
  }
  if (commissionAmount > 0) {
    const debitFilter = order.codCommissionReserved
      ? {
          _id: restaurant._id,
          walletBalance: { $gte: commissionAmount },
          walletReserved: { $gte: commissionAmount }
        }
      : { _id: restaurant._id, walletBalance: { $gte: commissionAmount } };
    const debitUpdate = order.codCommissionReserved
      ? { $inc: { walletBalance: -commissionAmount, walletReserved: -commissionAmount } }
      : { $inc: { walletBalance: -commissionAmount } };
    const debited = await Restaurant.findOneAndUpdate(debitFilter, debitUpdate, { new: true, session });
    if (!debited) throw new Error(`Réservation ou solde du portefeuille Commission insuffisant : ${commissionAmount.toLocaleString('fr-FR')} FCFA sont nécessaires pour cette commande.`);
    order.codCommissionReserved = false;
    const master = await resolveCityMaster(city, session);
    await addEntry({
      accountType: 'restaurant_commission', accountId: restaurant._id, order: order._id,
      kind: 'cod_commission', direction: 'debit', amount: commissionAmount,
      reference: `COD-${order.code}`,
      description: `Commission prépayée de 10 % (7 % DUNU + 3 % Master) · commande ${order.code}`
    }, session);
    if (shares.masterAmount > 0) await addEntry({
      accountType: 'master', accountId: master?._id, order: order._id,
      kind: 'commission_income', direction: 'credit', amount: shares.masterAmount,
      status: master ? 'available' : 'pending', beneficiaryCity: city,
      reference: `COD-MASTER-${order.code}`,
      description: master
        ? `Part Master (3 %) financée par le portefeuille Commission · ${city} · commande ${order.code}`
        : `Part Master (3 %) en attente d'affectation · ${city || 'ville non renseignée'} · commande ${order.code}`
    }, session);
    if (shares.dunuAmount > 0) await addEntry({
      accountType: 'platform', order: order._id, kind: 'commission_income',
      direction: 'credit', amount: shares.dunuAmount,
      reference: `COD-DUNU-${order.code}`,
      description: `Part DUNU (7 %) financée par le portefeuille Commission · commande ${order.code}`
    }, session);
  }
  // En espèces, le restaurant garde le montant total reçu directement du client.
  order.restaurantFoodAmount = subtotal;
  order.masterFoodAmount = shares.masterAmount;
  order.dunuFoodAmount = shares.dunuAmount;
  order.commissionAmount = commissionAmount;
  return { ...shares, commissionAmount };
}


/** Comptabilise le sous-total des plats selon la règle 90/3/7, sans dépendre
 * de l'ancien système de recharge/abonnement. Les références uniques rendent
 * chaque affectation idempotente et la transaction de livraison atomique. */
export async function recordRestaurantRevenueShares(order, session) {
  const subtotal = Number(order.foodSubtotal || 0);
  const shares = splitFoodRevenue(subtotal);
  const city = String(order.deliveryCity || '').trim();
  const restaurant = await Restaurant.findById(order.restaurant).session(session);
  if (!restaurant) throw new Error('Restaurant introuvable pour la répartition des ventes.');

  let masters = [];
  if (city) {
    masters = await User.find({
      role: 'master', status: 'active',
      $or: [{ city }, { masterCities: city }]
    }).select('_id name').session(session).lean();
  }
  const master = masters.length === 1 ? masters[0] : null;
  const masterDescription = master
    ? `Part Master sur les plats (3 %) · ${city} · commande ${order.code}`
    : `Part Master sur les plats (3 %) en attente d'affectation · ${city || 'ville non renseignée'} · commande ${order.code}`;

  if (subtotal > 0) {
    await addEntry({
      accountType: 'customer', accountId: order.customer, order: order._id,
      kind: 'food_sale_collection', direction: 'debit', amount: subtotal,
      reference: `FOOD-CUSTOMER-${order.code}`,
      description: `Sous-total des plats réglé par le client · commande ${order.code}`
    }, session);
    await addEntry({
      accountType: 'delivery_clearing', order: order._id,
      kind: 'food_sale_collection', direction: 'credit', amount: subtotal,
      reference: `FOOD-CLEAR-IN-${order.code}`,
      description: `Encaissement du sous-total des plats · commande ${order.code}`
    }, session);
    for (const [beneficiary, amount] of [['RESTAURANT', shares.restaurantAmount], ['MASTER', shares.masterAmount], ['DUNU', shares.dunuAmount]]) {
      if (amount > 0) await addEntry({
        accountType: 'delivery_clearing', order: order._id,
        kind: 'food_sale_distribution', direction: 'debit', amount,
        reference: `FOOD-CLEAR-${beneficiary}-${order.code}`,
        description: `Affectation des ventes de plats (${beneficiary}) · commande ${order.code}`
      }, session);
    }
  }

  if (shares.restaurantAmount > 0) await addEntry({
    accountType: 'restaurant_proceeds', accountId: restaurant._id, order: order._id,
    kind: 'restaurant_sale_income', direction: 'credit', amount: shares.restaurantAmount,
    reference: `FOOD-RESTAURANT-${order.code}`,
    description: `Part restaurant (90 %) sur les plats · commande ${order.code}`
  }, session);
  if (shares.masterAmount > 0) await addEntry({
    accountType: 'master', accountId: master?._id, order: order._id,
    kind: 'commission_income', direction: 'credit', amount: shares.masterAmount,
    status: master ? 'available' : 'pending', beneficiaryCity: city,
    reference: `FOOD-MASTER-${order.code}`, description: masterDescription
  }, session);
  if (shares.dunuAmount > 0) await addEntry({
    accountType: 'platform', order: order._id, kind: 'commission_income',
    direction: 'credit', amount: shares.dunuAmount,
    reference: `FOOD-DUNU-${order.code}`,
    description: `Part DUNU (7 %) sur les plats · commande ${order.code}`
  }, session);

  order.restaurantFoodAmount = shares.restaurantAmount;
  order.masterFoodAmount = shares.masterAmount;
  order.dunuFoodAmount = shares.dunuAmount;
  return { ...shares, masterAssigned: Boolean(master), masterAssignmentPending: shares.masterAmount > 0 && !master };
}

/** Enregistre les parts des frais de livraison dans la transaction de clôture. */
export async function recordDeliveryFeeShares(order, session) {
  const fee = Number(order.deliveryFee || 0);
  const shares = splitDeliveryFee(fee);
  const city = String(order.deliveryCity || '').trim();
  if (!order.rider) throw new Error('Aucun livreur affecté : répartition des frais de livraison impossible.');

  let masters = [];
  if (city) {
    masters = await User.find({
      role: 'master', status: 'active',
      $or: [{ city }, { masterCities: city }]
    }).select('_id name').session(session).lean();
  }
  const master = masters.length === 1 ? masters[0] : null;
  const masterDescription = master
    ? `Part Master (3 %) · ${city} · commande ${order.code}`
    : `Part Master (3 %) en attente d'affectation · ${city || 'ville non renseignée'} · commande ${order.code}`;

  if (fee > 0) {
    // Comptabilité à double entrée : le frais reçu du client passe par un compte
    // de compensation, puis ce compte est soldé par les trois affectations.
    await addEntry({
      accountType: 'customer', accountId: order.customer, order: order._id,
      kind: 'delivery_fee_collection', direction: 'debit', amount: fee,
      reference: `DEL-CUSTOMER-${order.code}`,
      description: `Frais de livraison réglés par le client · commande ${order.code}`
    }, session);
    await addEntry({
      accountType: 'delivery_clearing', order: order._id,
      kind: 'delivery_fee_collection', direction: 'credit', amount: fee,
      reference: `DEL-CLEAR-IN-${order.code}`,
      description: `Réception des frais de livraison · commande ${order.code}`
    }, session);
    for (const [beneficiary, amount] of [['MASTER', shares.masterAmount], ['DUNU', shares.dunuAmount], ['RIDER', shares.riderAmount]]) {
      if (amount > 0) await addEntry({
        accountType: 'delivery_clearing', order: order._id,
        kind: 'delivery_fee_distribution', direction: 'debit', amount,
        reference: `DEL-CLEAR-${beneficiary}-${order.code}`,
        description: `Affectation des frais de livraison (${beneficiary}) · commande ${order.code}`
      }, session);
    }
  }

  if (shares.masterAmount > 0) {
    await addEntry({
      accountType: 'master', accountId: master?._id, order: order._id,
      kind: 'commission_income', direction: 'credit', amount: shares.masterAmount,
      status: master ? 'available' : 'pending', beneficiaryCity: city,
      reference: `DEL-MASTER-${order.code}`, description: masterDescription
    }, session);
  }
  if (shares.dunuAmount > 0) {
    await addEntry({
      accountType: 'platform', order: order._id, kind: 'commission_income',
      direction: 'credit', amount: shares.dunuAmount,
      reference: `DEL-DUNU-${order.code}`,
      description: `Part DUNU (7 %) · commande ${order.code}`
    }, session);
  }
  if (shares.riderAmount > 0) {
    await addEntry({
      accountType: 'rider', accountId: order.rider, order: order._id,
      kind: 'rider_earning', direction: 'credit', amount: shares.riderAmount,
      reference: `DEL-RIDER-${order.code}`,
      description: `Part livreur (solde des frais, cible 90 %) · commande ${order.code}`
    }, session);
  }
  // Conserve les montants calculés sur la commande pour l'historique et les rapports.
  order.masterFee = shares.masterAmount;
  order.dunuDeliveryFee = shares.dunuAmount;
  order.riderFee = shares.riderAmount;
  return { ...shares, masterAssigned: Boolean(master), masterAssignmentPending: shares.masterAmount > 0 && !master };
}
