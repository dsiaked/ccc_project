import { readFileSync } from 'fs';

const css = readFileSync('src/pages/admin/AdminBoardingPage.module.css', 'utf8');

// Find min(85vh, 700px)
const idx = css.indexOf('min(85vh, 700px)');
if (idx !== -1) {
  console.log('Found min(85vh, 700px) at index:', idx);
  console.log(css.substring(idx - 200, idx + 200));
} else {
  console.log('Not found min(85vh, 700px)');
}
