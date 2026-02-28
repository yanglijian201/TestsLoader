# CCDE Quiz Web App (React)

This repo now includes a React web version of the quiz app from `quiz_practice.py`.

## What it supports

- Parse questions from a `.docx` bank in browser
- Random mode and sequential mode
- Configurable question count (50 / 100 / all)
- Option shuffling per question
- Single-choice and multiple-choice validation
- Embedded image display from the DOCX
- Wrong-answer notebook (saved in browser `localStorage`)
- Font size controls (saved in browser `localStorage`)
- Responsive UI for iPhone and Mac browsers

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start dev server:

```bash
npm run dev
```

3. Open the URL shown by Vite (usually `http://localhost:5173`).
4. Upload your `.docx` question bank and start practicing.

Route-based auto load:

- Visit `/` to open the upload page (no automatic DOCX load).
- Visit `/<name>` to auto-load `/<name>.docx` (for example, `/default` loads `/default.docx`).

## Build for production

```bash
npm run build
npm run preview
```
