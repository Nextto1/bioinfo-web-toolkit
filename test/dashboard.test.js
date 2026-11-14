const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function dashboard(fetch) {
  const elements = new Map();
  const context = vm.createContext({ URLSearchParams, FormData, Blob, TypeError, URL, setTimeout, fetch,
    document: { getElementById: id => { if (!elements.has(id)) elements.set(id, { value: '', innerText: '', files: [] }); return elements.get(id); } }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../public/app.js'), 'utf8'), context);
  return { context, element: id => context.document.getElementById(id), run: code => vm.runInContext(code, context) };
}
test('GC button submits encoded input, renders result and records success', async () => {
  let request;
  const ui=dashboard(async (url, options) => { request={url,options}; return new Response('50.00'); });
  ui.element('gcSeq').value='AC GT\n';
  await ui.run("runTool('/gc','gcSeq','r2')");
  assert.equal(request.url,'/gc'); assert.equal(request.options.body.get('dna'),'AC GT\n');
  assert.equal(ui.element('r2').innerText,'50.00'); assert.equal(ui.run('analysisReport.gc[0]'),'50.00');
});
test('validation errors display on localization and UniProt without report entries', async () => {
  const ui=dashboard(async()=>new Response(JSON.stringify({error:'Invalid sequence'}),{status:400,headers:{'content-type':'application/json'}}));
  await ui.run('runLocalization()'); await ui.run('uniprotRun()');
  assert.equal(ui.element('r4').innerText,'Invalid sequence'); assert.equal(ui.element('uniOut').innerText,'Invalid sequence');
  assert.equal(ui.run('analysisReport.localization.length + analysisReport.uniprot.length'),0);
});
test('missing and oversized uploads never send a request', async () => {
  let count=0; const ui=dashboard(async()=>{count++;});
  await ui.run('blastRun()'); assert.match(ui.element('blastOut').innerText,/Choose/);
  ui.element('multiFile').files=[{size:1024*1024+1}]; await ui.run('runMulti()');
  assert.match(ui.element('multiOut').innerText,/1 MiB/); assert.equal(count,0);
});
test('network failure is visible and excluded from reports', async () => {
  const ui=dashboard(async()=>{throw new TypeError('fetch failed');});
  await ui.run('runTranslate()'); assert.match(ui.element('r1').innerText,/Unable to reach/); assert.equal(ui.run('analysisReport.dna.length'),0);
});
test('HTML action handlers are all defined and dashboard code is local', () => {
  const html=fs.readFileSync(require.resolve('../public/index.html'),'utf8'); const ui=dashboard();
  for(const match of html.matchAll(/onclick="([A-Za-z]+)\(/g)) assert.equal(ui.run(`typeof ${match[1]}`),'function',match[1]);
  assert.match(html, /src="\/app.js"/); assert.doesNotMatch(html,/cdn.jsdelivr/);
});
