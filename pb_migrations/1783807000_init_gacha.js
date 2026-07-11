/// <reference path="../pb_data/types.d.ts" />
// Gacha schema: wallets, collection_units, ally_armies, leaderboard_runs,
// plus a required unique username on users (shown on leaderboards).
// Wallets and collection_units are mutated only by pb_hooks (rules locked).

migrate(
  (txApp) => {
    const users = txApp.findCollectionByNameOrId('users');

    users.fields.add(
      new TextField({
        name: 'username',
        required: true,
        min: 3,
        max: 20,
        pattern: '^[a-zA-Z0-9_]+$',
      })
    );
    users.indexes.push('CREATE UNIQUE INDEX idx_users_username ON users (username)');
    // allow expand(user) on leaderboards/allies; email stays hidden by default
    users.viewRule = "@request.auth.id != ''";
    txApp.save(users);

    txApp.save(
      new Collection({
        type: 'base',
        name: 'wallets',
        listRule: 'user = @request.auth.id',
        viewRule: 'user = @request.auth.id',
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'user',
            type: 'relation',
            required: true,
            collectionId: users.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'coins', type: 'number', min: 0, onlyInt: true },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_wallets_user ON wallets (user)'],
      })
    );

    txApp.save(
      new Collection({
        type: 'base',
        name: 'collection_units',
        listRule: 'user = @request.auth.id',
        viewRule: 'user = @request.auth.id',
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'user',
            type: 'relation',
            required: true,
            collectionId: users.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'unit_slug', type: 'text', required: true },
          { name: 'copies', type: 'number', min: 0, onlyInt: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_cu_user_slug ON collection_units (user, unit_slug)',
        ],
      })
    );

    txApp.save(
      new Collection({
        type: 'base',
        name: 'ally_armies',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'user',
            type: 'relation',
            required: true,
            collectionId: users.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'army', type: 'json' },
          { name: 'combat_score', type: 'number', onlyInt: true },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_ally_user ON ally_armies (user)'],
      })
    );

    txApp.save(
      new Collection({
        type: 'base',
        name: 'leaderboard_runs',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'user',
            type: 'relation',
            required: true,
            collectionId: users.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          { name: 'mode', type: 'select', values: ['solo', 'ally'], maxSelect: 1, required: true },
          { name: 'depth', type: 'number', onlyInt: true },
          { name: 'combat_score', type: 'number', onlyInt: true },
          { name: 'created', type: 'autodate', onCreate: true },
        ],
      })
    );
  },
  (txApp) => {
    for (const name of ['leaderboard_runs', 'ally_armies', 'collection_units', 'wallets']) {
      txApp.delete(txApp.findCollectionByNameOrId(name));
    }
    const users = txApp.findCollectionByNameOrId('users');
    users.fields.removeByName('username');
    users.indexes = users.indexes.filter((i) => !i.includes('idx_users_username'));
    txApp.save(users);
  }
);
