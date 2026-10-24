# PDFMinter scan exports (input for Part 3.11)

Part 3.11 stays blocked until a scan file is here (DEC-010). Never put cookies, passwords or HAR
files in this folder; the snippet below keeps the session inside your browser.

1. Sign in to https://pdfminter.com in your own browser.
2. Open DevTools (F12) → Console, paste this, press Enter:

```js
(async () => {
  const seeds = ['budgeting', 'meal prep', 'keto diet', 'toddler sleep', 'pc troubleshooting'];
  const out = {};
  for (const q of seeds) {
    try { out[q] = await PDFM.api('trends?q=' + encodeURIComponent(q) + '&geo=US'); }
    catch (e) { out[q] = { error: String((e && e.message) || e) }; break; }
    await new Promise(r => setTimeout(r, 4000));
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
  a.download = 'pdfminter-scans-2026-10-24.json';
  a.click();
})();
```

3. Move the downloaded `pdfminter-scans-<date>.json` into this folder. If the hourly search limit
   stops it early, run it again later for the missing seeds; the file shows which ones errored.

The CSV export from each scan's page is fine too, but it lacks the per-source counts, topic trend
series and `insight` text that the JSON has.
