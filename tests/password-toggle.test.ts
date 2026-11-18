import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { PasswordField } from '../src/components/ui/PasswordField';

test('PasswordField UI: renders with password hidden by default and accessible attributes', () => {
  const html = renderToString(
    React.createElement(PasswordField, {
      id: 'test-pass',
      value: 'secret123',
      onChange: () => {},
      placeholder: 'Enter password',
      required: true,
      minLength: 8,
      maxLength: 72,
    })
  );

  // Default type must be password (hidden)
  assert.match(html, /type="password"/);

  // Must have min 44px tap target classes for mobile accessibility
  assert.match(html, /min-h-\[44px\]/);
  assert.match(html, /min-w-\[44px\]/);

  // Button accessibility attributes
  assert.match(html, /aria-label="Show password"/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /type="button"/);

  // Inline SVG icon present (viewBox 0 0 24 24)
  assert.match(html, /<svg[^>]*viewBox="0 0 24 24"/);

  // Input attributes
  assert.match(html, /id="test-pass"/);
  assert.match(html, /placeholder="Enter password"/);
  assert.match(html, /minlength="8"/i);
  assert.match(html, /maxlength="72"/i);
});

test('PasswordField UI: supports hidden label (screen-reader only) for dense layouts', () => {
  const html = renderToString(
    React.createElement(PasswordField, {
      id: 'staff-pass',
      label: 'Staff Password',
      hideLabel: true,
      value: '',
      onChange: () => {},
    })
  );

  assert.match(html, /<label[^>]*class="[^"]*sr-only[^"]*"[^>]*>Staff Password<\/label>/);
});

test('PasswordField UI: displays validation error message when provided', () => {
  const html = renderToString(
    React.createElement(PasswordField, {
      id: 'error-pass',
      value: 'short',
      onChange: () => {},
      error: 'Password must be at least 8 characters',
    })
  );

  assert.match(html, /border-tomato/);
  assert.match(html, /Password must be at least 8 characters/);
});
