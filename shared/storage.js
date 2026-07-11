// shared/storage.js
// Storage + formatting logic for saved jobs and saved application questions.
// Loaded both as a content script (before content.js, which still owns the
// in-page taskbar UI) and as a plain <script> in sidebar.html — kept free of
// any DOM dependency so it works unmodified in either context.

const browser = globalThis.browser ?? globalThis.chrome;

const SAVED_JOBS_KEY = "savedJobs";
const SAVED_APPLICATION_QUESTIONS_KEY = "savedApplicationQuestions";

// Uses the downloads API; prior extension exports are removed before each save.
function saveTextFile(text, filename) {
    return browser.runtime.sendMessage({
        type: "DOWNLOAD_TEXT_FILE",
        text,
        filename,
    });
}

function savedJobKey(job) {
    return (job.company || "") + "\0" + (job.title || "");
}

function formatSavedJobDate(job) {
    const ts = job.savedAt;
    if (!ts) return "";

    const d = new Date(ts);
    if (isNaN(d.getTime())) return "";

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
}

function formatSavedJobDownloadLine(job) {
    const company = job.company || "";
    const date = formatSavedJobDate(job);
    const title = job.title || "";
    const url = job.url || "";
    return company + ", " + date + ", " + title + ", " + url;
}

function formatSavedJobsCountLabel(count) {
    if (!count) return "No jobs saved";
    if (count === 1) return "1 job saved";
    return count + " jobs saved";
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

async function clearSavedJobs() {
    await browser.storage.local.set({ [SAVED_JOBS_KEY]: [] });
}

function applicationQuestionKey(entry) {
    return (
        (entry.company || "") + "\0" +
        (entry.title || "") + "\0" +
        (entry.question || "")
    );
}

async function getSavedApplicationQuestions() {
    const stored = await browser.storage.local.get(SAVED_APPLICATION_QUESTIONS_KEY);
    return stored[SAVED_APPLICATION_QUESTIONS_KEY] || [];
}

async function addSavedApplicationQuestions(pairs, job) {
    if (!pairs.length) return;

    const savedQuestions = await getSavedApplicationQuestions();
    const byKey = new Map(
        savedQuestions.map((entry) => [applicationQuestionKey(entry), entry])
    );
    const savedAt = Date.now();

    for (const pair of pairs) {
        const entry = {
            question: pair.question,
            answer: pair.answer,
            fieldType: pair.fieldType || "",
            company: job.company || "",
            title: job.title || "",
            url: job.url || "",
            savedAt,
        };
        byKey.set(applicationQuestionKey(entry), entry);
    }

    await browser.storage.local.set({
        [SAVED_APPLICATION_QUESTIONS_KEY]: [...byKey.values()],
    });
}

async function clearSavedApplicationQuestions() {
    await browser.storage.local.set({ [SAVED_APPLICATION_QUESTIONS_KEY]: [] });
}

async function removeSavedApplicationQuestion(entry) {
    const savedQuestions = await getSavedApplicationQuestions();
    const key = applicationQuestionKey(entry);
    const filtered = savedQuestions.filter(
        (saved) => applicationQuestionKey(saved) !== key
    );
    await browser.storage.local.set({ [SAVED_APPLICATION_QUESTIONS_KEY]: filtered });
}

function formatApplicationQuestionsDownloadLine(entry) {
    const headerParts = [];
    if (entry.company) headerParts.push(entry.company);
    if (entry.title) headerParts.push(entry.title);
    const header = headerParts.length ? headerParts.join(", ") : "Application";
    const lines = [header];
    if (entry.url) lines.push("URL: " + entry.url);
    lines.push("Q: " + (entry.question || ""));
    lines.push("A: " + (entry.answer || ""));
    return lines.join("\n");
}

function formatApplicationQuestionsDownloadText(questions) {
    return questions.map((entry) => formatApplicationQuestionsDownloadLine(entry)).join("\n\n");
}

function formatSavedQuestionsCountLabel(count) {
    if (!count) return "No questions saved";
    if (count === 1) return "1 question saved";
    return count + " questions saved";
}

async function downloadAllSavedJobs() {
    const jobs = await getSavedJobs();
    const text = jobs.map((job) => formatSavedJobDownloadLine(job)).join("\n");
    await saveTextFile(text, "saved_jobs.txt");

    const questions = await getSavedApplicationQuestions();
    if (questions.length) {
        await saveTextFile(
            formatApplicationQuestionsDownloadText(questions),
            "saved_job_application_questions.txt"
        );
    }
}
