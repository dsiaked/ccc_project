import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('src/pages/ArchitecturePage.tsx', 'utf8');
const styles = readFileSync('src/pages/ArchitecturePage.module.css', 'utf8');
const routes = readFileSync('src/routes/publicRoutes.tsx', 'utf8');

test('architecture document is exposed as a lazy public route', () => {
  assert.match(routes, /'\/architecture': \(\) => import\('\.\.\/pages\/ArchitecturePage'\)/);
  assert.match(routes, /const ArchitecturePage = lazyPage\('\/architecture'\)/);
});

test('architecture document uses static module-level content and progressive rendering', () => {
  assert.match(page, /const layers = \[/);
  assert.match(page, /const ArchitecturePage = \(\) =>/);
  assert.doesNotMatch(page, /useEffect|useState|supabase/);
  assert.match(styles, /content-visibility:\s*auto/);
  assert.match(styles, /@media \(max-width: 640px\)/);
});
