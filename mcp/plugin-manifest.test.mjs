import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'faustus-plugin.json'), 'utf8'));

test('manifest declares the Faustus copilot', () => {
  const c = manifest['x-family']?.copilot;
  assert.equal(c.provider, 'faustus');
  assert.equal(c.contract, '1.0');
  assert.equal(c.panel, '/api/copilot/panel.js');
  assert.ok(c.context.includes('view.editor'));
  assert.ok(c.context.some((k) => k.startsWith('active_objects')));
});

test('manifest describes the local web app and the MCP bridge', () => {
  assert.equal(manifest.app.url_default, 'http://127.0.0.1:5207');
  assert.equal(manifest.app.health.expect.service, 'gamerhoard');
  assert.equal(manifest.app.launch_hint.env.GAMERHOARD_PORT, '5207');
  assert.ok(fs.existsSync(path.join(root, manifest.app.launch_hint.argv[0])));
  assert.equal(manifest.mcp.transport, 'stdio');
  assert.ok(!/no web app/i.test(manifest.notes));
});
