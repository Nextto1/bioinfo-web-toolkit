const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { runPerl } = require('../src/perl');
const { findORFs, parseSequences, parseBlast } = require('../src/analysis');
let server, base;
before(async () => { server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => new Promise(r => server.close(r)));
const post = (url, data) => fetch(base + url, { method: 'POST', body: new URLSearchParams(data) });
const upload = (url, value) => { const form = new FormData(); form.append('file', new Blob([value]), 'test.txt'); return fetch(base + url, { method: 'POST', body: form }); };
test('standard genetic code and GC use actual Perl', async () => {
  assert.equal(await (await post('/translate', { dna: ' atg aaa taa\n' })).text(), 'MK*');
  assert.equal(await (await post('/gc', { dna: 'ACGT' })).text(), '50.00');
  assert.equal(await (await post('/translate', { dna: 'A' })).text(), '');
});
test('reject shell and regex injection, ambiguity, missing and duplicate fields', async () => {
  for (const dna of ['', 'ATGN', 'ATG";echo hacked', 'A'.repeat(10001)]) assert.equal((await post('/translate', { dna })).status, 400);
  assert.equal((await post('/motif', { sequence: 'AAA', motif: '(A+)+' })).status, 400);
  const r = await fetch(base + '/gc', { method: 'POST', headers: { 'Content-Type':'application/x-www-form-urlencoded' }, body: 'dna=ATG&dna=AAA' }); assert.equal(r.status, 400);
});
test('Perl helper passes hostile arguments literally', async () => {
  assert.equal(await runPerl('gc_content', ['GC";echo INJECTED']), '23.53');
  await assert.rejects(runPerl('../server', []));
});
test('motif is literal, overlapping and zero-based', async () => { assert.equal(await (await post('/motif', { sequence:'AAAA', motif:'AA' })).text(), '0,1,2'); });
test('all six frames and original-strand ORF coordinates', async () => {
  const data = await (await post('/translate-advanced', { dna:'ATGAAATAA' })).json();
  assert.equal(Object.keys(data.frames).length, 6); assert.equal(data.frames['+1'], 'MK*');
  assert.deepEqual(data.bestORF, { frame:'+1', start:1, end:9, length:9 });
  assert.deepEqual(findORFs('TTATTTCAT').bestORF, { frame:'-1', start:1, end:9, length:9 });
  assert.equal(findORFs('ATGAAA').bestORF, null);
});
test('FASTA CRLF, limits and malformed records', () => {
  assert.deepEqual(parseSequences('>one\r\natg\r\naaa'), [{ header:'one', seq:'ATGAAA' }]);
  for (const value of ['', '>one\n>two\nATG', 'junk\n>one\nATG', Array(102).fill('ATG').join('\n')]) assert.throws(() => parseSequences(value));
});
test('bounded in-memory upload pipeline handles success and rejection', async () => {
  const r = await upload('/upload-multi', '>a\nATGAAA\n>b\nGC'); assert.equal(r.status, 200);
  const data = await r.json(); assert.deepEqual(data.length, [6,2]); assert.deepEqual(data.gc, [16.67,100]);
  assert.equal((await upload('/upload-multi', '')).status, 400);
  assert.equal((await upload('/upload-multi', new Uint8Array([255]))).status, 400);
  assert.equal((await upload('/upload-multi', 'A'.repeat(1024*1024+1))).status, 413);
  assert.equal((await post('/upload-multi', {})).status, 400);
  const form = new FormData(); form.append('wrong', new Blob(['ATG']), 'x'); assert.equal((await fetch(base+'/upload-multi', {method:'POST',body:form})).status,400);
});
test('BLAST Expect before identities stays with correct HSP', async () => {
  const input = 'Query= q\n>h\n Score = 50 bits, Expect = 1e-10\n Identities = 8/10 (80%)\n Score = 30 bits, Expect(2) = 2e-3\n Identities = 3/6 (50%)';
  const output = parseBlast(input); assert.match(output, /Identity: 80.00%\nLength: 10\nE-value: 1e-10/); assert.match(output, /Identity: 50.00%\nLength: 6\nE-value: 2e-3/);
  assert.equal((await upload('/upload-blast', input)).status,200); assert.throws(() => parseBlast('garbage'));
});
test('localization reports uncertainty instead of invented confidence', async () => {
  const data = await (await post('/localization',{protein:'MAAAAA'})).json(); assert.equal(data.location,'Unknown'); assert.equal(data.confidence,null);
  assert.equal((await (await post('/localization',{protein:'MAKDEL'})).json()).location,'Endoplasmic Reticulum');
});
test('body limits and UniProt path validation', async () => {
  assert.equal((await post('/gc',{dna:'A'.repeat(40000)})).status,413);
  assert.equal((await post('/uniprot',{id:'../../etc/passwd'})).status,400);
});

test('UniProt success, not-found, timeout and response-size failures use injected upstream', async () => {
  for (const [fetchImpl, expected] of [
    [async () => new Response(JSON.stringify({sequence:{length:10},organism:{scientificName:'Synthetic'}})),200],
    [async () => new Response('',{status:404}),404],
    [async () => { throw new Error('timeout'); },502],
    [async () => new Response('A'.repeat(2*1024*1024+1)),502]
  ]) {
    const local = createApp({fetchImpl}).listen(0,'127.0.0.1'); await new Promise(r=>local.once('listening',r));
    try { const response=await fetch(`http://127.0.0.1:${local.address().port}/uniprot`,{method:'POST',body:new URLSearchParams({id:'P69905'})}); assert.equal(response.status,expected); }
    finally { await new Promise(r=>local.close(r)); }
  }
});
test('analysis errors do not leak internal details or return partial success', async () => {
  const local=createApp({run:async()=>{throw Error('private internal path');}}).listen(0,'127.0.0.1'); await new Promise(r=>local.once('listening',r));
  try { const r=await fetch(`http://127.0.0.1:${local.address().port}/translate`,{method:'POST',body:new URLSearchParams({dna:'ATG'})}); assert.equal(r.status,500); assert.deepEqual(await r.json(),{error:'Analysis failed'}); }
  finally { await new Promise(r=>local.close(r)); }
});
