const express = require("express");
const bodyParser = require("body-parser");
const { exec } = require("child_process");
const multer = require("multer");
const fs = require("fs");

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

/* =========================================================
   🧬 DNA → PROTEIN
========================================================= */
app.post("/translate", (req, res) => {
    const dna = req.body.dna || "";

    exec(`perl scripts/translate.pl "${dna}"`, (err, out) => {
        if (err) return res.send("❌ Translation error");
        res.send(out.trim());
    });
});

/* =========================================================
   📊 GC CONTENT
========================================================= */
app.post("/gc", (req, res) => {
    const dna = req.body.dna || "";

    exec(`perl scripts/gc_content.pl "${dna}"`, (err, out) => {
        if (err) return res.send("❌ GC error");
        res.send(out.trim());
    });
});

/* =========================================================
   🔍 MOTIF SEARCH
========================================================= */
app.post("/motif", (req, res) => {
    const sequence = req.body.sequence || "";
    const motif = req.body.motif || "";

    exec(`perl scripts/motif.pl "${sequence}" "${motif}"`, (err, out) => {
        if (err) return res.send("❌ Motif error");
        res.send(out.trim());
    });
});

/* =========================================================
   🧪 LOCALIZATION (DETERMINISTIC + CONFIDENCE)
========================================================= */
app.post("/localization", (req, res) => {

    const protein = req.body.protein || "";

    exec(`perl scripts/localization.pl "${protein}"`, (error, stdout) => {
        if (error) return res.json({ error: "Localization error" });

        const raw = stdout.trim();

        // -----------------------------
        // 🧠 Deterministic rule engine
        // -----------------------------
        let location = "Cytoplasm";
        let confidence = 0.6;

        const seq = protein.toUpperCase();

        if (seq.includes("KDEL")) {
            location = "Endoplasmic Reticulum";
            confidence = 0.95;
        } 
        else if (seq.includes("RRR") || seq.includes("RK")) {
            location = "Nucleus";
            confidence = 0.85;
        } 
        else if (seq.includes("MTS") || seq.startsWith("M")) {
            location = "Mitochondria";
            confidence = 0.8;
        } 
        else if (seq.includes("SS") || seq.includes("S/T")) {
            location = "Secretory Pathway";
            confidence = 0.75;
        }

        res.json({
            location,
            rawPrediction: raw,
            confidence: confidence.toFixed(2),
            link: `https://www.uniprot.org/uniprotkb?query=location:${encodeURIComponent(location)}`
        });
    });
});

/* =========================================================
   📂 MULTI-SEQUENCE PIPELINE
========================================================= */
app.post("/upload-multi", upload.single("file"), (req, res) => {

    if (!req.file) return res.send("❌ No file uploaded");

    const text = fs.readFileSync(req.file.path, "utf8");

    let sequences = [];

    if (text.includes(">")) {
        sequences = text.split(">").filter(Boolean).map(e => {
            const lines = e.split("\n");
            return {
                header: lines[0],
                seq: lines.slice(1).join("").replace(/\s/g, "")
            };
        });
    } else {
        sequences = text.split("\n")
            .filter(Boolean)
            .map((seq, i) => ({
                header: "Seq_" + (i + 1),
                seq
            }));
    }

    let results = [];
    let gcValues = [];
    let lengths = [];
    let labels = [];

    let done = 0;

    sequences.forEach((item, i) => {

        exec(`perl scripts/gc_content.pl "${item.seq}"`, (e1, gc) => {

            exec(`perl scripts/translate.pl "${item.seq}"`, (e2, protein) => {

                labels[i] = item.header;
                gcValues[i] = parseFloat(gc || 0);
                lengths[i] = item.seq.length;

                results[i] = `${item.header}
Length: ${item.seq.length}
GC: ${gc?.trim()}%
Protein: ${protein?.trim()}`;

                done++;

                if (done === sequences.length) {
                    res.json({
                        report: results.join("\n\n"),
                        gc: gcValues,
                        length: lengths,
                        labels
                    });
                }
            });
        });
    });
});

/* =========================================================
   🔬 BLAST PARSER (STABLE)
========================================================= */
app.post("/upload-blast", upload.single("file"), (req, res) => {

    if (!req.file) return res.send("❌ No BLAST file uploaded");

    const text = fs.readFileSync(req.file.path, "utf8");

    let output = [];
    let query = "", hit = "", identity = "", length = "", evalue = "";

    text.split("\n").forEach(line => {

        if (line.startsWith("Query=")) {
            query = line.replace("Query=", "").trim();
        }

        if (line.startsWith(">")) {
            hit = line.replace(">", "").trim();
        }

        if (line.includes("Identities =")) {
            const match = line.match(/(\d+)\/(\d+)/);
            if (match) {
                identity = ((match[1] / match[2]) * 100).toFixed(2);
                length = match[2];
            }
        }

        if (line.includes("Expect")) {
            const e = line.split("=")[1]?.trim();

            output.push(`
Query: ${query}
Hit: ${hit}
Identity: ${identity}%
Length: ${length}
E-value: ${e}
------------------------
`);
        }
    });

    res.send(output.join("\n"));
});

/* =========================================================
   🧬 UNIPROT (STABLE + CLEAN JSON)
========================================================= */
app.post("/uniprot", async (req, res) => {

    const id = req.body.id;
    if (!id) return res.json({ error: "No ID provided" });

    try {
        const fetch = (await import("node-fetch")).default;

        const url = `https://rest.uniprot.org/uniprotkb/${id}.json`;
        const r = await fetch(url);

        if (!r.ok) return res.json({ error: "Protein not found" });

        const data = await r.json();

        res.json({
            protein: data?.proteinDescription?.recommendedName?.fullName?.value || "N/A",
            organism: data?.organism?.scientificName || "N/A",
            gene: data?.genes?.[0]?.geneName?.value || "N/A",
            length: data?.sequence?.length || 0,
            functionText: data?.comments?.find(c => c.commentType === "FUNCTION")
                ?.texts?.[0]?.value || "No function available"
        });

    } catch (err) {
        res.json({ error: "UniProt API failed" });
    }
});

/* =========================================================
   🚀 SERVER START
========================================================= */
app.listen(3000, () => {
    console.log("🚀 Running at http://localhost:3000");
});