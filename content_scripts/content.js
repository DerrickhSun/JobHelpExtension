// content.js
const TASKBAR_ID = "jobhelp-taskbar-host";

function createTaskbar() {
    if (document.getElementById(TASKBAR_ID)) return;

    const host = document.createElement("div");
    host.id = TASKBAR_ID;
    host.style.cssText = 'position: fixed; bottom: 0; left: 0; width: 100%; height: 50px; background-color: #f0f0f0; z-index: 1000;';

    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
        <style>
            :host {
                display: block;
                width: 100%;
                height: 100%;
            }
        </style>
    `;
    /*document.body.appendChild(host);*/
    document.documentElement.prepend(host);
    document.body.style.paddingTop = "50px";
}

function removeTaskbar() {
    const host = document.getElementById(TASKBAR_ID);
    if (!host) return;
    host.remove();
    document.body.style.paddingTop = "0";
}

const browser = globalThis.browser ?? globalThis.chrome;
browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'TOGGLE_TASKBAR') {
    const exists = document.getElementById(TASKBAR_ID);
    exists ? removeTaskbar() : createTaskbar();
    sendResponse({ visible: !exists });
  }
  return true; // keep channel open for async sendResponse
});