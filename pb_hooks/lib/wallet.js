// Lazy wallet bootstrap: every wallet mutation path goes through here, so
// there is no dependency on user-create event hooks firing.
module.exports.getOrCreate = function (tx, userId) {
  try {
    return tx.findFirstRecordByFilter('wallets', 'user = {:u}', { u: userId });
  } catch (_) {
    const rec = new Record(tx.findCollectionByNameOrId('wallets'), { user: userId, coins: 0 });
    tx.save(rec);
    return rec;
  }
};
