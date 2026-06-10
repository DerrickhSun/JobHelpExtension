const browser = globalThis.browser ?? globalThis.chrome;

browser.action.onClicked.addListener((tab) => {
  browser.tabs.sendMessage(tab.id, { type: "TOGGLE_TASKBAR" })
    .then((res) => console.log("taskbar visible:", res?.visible))
    .catch((err) => console.warn("no content script on this tab:", err));
});

browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== "DOWNLOAD_TEXT_FILE") return;

  const text = msg.text ?? "";
  const filename = msg.filename;
  if (!filename) {
    sendResponse({ ok: false });
    return;
  }

  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);

  const revokeLater = () => {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  browser.downloads.download({
    url,
    filename,
    conflictAction: "overwrite",
    saveAs: false,
  })
    .then((downloadId) => {
      revokeLater();
      sendResponse({ ok: downloadId !== undefined });
    })
    .catch((err) => {
      URL.revokeObjectURL(url);
      console.warn("download failed:", err);
      sendResponse({ ok: false });
    });

  return true;
});
