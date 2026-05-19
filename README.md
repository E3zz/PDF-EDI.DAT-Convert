# EOB → EDI 835 Converter

> **100% local · Zero API · Fully offline · HIPAA-friendly**

A client-side web tool that converts **PDF remittance advice** (EOB / EOP / ERA) documents into **ANSI X12 835** EDI files — entirely in the browser with no server, no API keys, and no data upload.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **Local OCR** | PDF.js extracts text directly from PDFs — no cloud OCR service needed |
| **Rule-Based Parser** | Regex engine detects payer info, provider NPI, claims, CPT codes, and dollar amounts |
| **EDI 835 Builder** | Generates compliant ANSI X12 835 output with ISA/GS/ST envelopes |
| **Confidence Scoring** | Rates extraction quality (0–99%) based on detected healthcare keywords |
| **Multi-Claim Support** | Automatically detects and processes multiple patient claims per PDF |
| **Drag & Drop** | Upload PDFs via drag-and-drop or file picker |
| **Override Fields** | Manually override Payer ID, NPI, and check date before generation |
| **Multiple Formats** | Export as `.dat`, `.edi`, `.txt`, or `.835` |
| **Works Offline** | After initial page load, works with no internet connection |

---

## 🏗️ Architecture

```
PDF Upload → PDF.js OCR → Text Extraction → EOB Parser → Field Mapping → EDI 835 Builder → Download
```

The entire pipeline runs **client-side in the browser**:

1. **PDF.js** reads the PDF binary and extracts text content with positional layout
2. **EOB Parser** uses regex patterns to identify check info, payer/provider details, and claim line items
3. **EDI 835 Builder** maps parsed data into ANSI X12 835 segments (ISA, GS, ST, BPR, TRN, CLP, SVC, etc.)
4. **Blob download** generates the output file for the user

No data ever leaves the browser — **your PDFs stay on your machine**.

---

## 🚀 Quick Start

### Option 1 — Open directly
Just open `index.html` in any modern browser. That's it.

### Option 2 — Local server (optional)
```bash
# Python
python3 -m http.server 8000

# Node.js
npx serve .
```
Then visit `http://localhost:8000`.

---

## 📁 Project Structure

```
PDF-EDI-Converter/
├── index.html       # Main UI — upload zone, pipeline, options, preview
├── converter.js     # Core logic — OCR, parser, EDI 835 builder, download
├── styles.css       # Dark glassmorphic UI with custom design tokens
└── README.md        # This file
```

### File Breakdown

| File | Purpose |
|------|---------|
| `index.html` | Single-page UI with drag-and-drop upload, visual pipeline, output options, EDI preview, and download button |
| `converter.js` | PDF.js OCR extraction, confidence scoring, regex-based EOB parser, ANSI X12 835 segment builder, download handler |
| `styles.css` | Dark theme design system using CSS custom properties — Syne + DM Mono + DM Sans typography, gradient accents, glassmorphic cards |

---

## 🔧 Usage

1. **Upload** a remittance advice PDF (EOB, EOP, ERA, or similar)
2. The OCR engine extracts text and displays a **confidence score**
3. Detected claims are shown in a summary grid
4. *(Optional)* Override Payer ID, NPI, or check date
5. Click **Generate EDI 835**
6. Review the output in the preview pane
7. **Download** the `.dat` / `.edi` / `.txt` / `.835` file

---

## 📋 Supported EDI Segments

The generated 835 output includes:

| Segment | Purpose |
|---------|---------|
| `ISA` / `IEA` | Interchange envelope |
| `GS` / `GE` | Functional group envelope |
| `ST` / `SE` | Transaction set envelope |
| `BPR` | Financial information (check amount, method) |
| `TRN` | Reassociation trace number |
| `DTM` | Date/time reference |
| `N1` / `N3` / `N4` | Payer and provider name/address |
| `LX` | Transaction set line number |
| `CLP` | Claim payment information |
| `NM1` | Patient name |
| `DMG` | Patient demographics (DOB) |
| `SVC` | Service line (CPT code, billed/paid amounts) |
| `CAS` | Claim adjustment (discount, CO-45) |
| `AMT` | Monetary amount |
| `PLB` | Provider-level balance |

---

## 🔒 Privacy & Compliance

- **Zero data upload** — all processing happens in the browser
- **No API keys** — no OpenAI, no cloud OCR, no external calls
- **No server** — pure static HTML/JS/CSS, no backend
- **HIPAA-friendly** — PHI never leaves the user's device
- **Works offline** — after initial CDN load of PDF.js

---

## 🛠️ Tech Stack

- **[PDF.js](https://mozilla.github.io/pdf.js/)** v3.11.174 — Mozilla's PDF rendering library for text extraction
- **Vanilla JavaScript** — no frameworks, no build step
- **CSS Custom Properties** — dark theme design system with glassmorphic styling
- **Google Fonts** — Syne (display), DM Mono (code), DM Sans (body)

---

## ⚠️ Limitations

- Scanned image-only PDFs (no embedded text layer) will not be processed — PDF.js extracts text, it does not perform true image OCR
- Parser relies on regex patterns tuned for common US healthcare payer formats — unusual layouts may require pattern adjustments
- Generated EDI output should be validated against your clearinghouse or practice management system before production use

---

## 📄 License

MIT — free for personal and commercial use.

---

<p align="center">
  <em>Built for healthcare billing teams who need fast, private, offline EDI conversion.</em>
</p>
