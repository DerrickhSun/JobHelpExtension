// content.js
// Uses the shared taskbar coordination module (taskbar-shared.js), which is
// loaded before this file and shares the same isolated-world scope. That module
// owns the host element and all page-shifting; we only manage our own "slot".

// MUST be unique per extension so our slot doesn't collide with the other one.
const EXT_KEY = "jobhelp";

// Slots are ordered left-to-right by ascending `order`. Our buttons should
// appear SECOND, so this must be greater than the other extension's order.
const TASKBAR_ORDER = 20;

// Triggers a file download from the page context via a temporary <a download>.
// This works in both Chrome and Firefox, unlike downloads.download with a
// data:/blob: URL (Firefox rejects those outright).
function saveTextFile(text, filename) {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function isLinkedInPage() {
    return location.hostname === "www.linkedin.com" || location.hostname === "linkedin.com";
}

// Mirrors job_searcher.parse_current_job_from_detail_pane: job id from URL or
// the active list row when LinkedIn does not update the address bar.
function getLinkedInJobId() {
    const url = location.href;
    let match = url.match(/currentJobId=(\d+)/i);
    if (match) return match[1];
    match = url.match(/\/jobs\/view\/(\d+)/i);
    if (match) return match[1];

    const activeRow = document.querySelector(
        "li.scaffold-layout__list-item--active[data-occludable-job-id]," +
        "li.jobs-search-results__list-item--active[data-occludable-job-id]," +
        'li[aria-current="true"][data-occludable-job-id]'
    );
    return activeRow?.getAttribute("data-occludable-job-id") || null;
}

function getLinkedInCompanyMarker() {
    return document.querySelector('[aria-label^="Company,"], [aria-label*="Company,"]');
}

function isLinkedInJobDisplayed() {
    if (getLinkedInJobId()) return true;
    if (getLinkedInCompanyMarker()) return true;
    return false;
}

function textFromFirstMatch(root, selectors) {
    for (const selector of selectors) {
        const el = root.querySelector(selector);
        const text = el?.textContent?.trim();
        if (text) return text;
    }
    return "";
}

function looksLikeJobMetadata(text) {
    return /applicants|Promoted|Company review|hours ago|days ago|weeks ago|months ago|·/.test(text);
}

// LinkedIn's newer UI uses obfuscated classes; stable hooks are aria-label and
// data-display-contents. Title sits in the first simple <p> block after company.
function getLinkedInJobTitleFromModernUI() {
    const blocks = [...document.querySelectorAll('[data-display-contents="true"]')];
    const companyIdx = blocks.findIndex((b) => b.querySelector('[aria-label*="Company,"]'));
    if (companyIdx < 0) return null;

    for (let i = companyIdx + 1; i < blocks.length; i++) {
        const p = blocks[i].querySelector(":scope > p");
        if (!p || p.querySelector('a[href*="/company/"]')) continue;

        const text = p.textContent.trim();
        if (!text || looksLikeJobMetadata(text) || text.length > 200) continue;
        return text;
    }

    return null;
}

// Selectors aligned with job_searcher.py (SEL + parse_current_job_from_detail_pane).
function getLinkedInJobTitle() {
    if (!isLinkedInJobDisplayed()) return null;

    const modernTitle = getLinkedInJobTitleFromModernUI();
    if (modernTitle) return modernTitle;

    const detailTitle = textFromFirstMatch(document, [
        ".jobs-unified-top-card__job-title",
        ".jobs-details-top-card__title-text",
        "h1.jobs-unified-top-card__job-title",
        "div[class*='jobs-details-top-card'] h1",
        "h1[class*='job-title']",
    ]);
    if (detailTitle) return detailTitle;

    const activeRow = document.querySelector(
        "li.scaffold-layout__list-item--active," +
        "li.jobs-search-results__list-item--active," +
        'li[aria-current="true"]'
    );
    if (activeRow) {
        const rowTitle = textFromFirstMatch(activeRow, [
            '[class*="job-card-job-posting-card-wrapper__title"]',
            "strong",
        ]);
        if (rowTitle) return rowTitle;

        const link = activeRow.querySelector('a[href*="/jobs/view/"], a[href*="currentJobId"]');
        const ariaLabel = link?.getAttribute("aria-label")?.trim();
        if (ariaLabel) return ariaLabel;
    }

    const h1 = document.querySelector("h1")?.textContent?.trim();
    if (h1) return h1;

    return null;
}

function getSavePayload() {
    if (!isLinkedInPage()) {
        return { text: "Hello world", filename: "hello.txt" };
    }

    const jobName = getLinkedInJobTitle();
    if (jobName) {
        const safeName = jobName.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim() || "job";
        return { text: jobName, filename: safeName + ".txt" };
    }

    return { text: "generic linkedin", filename: "generic-linkedin.txt" };
}

// Populates our slot with this extension's buttons. Called by the shared module
// with our slot element (which lives inside the shared taskbar's shadow DOM).
function buildButtons(slot) {
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.textContent = isLinkedInPage() ? "Save job" : 'Save "Hello world"';
    saveBtn.addEventListener("click", () => {
        const { text, filename } = getSavePayload();
        saveTextFile(text, filename);
    });
    slot.appendChild(saveBtn);
}

const browser = globalThis.browser ?? globalThis.chrome;

// Persist our own active flag so the taskbar survives navigation/reload. This
// is per-extension storage; the other sharing extension persists its slot
// independently and the shared module re-merges them (in `order`) on each page.
const ACTIVE_KEY = "taskbarActive";

function showTaskbar() {
  registerTaskbar(EXT_KEY, buildButtons, TASKBAR_ORDER);
}

function hideTaskbar() {
  unregisterTaskbar(EXT_KEY);
}

browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'TOGGLE_TASKBAR') {
    const registered = isTaskbarRegistered(EXT_KEY);
    if (registered) {
      hideTaskbar();
    } else {
      showTaskbar();
    }
    browser.storage.local.set({ [ACTIVE_KEY]: !registered });
    sendResponse({ visible: !registered });
  }
  return true; // keep channel open for async sendResponse
});

// On every page load, restore our slot if it was active when we last toggled.
browser.storage.local.get(ACTIVE_KEY).then((stored) => {
  if (stored[ACTIVE_KEY]) showTaskbar();
});
