const { execFile } = require('node:child_process');
const path = require('node:path');
const scripts = new Set(['translate', 'gc_content', 'motif']);
let active = 0;
function runPerl(script, args) {
  if (!scripts.has(script)) return Promise.reject(new Error('Unknown analysis'));
  if (active >= 8) return Promise.reject(Object.assign(new Error('Analysis capacity reached; retry later'), { status: 503 }));
  active++;
  return new Promise((resolve, reject) => {
    execFile('perl', [path.join(__dirname, '..', 'scripts', `${script}.pl`), ...args],
      { shell: false, timeout: 5000, maxBuffer: 256 * 1024, windowsHide: true }, (error, stdout) => {
        active--;
        if (error) reject(Object.assign(new Error('Analysis failed'), { status: 500 }));
        else resolve(stdout.trim());
      });
  });
}
module.exports = { runPerl };
