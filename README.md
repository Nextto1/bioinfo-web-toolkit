# Bioinformatics web toolkit

Requires Node.js 22+ and Perl on PATH. Run `npm ci --ignore-scripts`, `npm test`, then `npm start`. The server binds to localhost:3000; PORT can override the port. Do not expose directly to the internet: use a reverse proxy with TLS, authentication, request deadlines and rate limits for deployment.

## Phase 1 behavior

- Express application creation, analysis helpers and bounded Perl execution are separate modules. Perl is launched with an argument array, never a shell, with a 5-second deadline, 256 KiB output cap and 8-process concurrency cap.
- DNA accepts A/C/G/T only; whitespace and case are normalized. Invalid characters are rejected instead of silently removed. Maximum sequence length is 10,000. Translation uses the standard genetic code, includes `*` stops, and ignores a trailing incomplete codon (including sequences shorter than a codon).
- Motifs are literal, overlapping, zero-based matches over standard amino-acid letters (also suitable for ACGT DNA); maximum motif length is 200. Regex motifs and ambiguous bases are unsupported.
- Six-frame ORFs require ATG and the first in-frame standard stop; nested starts are retained. Coordinates are 1-based inclusive on the original DNA, including the stop, for both strands. Frame refers to the offset on its respective strand. Incomplete ORFs are omitted; longest is measured in bases.
- Localization is an explicitly uncalibrated heuristic: terminal KDEL is flagged as possible ER retention; otherwise Unknown. There is no fabricated numerical confidence or mitochondrial prediction merely because a protein starts with M. Use a validated predictor for biological conclusions.
- BLAST accepts pairwise text and associates Expect and Identities with the same score block. It emits one complete alignment per HSP. Other formats and reports without complete HSPs are rejected.
- Uploads: one UTF-8 text file, at most 1 MiB, no fields, 4 concurrent uploads. Multi-sequence accepts FASTA or one DNA sequence per line, at most 100 records and 100,000 total bases; headers are limited to 200 characters. Files are processed in bounded memory and released with the response; no uploaded data is written to disk.
- URL-encoded/JSON bodies are capped at 32 KiB. Validation returns HTTP 400, oversized payloads 413, capacity exhaustion 503, analysis failure 500 and upstream failure 502. UniProt accepts accession IDs only, uses a fixed host, rejects redirects, times out after 5 seconds and caps its response at 2 MiB.

## Repository hygiene

844 previously tracked node_modules files and 25 opaque uploads were removed from tracking on the Phase 1 branch. Their local copies were preserved and ignored. Upload contents were not reproduced in fixtures or documentation; tests use synthetic data only. Dependency installation uses the lockfile.

Previously committed uploads remain in Git history and main until separately reviewed. Removing tracking cannot revoke previous public exposure. No history rewriting or deletion of original local uploads is part of Phase 1.

`npm test` exercises actual Perl execution and HTTP routes, malformed input, shell/regex payloads, upload boundaries, GC/translation, overlapping motifs, reverse-strand ORFs, BLAST HSP ordering and localization uncertainty. CI runs the same checks on Linux. UniProt tests use injected responses; tests do not require its live service.
