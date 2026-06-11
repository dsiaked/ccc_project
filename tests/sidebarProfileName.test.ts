import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sidebar = readFileSync('src/components/Sidebar.tsx', 'utf8');

test('sidebar displays the authenticated user metadata name while loading the profile', () => {
  assert.match(
    sidebar,
    /const metadataName = getMetadataName\(data\.session\.user\.user_metadata\)/
  );
  assert.match(
    sidebar,
    /setProfile\(\{\s*name: metadataName,\s*email: data\.session\.user\.email \?\? null,\s*\}\)/
  );
});

test('sidebar falls back to the authenticated user metadata when profile name is unavailable', () => {
  assert.match(sidebar, /name: profileData\?\.name\?\.trim\(\) \|\| metadataName/);
});
