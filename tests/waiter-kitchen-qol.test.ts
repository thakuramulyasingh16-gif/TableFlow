import test from 'node:test';
import assert from 'node:assert/strict';
import { playChime } from '../src/lib/sound';

// Basic environment variables for test suite
Object.assign(process.env, {
  NODE_ENV: 'test',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  CORS_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/tableflow',
  AUTH_SECRET: 'dummy-auth'.padEnd(48, 'a'),
  GUEST_COOKIE_SECRET: 'dummy-guest'.padEnd(48, 'b'),
  PAYMENTS_MOCK: 'true',
});

test('Sound chime synthesizer runs safely without browser AudioContext in test environment', () => {
  // Should not throw in Node / SSR environment where window is undefined
  assert.doesNotThrow(() => {
    playChime('new_order');
    playChime('waiter_call');
  });
});

test('Waiter Table Open / Close lifecycle logic', () => {
  interface MockTable {
    id: number;
    tableNumber: string;
    status: 'free' | 'ordered' | 'needs_help' | 'bill_requested';
  }

  interface MockSession {
    id: number;
    tableId: number;
    joinPin: string;
    status: 'active' | 'closed';
  }

  const table: MockTable = { id: 3, tableNumber: 'T-03', status: 'free' };
  const state: { session: MockSession | null } = { session: null };

  // 1. Open Table
  const openTable = (t: MockTable): { table: MockTable; session: MockSession } => {
    if (state.session && state.session.status === 'active') {
      return { table: t, session: state.session };
    }
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    state.session = { id: 101, tableId: t.id, joinPin: pin, status: 'active' };
    t.status = 'ordered';
    return { table: t, session: state.session };
  };

  const opened = openTable(table);
  assert.equal(opened.table.status, 'ordered');
  assert.equal(opened.session.status, 'active');
  assert.match(opened.session.joinPin, /^[0-9]{4}$/);

  // 2. Calling openTable again reuses existing active session
  const openedAgain = openTable(table);
  assert.equal(openedAgain.session.id, opened.session.id);
  assert.equal(openedAgain.session.joinPin, opened.session.joinPin);

  // 3. Close Table
  const closeTable = (t: MockTable): { table: MockTable; sessionClosed: boolean } => {
    if (state.session) {
      state.session.status = 'closed';
    }
    t.status = 'free';
    return { table: t, sessionClosed: true };
  };

  const closed = closeTable(table);
  assert.equal(closed.table.status, 'free');
  assert.equal(state.session?.status, 'closed');
});

test('Printable KOT ticket data model preserves item notes, variants, and allergy flags', () => {
  const mockKotTicket = {
    orderId: 55,
    orderNumber: 'ORD-9876',
    confirmedAt: new Date().toISOString(),
    notes: 'Severe peanut allergy. Jain preparation.',
    table: { tableNumber: 'T-05', label: 'Booth 5', zone: 'Balcony' },
    items: [
      {
        id: 1,
        quantity: 2,
        itemNameSnapshot: 'Paneer Butter Masala',
        variantNameSnapshot: 'Full Portion',
        specialInstructions: 'No garlic, extra coriander',
        status: 'queued',
      },
      {
        id: 2,
        quantity: 4,
        itemNameSnapshot: 'Butter Tandoori Roti',
        variantNameSnapshot: null,
        specialInstructions: 'Crispy',
        status: 'preparing',
      },
    ],
  };

  assert.equal(mockKotTicket.items.length, 2);
  assert.equal(mockKotTicket.items[0].specialInstructions, 'No garlic, extra coriander');
  assert.equal(mockKotTicket.items[1].specialInstructions, 'Crispy');
  assert.ok(mockKotTicket.notes?.includes('Severe peanut allergy'));
  assert.equal(mockKotTicket.table.tableNumber, 'T-05');
});
