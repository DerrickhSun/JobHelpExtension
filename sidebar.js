// sidebar.js
// Runs as a Firefox sidebar_action page: a normal extension page with no
// direct access to any tab's DOM. Live LinkedIn page state (current job,
// open Easy Apply form) is fetched from the active tab's content script via
// messaging; saved jobs/questions are read and written directly through
// shared/storage.js (loaded before this file — same browser.storage.local
// access as any other extension context).

const jobStatusEl = document.getElementById("job-status");
const saveJobBtn = document.getElementById("save-job-btn");
const saveQuestionsBtn = document.getElementById("save-questions-btn");
const downloadBtn = document.getElementById("download-btn");

const savedJobsHeading = document.getElementById("saved-jobs-heading");
const savedJobsList = document.getElementById("saved-jobs-list");
const clearJobsBtn = document.getElementById("clear-jobs-btn");

const savedQuestionsHeading = document.getElementById("saved-questions-heading");
const savedQuestionsList = document.getElementById("saved-questions-list");
const clearQuestionsBtn = document.getElementById("clear-questions-btn");

// Easy Apply forms open/close via in-page JS with no tab navigation, so tab
// events alone won't tell us the Save Questions button should toggle — poll
// lightly while the sidebar is visible (same cadence the old toolbar used).
const STATE_POLL_MS = 1000;
let statePollTimer = null;

async function getActiveTab() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return tab || null;
}

async function messageActiveTab(message) {
    const tab = await getActiveTab();
    if (!tab) return null;
    try {
        return await browser.tabs.sendMessage(tab.id, message);
    } catch (err) {
        return null; // no content script on this tab (non-matching page, etc.)
    }
}

async function refreshCurrentPageState() {
    const job = await messageActiveTab({ type: "GET_CURRENT_JOB" });
    saveJobBtn.disabled = !job;
    jobStatusEl.textContent = job
        ? (job.company ? job.company + " — " : "") + (job.title || "Untitled job")
        : "Not viewing a LinkedIn job page";

    const scan = await messageActiveTab({ type: "SCAN_APPLICATION_QUESTIONS" });
    saveQuestionsBtn.disabled = !scan;
}

function startStatePolling() {
    stopStatePolling();
    refreshCurrentPageState();
    statePollTimer = setInterval(refreshCurrentPageState, STATE_POLL_MS);
}

function stopStatePolling() {
    if (statePollTimer) {
        clearInterval(statePollTimer);
        statePollTimer = null;
    }
}

browser.tabs.onActivated.addListener(refreshCurrentPageState);
browser.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    if (changeInfo.status === "complete" || changeInfo.url) refreshCurrentPageState();
});

document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopStatePolling();
    else startStatePolling();
});

function formatSavedJobRowLabel(job) {
    const parts = [];
    if (job.company) parts.push(job.company);
    if (job.title) parts.push(job.title);
    return parts.length ? parts.join(", ") : "Untitled job";
}

function renderSavedJobsList(jobs) {
    savedJobsHeading.textContent = formatSavedJobsCountLabel(jobs.length);
    clearJobsBtn.hidden = !jobs.length;
    savedJobsList.replaceChildren();

    for (const job of jobs) {
        const li = document.createElement("li");

        const label = document.createElement("span");
        label.className = "row-label";
        const labelText = formatSavedJobRowLabel(job);
        if (job.url) {
            const link = document.createElement("a");
            link.href = job.url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = labelText;
            label.appendChild(link);
        } else {
            label.textContent = labelText;
        }

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "row-remove";
        removeBtn.textContent = "Remove";
        removeBtn.addEventListener("click", () => removeSavedJob(job));

        li.appendChild(label);
        li.appendChild(removeBtn);
        savedJobsList.appendChild(li);
    }
}

function renderSavedQuestionsList(questions) {
    savedQuestionsHeading.textContent = formatSavedQuestionsCountLabel(questions.length);
    clearQuestionsBtn.hidden = !questions.length;
    savedQuestionsList.replaceChildren();

    for (const entry of questions) {
        const li = document.createElement("li");

        const label = document.createElement("span");
        label.className = "row-label";
        const header = [entry.company, entry.title].filter(Boolean).join(", ") || "Application";
        label.textContent = header + " — " + (entry.question || "");
        label.title = "Q: " + (entry.question || "") + "\nA: " + (entry.answer || "");

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "row-remove";
        removeBtn.textContent = "Remove";
        removeBtn.addEventListener("click", () => removeSavedApplicationQuestion(entry));

        li.appendChild(label);
        li.appendChild(removeBtn);
        savedQuestionsList.appendChild(li);
    }
}

async function refreshSavedJobsList() {
    renderSavedJobsList(await getSavedJobs());
}

async function refreshSavedQuestionsList() {
    renderSavedQuestionsList(await getSavedApplicationQuestions());
}

browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (SAVED_JOBS_KEY in changes) refreshSavedJobsList();
    if (SAVED_APPLICATION_QUESTIONS_KEY in changes) refreshSavedQuestionsList();
});

saveJobBtn.addEventListener("click", async () => {
    const job = await messageActiveTab({ type: "GET_CURRENT_JOB" });
    if (!job) return;
    await addSavedJob(job);
});

saveQuestionsBtn.addEventListener("click", async () => {
    const scan = await messageActiveTab({ type: "SCAN_APPLICATION_QUESTIONS" });
    if (!scan || !scan.pairs.length) return;
    await addSavedApplicationQuestions(scan.pairs, scan.job);
});

downloadBtn.addEventListener("click", () => {
    downloadAllSavedJobs();
});

clearJobsBtn.addEventListener("click", async () => {
    const jobs = await getSavedJobs();
    if (!jobs.length) return;
    const confirmed = window.confirm(
        "Clear all " + jobs.length + " saved job" + (jobs.length === 1 ? "" : "s") + "?"
    );
    if (!confirmed) return;
    await clearSavedJobs();
});

clearQuestionsBtn.addEventListener("click", async () => {
    const questions = await getSavedApplicationQuestions();
    if (!questions.length) return;
    const confirmed = window.confirm(
        "Clear all " + questions.length + " saved application question" +
        (questions.length === 1 ? "" : "s") + "?"
    );
    if (!confirmed) return;
    await clearSavedApplicationQuestions();
});

startStatePolling();
refreshSavedJobsList();
refreshSavedQuestionsList();
