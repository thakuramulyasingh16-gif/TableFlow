import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import robots from '../src/app/robots';
import { syncAvailabilityForIngredient } from '../src/lib/inventory/availability';

test('Housekeeping: package.json has all dependencies pinned without ^ prefix', () => {
  const pkgPath = path.join(process.cwd(), 'package.json');
  const pkgContent = fs.readFileSync(pkgPath, 'utf8');
  const pkg = JSON.parse(pkgContent);

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const unpinned: string[] = [];

  for (const [dep, ver] of Object.entries(deps)) {
    if (typeof ver === 'string' && (ver.startsWith('^') || ver.startsWith('~'))) {
      unpinned.push(`${dep}: ${ver}`);
    }
  }

  assert.deepEqual(unpinned, [], `All dependencies must be pinned exactly (found unpinned: ${unpinned.join(', ')})`);
});

test('Housekeeping: robots.txt disallows admin, staff, kitchen, chef, api, and table tokens', () => {
  const config = robots();
  assert.ok(config.rules, 'robots config must have rules');

  const rules = Array.isArray(config.rules) ? config.rules[0] : config.rules;
  assert.equal(rules.userAgent, '*');

  const disallowed = Array.isArray(rules.disallow) ? rules.disallow : [rules.disallow];
  assert.ok(disallowed.includes('/admin/'), 'must disallow /admin/');
  assert.ok(disallowed.includes('/chef/'), 'must disallow /chef/');
  assert.ok(disallowed.includes('/kitchen/'), 'must disallow /kitchen/');
  assert.ok(disallowed.includes('/staff/'), 'must disallow /staff/');
  assert.ok(disallowed.includes('/api/'), 'must disallow /api/');
  assert.ok(disallowed.includes('/t/'), 'must disallow /t/');
});

test('Housekeeping: custom branded error and not-found pages exist', () => {
  const notFoundPath = path.join(process.cwd(), 'src/app/not-found.tsx');
  const errorPath = path.join(process.cwd(), 'src/app/error.tsx');
  const globalErrorPath = path.join(process.cwd(), 'src/app/global-error.tsx');

  assert.equal(fs.existsSync(notFoundPath), true, 'not-found.tsx must exist');
  assert.equal(fs.existsSync(errorPath), true, 'error.tsx must exist');
  assert.equal(fs.existsSync(globalErrorPath), true, 'global-error.tsx must exist');

  // Verify none of the error files expose stack traces in the template
  const errorSource = fs.readFileSync(errorPath, 'utf8');
  assert.equal(errorSource.includes('error.stack'), false, 'error.tsx must not leak error.stack');
  const globalErrorSource = fs.readFileSync(globalErrorPath, 'utf8');
  assert.equal(globalErrorSource.includes('error.stack'), false, 'global-error.tsx must not leak error.stack');
});

test('Housekeeping: syncAvailabilityForIngredient accepts transaction client', async () => {
  // Test mock db transaction client
  let calledUpdate = false;
  const mockTx = {
    recipeItem: {
      findMany: async () => [
        {
          menuItem: {
            id: 999,
            name: 'Mock Dish',
            isAvailable: false,
            basePricePaise: 10000,
          },
          isOptional: false,
          quantityPerServing: 1,
          unit: 'pcs',
        },
      ],
    },
    menuItem: {
      findUnique: async () => ({
        id: 999,
        name: 'Mock Dish',
        isAvailable: false,
        recipeItems: [
          {
            isOptional: false,
            ingredient: { id: 1, name: 'Mock Ingredient', stockStatus: 'IN_STOCK' },
          },
        ],
      }),
      update: async () => {
        calledUpdate = true;
        return { id: 999, isAvailable: true };
      },
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await syncAvailabilityForIngredient(1, mockTx as any);
  assert.equal(result.dishCount, 1);
  assert.equal(result.affectedDishes[0], 'Mock Dish');
  assert.equal(calledUpdate, true, 'recalculation must update through the passed transaction client');
});
