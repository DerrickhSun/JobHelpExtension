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

function getLinkedInJobUrl() {
    const jobId = getLinkedInJobId();
    if (jobId) {
        return "https://www.linkedin.com/jobs/view/" + jobId + "/";
    }

    const viewLink = document.querySelector(
        'a[href*="/jobs/view/"], a[href*="currentJobId"]'
    );
    const href = viewLink?.href || "";
    if (href) {
        const fromView = href.match(/\/jobs\/view\/(\d+)/i);
        if (fromView) {
            return "https://www.linkedin.com/jobs/view/" + fromView[1] + "/";
        }
        const fromQuery = href.match(/currentJobId=(\d+)/i);
        if (fromQuery) {
            return "https://www.linkedin.com/jobs/view/" + fromQuery[1] + "/";
        }
    }

    return "";
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

function getLinkedInCompanyFromModernUI() {
    const marker = getLinkedInCompanyMarker();
    if (!marker) return null;

    const label = marker.getAttribute("aria-label")?.trim() || "";
    const fromLabel = label.match(/^Company,\s*(.+)$/i);
    if (fromLabel) return fromLabel[1].trim();

    const link = marker.closest('[data-display-contents="true"]')
        ?.querySelector('a[href*="/company/"]');
    return link?.textContent?.trim() || null;
}

// Selectors aligned with job_searcher.py (SEL + parse_current_job_from_detail_pane).
function getLinkedInJobCompany() {
    if (!isLinkedInJobDisplayed()) return null;

    const modernCompany = getLinkedInCompanyFromModernUI();
    if (modernCompany) return modernCompany;

    const detailCompany = textFromFirstMatch(document, [
        ".job-details-jobs-unified-top-card__company-name a",
        ".jobs-unified-top-card__company-name a",
        ".jobs-unified-top-card__company-name",
        "a[class*='company-name']",
    ]);
    if (detailCompany) return detailCompany;

    const activeRow = document.querySelector(
        "li.scaffold-layout__list-item--active," +
        "li.jobs-search-results__list-item--active," +
        'li[aria-current="true"]'
    );
    if (activeRow) {
        const rowCompany = textFromFirstMatch(activeRow, [
            '[class*="job-card-job-posting-card-wrapper__company-name"]',
            '[class*="job-card-job-posting-card-wrapper__primary-description"]',
            ".artdeco-entity-lockup__subtitle span[dir='ltr']",
            ".artdeco-entity-lockup__subtitle span",
        ]);
        if (rowCompany) return rowCompany;
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

function getJobForSave() {
    if (!isLinkedInPage()) return null;

    const title = getLinkedInJobTitle();
    if (!title) return null;

    return {
        title,
        company: getLinkedInJobCompany() || "",
        url: getLinkedInJobUrl(),
    };
}

function formatSavedJobLabel(job) {
    const title = job.title || "";
    const company = job.company || "";
    if (company) return company + ", " + title;
    return title;
}

function formatSavedJobDownloadLine(job) {
    const company = job.company || "";
    const title = job.title || "";
    const url = job.url || "";
    return company + ", " + title + ", " + url;
}

function savedJobKey(job) {
    return (job.company || "") + "\0" + (job.title || "");
}

const browser = globalThis.browser ?? globalThis.chrome;

const SAVED_JOBS_KEY = "savedJobs";
const SAVED_MENU_HOVER_CLOSE_MS = 350;
const SAVED_MENU_VIEWPORT_MARGIN = 8;
const SAVE_BUTTON_REFRESH_MS = 1000;
let savedMenuCloseHandler = null;
let savedMenuHoverCloseTimer = null;
let saveButtonRefreshTimer = null;

function updateSaveButtonState(saveBtn) {
    const job = getJobForSave();
    if (job) {
        saveBtn.disabled = false;
        saveBtn.textContent = "Save job";
    } else {
        saveBtn.disabled = true;
        saveBtn.textContent = "No job found";
    }
}

function stopSaveButtonRefresh() {
    if (saveButtonRefreshTimer) {
        clearInterval(saveButtonRefreshTimer);
        saveButtonRefreshTimer = null;
    }
}

function startSaveButtonRefresh(saveBtn) {
    stopSaveButtonRefresh();
    updateSaveButtonState(saveBtn);
    saveButtonRefreshTimer = setInterval(() => updateSaveButtonState(saveBtn), SAVE_BUTTON_REFRESH_MS);
}

function isInsideSavedMenu(target, menuRoot) {
    if (!target) return false;
    return target === menuRoot || menuRoot.contains(target);
}

async function getSavedJobs() {
    const stored = await browser.storage.local.get(SAVED_JOBS_KEY);
    return stored[SAVED_JOBS_KEY] || [];
}

async function addSavedJob(job) {
    const savedJobs = await getSavedJobs();
    const entry = {
        title: job.title,
        company: job.company || "",
        url: job.url || "",
        savedAt: Date.now(),
    };
    const key = savedJobKey(entry);
    const withoutDup = savedJobs.filter((saved) => savedJobKey(saved) !== key);
    withoutDup.unshift(entry);
    await browser.storage.local.set({ [SAVED_JOBS_KEY]: withoutDup });
}

async function removeSavedJob(job) {
    const savedJobs = await getSavedJobs();
    const key = savedJobKey(job);
    const filtered = savedJobs.filter((saved) => savedJobKey(saved) !== key);
    await browser.storage.local.set({ [SAVED_JOBS_KEY]: filtered });
}

async function downloadAllSavedJobs() {
    const jobs = await getSavedJobs();
    const text = jobs.map((job) => formatSavedJobDownloadLine(job)).join("\n");
    saveTextFile(text, "saved_jobs.txt");
}

function injectSlotStyles(slot) {
    if (slot.querySelector("style[data-jobhelp]")) return;

    const style = document.createElement("style");
    style.setAttribute("data-jobhelp", "");
    style.textContent =
        ".jobhelp-saved-wrap{position:relative;display:inline-flex;}" +
        ".jobhelp-saved-menu{position:fixed;min-width:220px;max-width:320px;max-height:240px;" +
        "overflow:auto;margin:0;padding:4px 0;list-style:none;background:#fff;border:1px solid #ccc;" +
        "border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.15);z-index:2147483647;font-size:13px;}" +
        ".jobhelp-saved-menu::before{content:'';position:absolute;left:0;right:0;top:-12px;height:12px;}" +
        ".jobhelp-saved-item{display:flex;align-items:center;gap:8px;padding:6px 8px 6px 12px;color:#111;}" +
        ".jobhelp-saved-item-title{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;" +
        "white-space:nowrap;}" +
        ".jobhelp-saved-remove{flex:0 0 auto;border:none;background:transparent;cursor:pointer;" +
        "color:#666;font-size:16px;line-height:1;padding:2px 6px;border-radius:4px;}" +
        ".jobhelp-saved-remove:hover{color:#b00020;background:#fde8e8;}" +
        ".jobhelp-saved-menu li.jobhelp-saved-empty{padding:8px 12px;color:#666;font-style:italic;}" +
        "button:disabled{opacity:0.55;cursor:not-allowed;}";
    slot.prepend(style);
}

function renderSavedJobsMenu(menu, jobs, menuRoot) {
    menu.replaceChildren();
    if (!jobs.length) {
        const empty = document.createElement("li");
        empty.className = "jobhelp-saved-empty";
        empty.textContent = "No saved jobs yet";
        menu.appendChild(empty);
        return;
    }

    for (const job of jobs) {
        const item = document.createElement("li");
        item.className = "jobhelp-saved-item";

        const label = formatSavedJobLabel(job);

        const title = document.createElement("span");
        title.className = "jobhelp-saved-item-title";
        title.textContent = label;
        title.title = label;

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "jobhelp-saved-remove";
        removeBtn.setAttribute("aria-label", "Remove " + label);
        removeBtn.textContent = "×";
        removeBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            removeSavedJob(job).then(() => {
                getSavedJobs().then((updated) => {
                    renderSavedJobsMenu(menu, updated, menuRoot);
                    if (!menu.hidden && menuRoot) {
                        positionSavedJobsMenu(menuRoot, menu);
                    }
                });
            });
        });

        item.appendChild(title);
        item.appendChild(removeBtn);
        menu.appendChild(item);
    }
}

function clearSavedMenuHoverCloseTimer() {
    if (savedMenuHoverCloseTimer) {
        clearTimeout(savedMenuHoverCloseTimer);
        savedMenuHoverCloseTimer = null;
    }
}

function scheduleSavedMenuHoverClose(menuRoot) {
    clearSavedMenuHoverCloseTimer();
    savedMenuHoverCloseTimer = setTimeout(() => {
        savedMenuHoverCloseTimer = null;
        closeSavedJobsMenu(menuRoot);
    }, SAVED_MENU_HOVER_CLOSE_MS);
}

function resetSavedJobsMenuPosition(menu) {
    menu.style.left = "";
    menu.style.top = "";
    menu.style.visibility = "";
}

function positionSavedJobsMenu(menuRoot, menu) {
    const listBtn = menuRoot.querySelector("button");
    if (!listBtn) return;

    menu.hidden = false;
    menu.style.visibility = "hidden";

    const btnRect = listBtn.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const margin = SAVED_MENU_VIEWPORT_MARGIN;

    let left = btnRect.left;
    let top = btnRect.bottom;

    if (left + menuRect.width > window.innerWidth - margin) {
        left = Math.max(margin, window.innerWidth - menuRect.width - margin);
    }
    if (left < margin) {
        left = margin;
    }

    if (top + menuRect.height > window.innerHeight - margin) {
        top = Math.max(margin, btnRect.top - menuRect.height);
    }

    menu.style.left = left + "px";
    menu.style.top = top + "px";
    menu.style.visibility = "";
}

function closeSavedJobsMenu(menuRoot) {
    const menu = menuRoot.querySelector(".jobhelp-saved-menu");
    clearSavedMenuHoverCloseTimer();

    if (menu) {
        menu.hidden = true;
        resetSavedJobsMenuPosition(menu);
    }

    if (savedMenuCloseHandler) {
        document.removeEventListener("mousedown", savedMenuCloseHandler, true);
        savedMenuCloseHandler = null;
    }
}

function openSavedJobsMenu(menuRoot) {
    const menu = menuRoot.querySelector(".jobhelp-saved-menu");
    if (!menu) return;

    clearSavedMenuHoverCloseTimer();

    getSavedJobs().then((jobs) => {
        renderSavedJobsMenu(menu, jobs, menuRoot);
        positionSavedJobsMenu(menuRoot, menu);

        if (savedMenuCloseHandler) {
            document.removeEventListener("mousedown", savedMenuCloseHandler, true);
        }

        savedMenuCloseHandler = (event) => {
            const path = event.composedPath();
            if (path.includes(menuRoot)) return;
            closeSavedJobsMenu(menuRoot);
        };
        document.addEventListener("mousedown", savedMenuCloseHandler, true);
    });
}

// Populates our slot with this extension's buttons. Called by the shared module
// with our slot element (which lives inside the shared taskbar's shadow DOM).
function buildButtons(slot) {
    injectSlotStyles(slot);
    closeSavedJobsMenu(slot);
    stopSaveButtonRefresh();

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.addEventListener("click", () => {
        const job = getJobForSave();
        if (job) addSavedJob(job);
    });
    startSaveButtonRefresh(saveBtn);

    const downloadBtn = document.createElement("button");
    downloadBtn.type = "button";
    downloadBtn.textContent = "Download jobs";
    downloadBtn.addEventListener("click", () => {
        downloadAllSavedJobs();
    });

    const menuWrap = document.createElement("div");
    menuWrap.className = "jobhelp-saved-wrap";

    const listBtn = document.createElement("button");
    listBtn.type = "button";
    listBtn.textContent = "Saved jobs";
    listBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        const menu = menuWrap.querySelector(".jobhelp-saved-menu");
        if (menu && !menu.hidden) {
            closeSavedJobsMenu(menuWrap);
        } else {
            openSavedJobsMenu(menuWrap);
        }
    });

    const menu = document.createElement("ul");
    menu.className = "jobhelp-saved-menu";
    menu.hidden = true;

    const cancelHoverClose = () => clearSavedMenuHoverCloseTimer();

    menuWrap.addEventListener("mouseenter", cancelHoverClose);
    menu.addEventListener("mouseenter", cancelHoverClose);

    menuWrap.addEventListener("mouseleave", (event) => {
        if (!isInsideSavedMenu(event.relatedTarget, menuWrap) &&
            !isInsideSavedMenu(event.relatedTarget, menu)) {
            scheduleSavedMenuHoverClose(menuWrap);
        }
    });
    menu.addEventListener("mouseleave", (event) => {
        if (!isInsideSavedMenu(event.relatedTarget, menuWrap) &&
            !isInsideSavedMenu(event.relatedTarget, menu)) {
            scheduleSavedMenuHoverClose(menuWrap);
        }
    });

    menuWrap.appendChild(listBtn);
    menuWrap.appendChild(menu);
    slot.appendChild(saveBtn);
    slot.appendChild(downloadBtn);
    slot.appendChild(menuWrap);
}

// Persist our own active flag so the taskbar survives navigation/reload. This
// is per-extension storage; the other sharing extension persists its slot
// independently and the shared module re-merges them (in `order`) on each page.
const ACTIVE_KEY = "taskbarActive";

function showTaskbar() {
  registerTaskbar(EXT_KEY, buildButtons, TASKBAR_ORDER);
}

function hideTaskbar() {
  stopSaveButtonRefresh();
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
