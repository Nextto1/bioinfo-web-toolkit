const express = require('express');
const multer = require('multer');
const path = require('node:path');
const { TextDecoder } = require('node:util');
const { runPerl } = require('./perl');
const { sequence, parseSequences, findORFs, parseBlast, invalid } = require('./analysis');
function createApp({ run = runPerl, fetchImpl = globalThis.fetch } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); res.set('Cache-Control', 'no-store'); next(); });
  app.use(express.urlencoded({ extended: false, limit: '32kb', parameterLimit: 10 }));
  app.use(express.json({ limit: '32kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  const wrap = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);
  const translate = seq => seq.length < 3 ? Promise.resolve('') : run('translate', [seq]);
  app.post('/translate', wrap(async (req, res) => res.type('text').send(await translate(sequence(req.body?.dna)))));
  app.post('/gc', wrap(async (req, res) => res.type('text').send(await run('gc_content', [sequence(req.body?.dna)]))));
  app.post('/motif', wrap(async (req, res) => {
    const seq = sequence(req.body?.sequence, true), motif = sequence(req.body?.motif, true);
    if (motif.length > 200) throw invalid('Motif exceeds 200 residues');
    res.type('text').send(await run('motif', [seq, motif]));
  }));
  app.post('/translate-advanced', wrap(async (req, res) => {
    const dna = sequence(req.body?.dna), { rc, orfs, bestORF } = findORFs(dna), frames = {};
    for (const [seq, strand] of [[dna, '+'], [rc, '-']])
      for (let i = 0; i < 3; i++) frames[`${strand}${i + 1}`] = await translate(seq.slice(i));
    res.json({ frames, orfs, bestORF, coordinateSystem: '1-based inclusive, original input strand; stop codon included' });
  }));
  app.post('/localization', wrap(async (req, res) => {
    const seq = sequence(req.body?.protein, true);
    const location = seq.endsWith('KDEL') ? 'Endoplasmic Reticulum' : 'Unknown';
    res.json({ location, confidence: null, rawPrediction: location === 'Unknown' ? 'Sequence alone is insufficient for a reliable localization prediction' : 'C-terminal KDEL retention motif; heuristic only', link: `https://www.uniprot.org/uniprotkb?query=${encodeURIComponent(location)}` });
  }));
  let uploads = 0;
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024, files: 1, fields: 0, parts: 2, fieldNameSize: 50, headerPairs: 50 } }).single('file');
  const receive = (req, res, next) => {
    if (uploads >= 4) return next(invalid('Upload capacity reached; retry later', 503));
    uploads++;
    let released = false;
    const release = () => { if (!released) { released = true; uploads--; if (req.file) req.file.buffer = undefined; } };
    res.once('finish', release); res.once('close', release);
    upload(req, res, next);
  };
  function text(req) {
    if (!req.file) throw invalid('A file is required');
    try { const value = new TextDecoder('utf-8', { fatal: true }).decode(req.file.buffer); if (value.includes('\0')) throw Error(); return value; }
    catch { throw invalid('Upload must be UTF-8 text'); }
  }
  app.post('/upload-multi', receive, wrap(async (req, res) => {
    const records = parseSequences(text(req)), report = [], gc = [], length = [], labels = [];
    for (const item of records) {
      const value = await run('gc_content', [item.seq]), protein = await translate(item.seq);
      labels.push(item.header); gc.push(Number(value)); length.push(item.seq.length);
      report.push(`${item.header}\nLength: ${item.seq.length}\nGC: ${value}%\nProtein: ${protein}`);
    }
    res.json({ report: report.join('\n\n'), gc, length, labels });
  }));
  app.post('/upload-blast', receive, wrap(async (req, res) => res.type('text').send(parseBlast(text(req)))));
  app.post('/uniprot', wrap(async (req, res) => {
    const id = req.body?.id;
    if (typeof id !== 'string' || !/^(?:[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9](?:[A-Z][A-Z0-9]{2}[0-9]){1,2})(?:-[1-9][0-9]{0,2})?$/.test(id)) throw invalid('Invalid UniProt accession');
    let response, data;
    try {
      response = await fetchImpl(`https://rest.uniprot.org/uniprotkb/${encodeURIComponent(id)}.json`, { signal: AbortSignal.timeout(5000), redirect: 'error' });
      if (response.status === 404) throw invalid('Protein not found', 404);
      if (!response.ok) throw Error();
      const reader = response.body.getReader(); let size = 0; const chunks = [];
      try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 2 * 1024 * 1024) throw Error(); chunks.push(Buffer.from(value)); } }
      finally { await reader.cancel(); }
      data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (err) { if (err.status === 404) throw err; throw invalid('UniProt service unavailable', 502); }
    res.json({ protein: data?.proteinDescription?.recommendedName?.fullName?.value || 'N/A', organism: data?.organism?.scientificName || 'N/A', gene: data?.genes?.[0]?.geneName?.value || 'N/A', length: data?.sequence?.length || 0, functionText: data?.comments?.find(c => c.commentType === 'FUNCTION')?.texts?.[0]?.value || 'No function available' });
  }));
  app.use((err, req, res, next) => {
    const status = err instanceof multer.MulterError ? (err.code === 'LIMIT_FILE_SIZE' ? 413 : 400) : err.status || 500;
    res.status(status).json({ error: status >= 500 && status !== 503 ? (status === 502 ? 'UniProt service unavailable' : 'Analysis failed') : (err instanceof multer.MulterError ? 'Upload exceeds limits or has unexpected fields' : err.message) });
  });
  return app;
}
module.exports = { createApp };
