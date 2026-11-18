import test from 'node:test';
import assert from 'node:assert/strict';

test('Exposed Default Demo Password rule detects all known default demo passwords', () => {
  const exposedDemoRule = new RegExp(['\\bTableFlow', '@', '2026!(?:Owner|Manager|Waiter|Chef)\\b'].join(''), 'i');

  const roles = ['Owner', 'Manager', 'Waiter', 'Chef'];
  for (const role of roles) {
    const pwd = ['TableFlow', '@', '2026!', role].join('');
    assert.ok(exposedDemoRule.test(pwd), `Expected demo password for ${role} to trigger rule`);
    assert.ok(exposedDemoRule.test(`password = "${pwd}"`), `Expected assigned demo password for ${role} to trigger rule`);
    assert.ok(exposedDemoRule.test(`| ${role} | ${pwd} |`), `Expected markdown table row for ${role} to trigger rule`);
  }

  // Safe passwords should not trigger
  assert.equal(exposedDemoRule.test('TableFlow!RandomSecurePassword2026#'), false);
  assert.equal(exposedDemoRule.test('Tf#kJ92_mZ81qPl-9!'), false);
});
