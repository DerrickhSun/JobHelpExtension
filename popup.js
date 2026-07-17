// popup.js
const browser = globalThis.browser ?? globalThis.chrome;

const fillFormBtn = document.getElementById("fill-form-btn");
const saveFieldsBtn = document.getElementById("save-fields-btn");
const statusEl = document.getElementById("status");

// Fields can live inside an embedded ATS iframe (Jobvite/iCIMS-style forms
// commonly are), not just the top-level page. content.js runs in every
// matching frame (all_frames in manifest.json), but tabs.sendMessage without
// a target only ever reaches the top frame — so we enumerate every frame on
// the tab and message each one individually, skipping any that don't have a
// content script (non-matching URL, not yet loaded, etc).
async function sendToAllFrames(message) {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab) return [{ error: "No active tab." }];

    let frames;
    try {
        frames = await browser.webNavigation.getAllFrames({ tabId: tab.id });
    } catch (err) {
        frames = null;
    }
    if (!frames || !frames.length) frames = [{ frameId: 0 }];

    const results = [];
    for (const frame of frames) {
        try {
            const res = await browser.tabs.sendMessage(tab.id, message, { frameId: frame.frameId });
            if (res) results.push(res);
        } catch (err) {
            // No content script in this frame — skip it.
        }
    }
    return results;
}

// Sums `sumKeys` across every frame's successful response. If every frame
// errored (or none responded), surfaces the first error instead of a
// fabricated all-zero result.
function aggregateResults(results, sumKeys) {
    const oks = results.filter((r) => r && !r.error);
    if (!oks.length) {
        const firstError = results.find((r) => r && r.error);
        return { error: (firstError && firstError.error) || "Couldn't reach this page (try reloading it first)." };
    }
    const out = {};
    for (const key of sumKeys) {
        out[key] = oks.reduce((sum, r) => sum + (r[key] || 0), 0);
    }
    return out;
}

fillFormBtn.addEventListener("click", async () => {
    fillFormBtn.disabled = true;
    statusEl.textContent = "Scanning page…";

    try {
        const res = aggregateResults(await sendToAllFrames({ type: "FILL_FORM" }), ["filled", "total", "flagged"]);

        if (res.error) {
            statusEl.textContent = "Failed: " + res.error;
            return;
        }

        if (!res.total) {
            statusEl.textContent = "No fillable fields found on this page.";
            return;
        }

        let summary = "Filled " + res.filled + " of " + res.total +
            " field" + (res.total === 1 ? "" : "s") + ".";
        if (res.flagged) {
            summary += "\n" + res.flagged + " flagged for manual review.";
        }
        statusEl.textContent = summary;
    } finally {
        fillFormBtn.disabled = false;
    }
});

saveFieldsBtn.addEventListener("click", async () => {
    saveFieldsBtn.disabled = true;
    statusEl.textContent = "Scanning page…";

    try {
        const res = aggregateResults(await sendToAllFrames({ type: "SAVE_FIELDS" }), ["saved"]);

        if (res.error) {
            statusEl.textContent = "Failed: " + res.error;
            return;
        }

        statusEl.textContent = res.saved
            ? "Saved " + res.saved + " field" + (res.saved === 1 ? "" : "s") + "."
            : "No fields found on this page.";
    } finally {
        saveFieldsBtn.disabled = false;
    }
});
