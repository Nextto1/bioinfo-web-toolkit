const MAX_SEQUENCE = 10000;
function invalid(message, status = 400) { return Object.assign(new Error(message), { status }); }
function sequence(value, protein = false) {
  if (typeof value !== 'string' || value.length > MAX_SEQUENCE * 2) throw invalid('Sequence is missing or too large');
  const seq = value.replace(/\s/g, '').toUpperCase();
  if (!seq || seq.length > MAX_SEQUENCE || !(protein ? /^[ACDEFGHIKLMNPQRSTVWY]+$/ : /^[ACGT]+$/).test(seq))
    throw invalid(`Use 1-${MAX_SEQUENCE} ${protein ? 'standard amino acids' : 'unambiguous DNA bases (ACGT)'}`);
  return seq;
}
function parseSequences(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
  const records = [];
  if (lines[0]?.startsWith('>')) {
    for (const line of lines) {
      if (line.startsWith('>')) {
        const header = line.slice(1).trim();
        if (!header || header.length > 200) throw invalid('Invalid FASTA header');
        records.push({ header, seq: '' });
      } else records.at(-1).seq += line;
    }
  } else lines.forEach((seq, i) => records.push({ header: `Seq_${i + 1}`, seq }));
  if (!records.length || records.length > 100) throw invalid('Upload must contain 1-100 sequences');
  let total = 0;
  for (const record of records) { record.seq = sequence(record.seq); total += record.seq.length; }
  if (total > 100000) throw invalid('Upload exceeds 100000 total bases');
  return records;
}
function findORFs(dna) {
  const rc = [...dna].reverse().map(n => ({ A:'T', T:'A', C:'G', G:'C' })[n]).join('');
  const orfs = [];
  for (const [seq, strand] of [[dna, '+'], [rc, '-']]) {
    for (let offset = 0; offset < 3; offset++) {
      let starts = [];
      for (let i = offset; i + 2 < seq.length; i += 3) {
        const codon = seq.slice(i, i + 3);
        if (codon === 'ATG') starts.push(i);
        if (['TAA','TAG','TGA'].includes(codon)) {
          for (const start of starts) orfs.push({ frame: `${strand}${offset + 1}`, start: strand === '+' ? start + 1 : dna.length - (i + 3) + 1, end: strand === '+' ? i + 3 : dna.length - start, length: i + 3 - start });
          starts = [];
        }
      }
    }
  }
  return { rc, orfs, bestORF: orfs.reduce((best, o) => !best || o.length > best.length ? o : best, null) };
}
function parseBlast(text) {
  let query = '', hit = '', hsp = null;
  const rows = [];
  function flush() { if (hsp?.identity !== undefined && hsp.evalue) rows.push(`Query: ${query}\nHit: ${hit}\nIdentity: ${hsp.identity}%\nLength: ${hsp.length}\nE-value: ${hsp.evalue}\n------------------------`); hsp = null; }
  for (const line of text.split(/\r?\n/)) {
    if (/^Query=/.test(line)) { flush(); query = line.slice(6).trim(); hit = ''; }
    if (/^>/.test(line)) { flush(); hit = line.slice(1).trim(); }
    if (/Score\s*=/.test(line)) { flush(); hsp = {}; }
    const expect = line.match(/Expect(?:\(\d+\))?\s*=\s*([^\s,]+)/);
    if (expect) { hsp ||= {}; hsp.evalue = expect[1]; }
    const ids = line.match(/Identities\s*=\s*(\d+)\/(\d+)/);
    if (ids && +ids[2] > 0 && +ids[1] <= +ids[2]) { hsp ||= {}; hsp.identity = (100 * ids[1] / ids[2]).toFixed(2); hsp.length = ids[2]; }
  }
  flush();
  if (!rows.length) throw invalid('No complete pairwise BLAST alignments found');
  return rows.join('\n');
}
module.exports = { sequence, parseSequences, findORFs, parseBlast, invalid };
