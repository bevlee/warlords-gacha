// Guards the deliberate duplications between the client config and the
// PocketBase JSVM hooks, which can't import the TS modules.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { TIER_ODDS, PACK_COST } from './config';
import { CATALOG } from '$lib/engine/catalog';

const hooks = readFileSync('pb_hooks/gacha.pb.js', 'utf8');
const generated = readFileSync('pb_hooks/lib/catalog.js', 'utf8');

describe('pb_hooks stay in sync', () => {
  it('tier odds table matches config.ts', () => {
    const percents = TIER_ODDS.map((o) => Math.round(o * 100)).join(', ');
    expect(hooks).toContain(`const TIER_PERCENTS = [${percents}];`);
  });

  it('pack cost matches config.ts', () => {
    expect(hooks).toContain(`const PACK_COST = ${PACK_COST};`);
  });

  it('generated catalog matches the engine (rerun npm run export-catalog)', () => {
    const minimal = CATALOG.map((u) => ({ slug: u.slug, tier: u.tier }));
    expect(generated).toContain(JSON.stringify(minimal));
  });
});
