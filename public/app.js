'use strict';
const analysisReport = { dna: [], gc: [], motif: [], localization: [], blast: [], uniprot: [], multi: [] };
function show(id) {
    document.querySelectorAll('.section').forEach(section => section.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}
async function analyze(url, body, output, category, format = value => value) {
    const element = document.getElementById(output);
    element.innerText = 'Working...';
    try {
        const response = await fetch(url, { method: 'POST', body });
        const json = (response.headers.get('content-type') || '').includes('application/json');
        const value = json ? await response.json() : await response.text();
        if (!response.ok || value?.error) throw new Error(value?.error || 'Analysis failed. Please retry.');
        const result = format(value);
        element.innerText = result;
        analysisReport[category].push(result);
    } catch (error) {
        element.innerText = error instanceof TypeError ? 'Unable to reach the server. Please retry.' : error.message;
    }
}
function runTranslate() {
    return analyze('/translate', new URLSearchParams({ dna: document.getElementById('dnaSeq').value }), 'r1', 'dna');
}
function runTool(url, input, output) {
    return analyze(url, new URLSearchParams({ dna: document.getElementById(input).value }), output, 'gc');
}
function runAdvanced() {
    return analyze('/translate-advanced', new URLSearchParams({ dna: document.getElementById('dnaSeq').value }), 'r1', 'dna', data => {
        const frames = Object.entries(data.frames).map(([frame, protein]) => `=== ${frame} ===\n${protein}`).join('\n\n');
        const orfs = data.orfs.map(o => `Frame ${o.frame} | Start: ${o.start} | End: ${o.end} | Length: ${o.length} bp`).join('\n') || 'No complete ORFs found';
        const best = data.bestORF;
        return `6-FRAME TRANSLATION\n\n${frames}\n\nORFs\n${data.coordinateSystem}\n${orfs}` + (best ? `\n\nLONGEST ORF\nFrame ${best.frame} | ${best.start}-${best.end} (${best.length} bp)` : '');
    });
}
function motifRun() {
    return analyze('/motif', new URLSearchParams({ sequence: document.getElementById('motifSeq').value, motif: document.getElementById('motifText').value }), 'r3', 'motif');
}
function runLocalization() {
    return analyze('/localization', new URLSearchParams({ protein: document.getElementById('protSeq').value }), 'r4', 'localization', data => `Location: ${data.location}\nHeuristic: ${data.rawPrediction}\n${data.link}`);
}
function uniprotRun() {
    return analyze('/uniprot', new URLSearchParams({ id: document.getElementById('upid').value }), 'uniOut', 'uniprot', data => `${data.protein}\n${data.organism}\nGene: ${data.gene}\nLength: ${data.length}\n\n${data.functionText}`);
}
function uploadAnalysis(input, url, output, category, format) {
    const file = document.getElementById(input).files[0];
    if (!file) { document.getElementById(output).innerText = 'Choose a text file first.'; return; }
    if (file.size > 1024 * 1024) { document.getElementById(output).innerText = 'File must be at most 1 MiB.'; return; }
    const body = new FormData();
    body.append('file', file);
    return analyze(url, body, output, category, format);
}
function blastRun() { return uploadAnalysis('blastFile', '/upload-blast', 'blastOut', 'blast'); }
function runMulti() { return uploadAnalysis('multiFile', '/upload-multi', 'multiOut', 'multi', data => data.report); }
function downloadReport() {
    const report = 'BIOINFORMATICS REPORT\n\n' + Object.entries(analysisReport).map(([category, results]) => `=== ${category.toUpperCase()} ===\n${results.join('\n\n')}`).join('\n\n');
    const objectUrl = URL.createObjectURL(new Blob([report], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = objectUrl; link.download = 'report.txt'; link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
