import { readFileSync, writeFileSync } from 'node:fs';

const combinedPath = 'sql/setup/combined_supabase_setup.sql';
const setupFiles = [
  '80_notice_audience_and_lifecycle.sql',
  '91_atomic_campus_request_workflow.sql',
  '92_campus_request_read_and_audit.sql',
];

let combined = readFileSync(combinedPath, 'utf8').replaceAll('\r\n', '\n');

for (const setupFile of setupFiles) {
  const beginMarker = `-- BEGIN sql/setup/${setupFile}`;
  const endMarker = `-- END sql/setup/${setupFile}`;
  const sql = readFileSync(`sql/setup/${setupFile}`, 'utf8')
    .replaceAll('\r\n', '\n')
    .trimEnd();
  const section = `-- =========================================================\n${beginMarker}\n-- =========================================================\n\n${sql}\n\n-- =========================================================\n${endMarker}\n-- =========================================================`;
  const start = combined.indexOf(beginMarker);
  const end = combined.indexOf(endMarker);

  if (start >= 0 && end >= start) {
    const sectionStart = combined.lastIndexOf(
      '-- =========================================================',
      start
    );
    const sectionEnd =
      combined.indexOf('-- =========================================================', end) +
      '-- ========================================================='.length;
    combined = `${combined.slice(0, sectionStart)}${section}${combined.slice(sectionEnd)}`;
  } else {
    combined = `${combined.trimEnd()}\n\n${section}\n`;
  }
}

writeFileSync(combinedPath, combined);
