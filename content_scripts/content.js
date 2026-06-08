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

// Populates our slot with this extension's buttons. Called by the shared module
// with our slot element (which lives inside the shared taskbar's shadow DOM).
function buildButtons(slot) {
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.textContent = 'Save "Hello world"';
    saveBtn.addEventListener("click", () => saveTextFile("Hello world", "hello.txt"));
    slot.appendChild(saveBtn);
}

const browser = globalThis.browser ?? globalThis.chrome;
browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'TOGGLE_TASKBAR') {
    const registered = isTaskbarRegistered(EXT_KEY);
    if (registered) {
      unregisterTaskbar(EXT_KEY);
    } else {
      registerTaskbar(EXT_KEY, buildButtons, TASKBAR_ORDER);
    }
    sendResponse({ visible: !registered });
  }
  return true; // keep channel open for async sendResponse
});
