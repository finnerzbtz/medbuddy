import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const problems = [];
const secret =
  /(?:sk[_-][A-Za-z0-9]{24,}|gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{25,}|postgres(?:ql)?:\/\/[^\s]+:[^\s]+@|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
for (const file of files) {
  if (
    /(^|\/)(node_modules|dist|xcuserdata|\.claude)(\/|$)|\.(ipa|p12|p8|mobileprovision|log)$|\.xcarchive\//.test(
      file,
    ) ||
    (/(^|\/)\.env(?:\.|$)/.test(file) && file !== '.env.example')
  )
    problems.push(`${file}: private or generated file`);
  let bytes;
  try {
    bytes = readFileSync(file);
  } catch {
    continue;
  } // a staged deletion
  if (statSync(file).size > 10 * 1024 * 1024)
    problems.push(`${file}: exceeds 10 MiB; review asset storage`);
  if (!bytes.includes(0) && secret.test(bytes.toString('utf8')))
    problems.push(`${file}: possible credential (value withheld)`);
}
if (problems.length) throw new Error(problems.join('\n'));
console.log(
  `Repository hygiene passed (${files.length} tracked files; credential patterns, private paths, asset sizes).`,
);
