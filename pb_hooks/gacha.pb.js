/// <reference path="../pb_data/types.d.ts" />
// Gacha endpoints. All mutations to wallets/collection_units go through here
// (their API rules are locked); clients only read those collections directly.

routerAdd(
  'POST',
  '/api/gacha/pull',
  (e) => {
    const { CATALOG } = require(__hooks + '/lib/catalog.js');
    // duplicated from src/lib/gacha/config.ts — keep in sync
    const TIER_PERCENTS = [34, 25, 18, 12, 7, 3, 1];
    const PACK_COST = 100;

    let result;
    $app.runInTransaction((tx) => {
      const wallet = require(__hooks + '/lib/wallet.js').getOrCreate(tx, e.auth.id);
      const coins = wallet.getInt('coins');
      if (coins < PACK_COST) throw new BadRequestError('Not enough coins');
      wallet.set('coins', coins - PACK_COST);
      tx.save(wallet);

      const r = Math.random() * 100;
      let cum = 0;
      let tier = TIER_PERCENTS.length;
      for (let i = 0; i < TIER_PERCENTS.length; i++) {
        cum += TIER_PERCENTS[i];
        if (r < cum) {
          tier = i + 1;
          break;
        }
      }
      const bucket = CATALOG.filter((u) => u.tier === tier);
      const unit = bucket[Math.floor(Math.random() * bucket.length)];

      let rec;
      let before = 0;
      try {
        rec = tx.findFirstRecordByFilter('collection_units', 'user = {:u} && unit_slug = {:s}', {
          u: e.auth.id,
          s: unit.slug,
        });
        before = rec.getInt('copies');
        rec.set('copies', before + 1);
      } catch (_) {
        rec = new Record(tx.findCollectionByNameOrId('collection_units'), {
          user: e.auth.id,
          unit_slug: unit.slug,
          copies: 1,
        });
      }
      tx.save(rec);

      result = {
        unitSlug: unit.slug,
        copiesBefore: before,
        copiesAfter: before + 1,
        coins: coins - PACK_COST,
      };
    });
    return e.json(200, result);
  },
  $apis.requireAuth()
);

routerAdd(
  'POST',
  '/api/gacha/reward',
  (e) => {
    const amount = e.requestInfo().body.coins;
    if (!Number.isInteger(amount) || amount <= 0 || amount > 1000) {
      throw new BadRequestError('Invalid amount');
    }
    let coins;
    $app.runInTransaction((tx) => {
      const wallet = require(__hooks + '/lib/wallet.js').getOrCreate(tx, e.auth.id);
      coins = wallet.getInt('coins') + amount;
      wallet.set('coins', coins);
      tx.save(wallet);
    });
    return e.json(200, { coins });
  },
  $apis.requireAuth()
);

routerAdd(
  'POST',
  '/api/gacha/publish-run',
  (e) => {
    const body = e.requestInfo().body;
    const mode = body.mode;
    const depth = body.depth;
    const score = body.combatScore;
    const army = body.army;
    if (mode !== 'solo' && mode !== 'ally') throw new BadRequestError('Invalid mode');
    if (!Number.isInteger(depth) || depth < 1) throw new BadRequestError('Invalid depth');
    if (!Number.isInteger(score) || score < 0) throw new BadRequestError('Invalid combatScore');

    $app.runInTransaction((tx) => {
      tx.save(
        new Record(tx.findCollectionByNameOrId('leaderboard_runs'), {
          user: e.auth.id,
          mode: mode,
          depth: depth,
          combat_score: score,
        })
      );
      // completing the 10-node run publishes you as a summonable ally
      if (depth >= 10 && Array.isArray(army)) {
        let rec;
        try {
          rec = tx.findFirstRecordByFilter('ally_armies', 'user = {:u}', { u: e.auth.id });
        } catch (_) {
          rec = new Record(tx.findCollectionByNameOrId('ally_armies'), { user: e.auth.id });
        }
        rec.set('army', army);
        rec.set('combat_score', score);
        tx.save(rec);
      }
    });
    return e.json(200, { ok: true });
  },
  $apis.requireAuth()
);
