const browser = globalThis.browser ?? globalThis.chrome;

const EXTENSION_DOWNLOAD_IDS_KEY = "extensionDownloadIds";

// Each export uses a fixed name; numbered variants are legacy copies to delete.
const EXTENSION_OUTPUT_PATTERNS = {
  "saved_jobs.txt": /^saved_jobs( \(\d+\))?\.txt$/i,
  "saved_job_application_questions.txt":
    /^saved_job_application_questions( \(\d+\))?\.txt$/i,
};

const LEGACY_OUTPUT_PATTERNS = {
  "saved_job_application_questions.txt":
    /^job_application_questions( \(\d+\))?\.txt$/i,
};

browser.action.onClicked.addListener((tab) => {
  browser.tabs.sendMessage(tab.id, { type: "TOGGLE_TASKBAR" })
    .then((res) => console.log("taskbar visible:", res?.visible))
    .catch((err) => console.warn("no content script on this tab:", err));
});

async function removeDownloadFile(item) {
  if (!item || item.state !== "complete") return;

  try {
    await browser.downloads.removeFile(item.id);
  } catch (_) {
    // File may have been moved or deleted manually.
  }

  try {
    await browser.downloads.erase({ id: item.id });
  } catch (_) {}
}

async function removePriorExtensionDownloads(filename) {
  const pattern = EXTENSION_OUTPUT_PATTERNS[filename];
  if (!pattern) return;

  const stored = await browser.storage.local.get(EXTENSION_DOWNLOAD_IDS_KEY);
  const tracked = stored[EXTENSION_DOWNLOAD_IDS_KEY] || {};
  const trackedId = tracked[filename];

  const seen = new Set();
  const toRemove = [];

  if (trackedId !== undefined) {
    const [trackedItem] = await browser.downloads.search({ id: trackedId });
    if (trackedItem) {
      seen.add(trackedItem.id);
      toRemove.push(trackedItem);
    }
  }

  const matches = await browser.downloads.search({
    filenameRegex: pattern.source,
    orderBy: ["-startTime"],
  });

  for (const item of matches) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    toRemove.push(item);
  }

  const legacyPattern = LEGACY_OUTPUT_PATTERNS[filename];
  if (legacyPattern) {
    const legacyMatches = await browser.downloads.search({
      filenameRegex: legacyPattern.source,
      orderBy: ["-startTime"],
    });
    for (const item of legacyMatches) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      toRemove.push(item);
    }
  }

  for (const item of toRemove) {
    await removeDownloadFile(item);
  }
}

async function rememberExtensionDownload(filename, downloadId) {
  const stored = await browser.storage.local.get(EXTENSION_DOWNLOAD_IDS_KEY);
  const tracked = stored[EXTENSION_DOWNLOAD_IDS_KEY] || {};
  tracked[filename] = downloadId;
  await browser.storage.local.set({ [EXTENSION_DOWNLOAD_IDS_KEY]: tracked });
}

async function downloadTextFile(text, filename) {
  await removePriorExtensionDownloads(filename);

  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);

  try {
    const downloadId = await browser.downloads.download({
      url,
      filename,
      conflictAction: "overwrite",
      saveAs: false,
    });

    if (downloadId !== undefined) {
      await rememberExtensionDownload(filename, downloadId);
    }

    return { ok: downloadId !== undefined };
  } catch (err) {
    console.warn("download failed:", err);
    return { ok: false };
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== "DOWNLOAD_TEXT_FILE") return;

  const filename = msg.filename;
  if (!filename) {
    sendResponse({ ok: false });
    return;
  }

  downloadTextFile(msg.text ?? "", filename)
    .then(sendResponse)
    .catch((err) => {
      console.warn("download failed:", err);
      sendResponse({ ok: false });
    });

  return true;
});
