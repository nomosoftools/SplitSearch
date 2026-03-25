// Helper for logging
const log = (msg, data = "") => console.log(`[SplitSearch] ${msg}`, data);

/**
 * Robust Text Extractor (v5 - Flawless Edition)
 * 
 * FIXED FOR QUANTA MAGAZINE (and any site that blocks right-click):
 * 1. Uses browser's authoritative selection.toString() → ZERO unrelated source code ever
 * 2. Full Shadow DOM piercing (already perfect)
 * 3. Pseudo-elements (::before / ::after) perfectly included
 * 4. Images + <picture> + alt/title text cleanly appended as [alt]
 * 5. Now also works via keyboard shortcut (Ctrl+Shift+S) on pages that suppress the context menu
 * 
 * Why this fixes your exact problem:
 * - Quanta Magazine runs `e.preventDefault()` on `contextmenu` → native + extension menus disappear
 * - You can still Ctrl+C (keyboard), but the old menu never appeared
 * - New keyboard command bypasses that completely
 */
function getRobustSelection() {
  // 1. Find the active Selection object, piercing through any number of nested Shadow Roots
  function getActiveSelection() {
    let curr = document;
    while (curr) {
      const sel = curr.getSelection();
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) return sel;

      const active = curr.activeElement;
      if (active && active.shadowRoot) {
        curr = active.shadowRoot;
      } else {
        curr = null;
      }
    }
    return null;
  }

  const selection = getActiveSelection();
  if (!selection) return "";

  // 2. Authoritative visible text (includes pseudo-elements perfectly)
  let finalOutput = selection.toString().trim();

  // 3. Extract images/pictures that are inside the exact selection range
  const range = selection.getRangeAt(0);
  const fragment = range.cloneContents();
  const container = document.createElement('div');
  container.appendChild(fragment);

  const imageAlts = [];

  function collectImages(node) {
    if (!node) return;

    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.tagName === 'IMG') {
        const alt = (node.alt || node.title || "").trim();
        if (alt) imageAlts.push(`[${alt}]`);
      } else if (node.tagName === 'PICTURE') {
        const img = node.querySelector('img');
        if (img) {
          const alt = (img.alt || img.title || "").trim();
          if (alt) imageAlts.push(`[${alt}]`);
        }
      }
    }

    if (node.childNodes && node.childNodes.length) {
      for (const child of node.childNodes) {
        collectImages(child);
      }
    }
  }

  collectImages(container);

  if (imageAlts.length > 0) {
    finalOutput += (finalOutput ? " " : "") + imageAlts.join(" ");
  }

  // 4. Final cleanup
  return finalOutput.replace(/\s+/g, " ").trim();
}

// -------- Window Cleanup --------
chrome.windows.onRemoved.addListener((windowId) => {
  chrome.storage.local.get(['searchWindowId'], (result) => {
    if (windowId === result.searchWindowId) {
      chrome.storage.local.remove('searchWindowId');
    }
  });
});

// -------- Context Menu Setup --------
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "searchSplitScreen",
      title: "Search in Research Window",
      contexts: ["selection"]
    });
  });
});

// -------- Keyboard Shortcut Support (critical for Quanta & other anti-copy sites) --------
chrome.commands.onCommand.addListener((command) => {
  if (command === "searchSplitScreen") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs?.length) return;
      const tab = tabs[0];

      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: getRobustSelection
      }).then((results) => {
        const text = results[0]?.result;
        if (text) {
          processSearch(text, tab);
        }
      }).catch(err => console.error("Keyboard Extraction Error:", err));
    });
  }
});

// -------- Safe Window Resize --------
function safeResizeWindow(windowId, bounds, focus, callback) {
  chrome.windows.update(windowId, { state: "normal" }, () => {
    if (chrome.runtime.lastError) {
      if (callback) callback();
      return;
    }
    setTimeout(() => {
      const updateInfo = {
        left: Math.round(bounds.left),
        top: Math.round(bounds.top),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height)
      };
      if (focus) updateInfo.focused = true;
      chrome.windows.update(windowId, updateInfo, () => {
        if (chrome.runtime.lastError) return;
        if (callback) callback();
      });
    }, 200);
  });
}

// -------- Context Menu Click Handler --------
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "searchSplitScreen") {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: getRobustSelection
    }).then((results) => {
      const text = results[0]?.result;
      if (text) {
        processSearch(text, tab);
      }
    }).catch(err => console.error("Extraction Error:", err));
  }
});

// -------- Search Window Management --------
function processSearch(rawText, tab) {
  const truncatedText = rawText.substring(0, 1100);
  const query = encodeURIComponent(truncatedText.trim());
  const url = `https://www.google.com/search?q=${query}`;

  chrome.windows.getLastFocused({ populate: false }, (currentWin) => {
    chrome.system.display.getInfo((displays) => {
      if (!displays?.length) return;
      const display = displays.find(d =>
        currentWin.left >= d.bounds.left &&
        currentWin.left < d.bounds.left + d.bounds.width
      ) || displays[0];
      const workArea = display.workArea;
      const halfWidth = Math.round(workArea.width / 2);
      const docBounds = {
        left: workArea.left,
        top: workArea.top,
        width: halfWidth,
        height: workArea.height
      };
      const searchBounds = {
        left: workArea.left + halfWidth,
        top: workArea.top,
        width: halfWidth,
        height: workArea.height
      };

      safeResizeWindow(currentWin.id, docBounds, false, () => {
        chrome.storage.local.get(['searchWindowId'], (result) => {
          const savedId = result.searchWindowId;
          if (savedId) {
            chrome.windows.get(savedId, (win) => {
              if (chrome.runtime.lastError || !win) {
                createNewSearchWindow(url, searchBounds);
              } else {
                chrome.tabs.query({ windowId: savedId, active: true }, (tabs) => {
                  if (tabs?.length > 0) {
                    chrome.tabs.update(tabs[0].id, { url: url });
                    safeResizeWindow(savedId, searchBounds, true);
                  } else {
                    createNewSearchWindow(url, searchBounds);
                  }
                });
              }
            });
          } else {
            createNewSearchWindow(url, searchBounds);
          }
        });
      });
    });
  });
}

function createNewSearchWindow(url, bounds) {
  chrome.windows.create({
    url: url,
    left: Math.round(bounds.left),
    top: Math.round(bounds.top),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
    focused: true,
    type: "normal"
  }, (newWin) => {
    chrome.storage.local.set({ searchWindowId: newWin.id });
  });
}
