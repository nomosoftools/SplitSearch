// ==========================================
// 1. CLEANUP & INITIALIZATION
// ==========================================
chrome.windows.onRemoved.addListener((windowId) => {
  chrome.storage.local.get(['searchWindowId'], (result) => {
    if (windowId === result.searchWindowId) {
      chrome.storage.local.remove('searchWindowId');
    }
  });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "searchSplitScreen",
      title: "Search in Research Window",
      contexts: ["selection"]
    });
  });
});

// ==========================================
// 2. MULTI-MONITOR HELPER
// ==========================================
function getDisplayForWindow(win, displays) {
  // Calculate the center point of the current window
  const winCenterX = win.left + (win.width / 2);
  const winCenterY = win.top + (win.height / 2);
  
  // Find which display contains this center point
  for (let display of displays) {
    const bounds = display.workArea;
    if (winCenterX >= bounds.left && winCenterX <= (bounds.left + bounds.width) &&
        winCenterY >= bounds.top && winCenterY <= (bounds.top + bounds.height)) {
      return display.workArea;
    }
  }
  return displays[0].workArea; // Fallback to primary
}

// ==========================================
// 3. HIGH-PERFORMANCE RESIZE HELPER
// ==========================================
function safeResizeWindow(win, bounds, focus, callback) {
  const updateInfo = { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height };
  if (focus) updateInfo.focused = true;

  // FAST PATH: If already normal, resize instantly.
  if (win.state === "normal") {
    chrome.windows.update(win.id, updateInfo, () => {
      if (callback) callback();
    });
  } else {
    // SLOW PATH: OS requires un-maximizing first (Ventura/Sonoma safety)
    chrome.windows.update(win.id, { state: "normal" }, () => {
      setTimeout(() => {
        chrome.windows.update(win.id, updateInfo, () => {
          if (callback) callback();
        });
      }, 200);
    });
  }
}

// ==========================================
// 4. CORE SPLIT SCREEN ENGINE
// ==========================================
function executeSplitScreen(query) {
  const url = `https://www.google.com/search?q=${query}`;

  chrome.windows.getLastFocused({populate: false}, (currentWin) => {
    if (!currentWin || currentWin.id === chrome.windows.WINDOW_ID_NONE) return;

    chrome.system.display.getInfo((displays) => {
      const activeDisplay = getDisplayForWindow(currentWin, displays);
      const halfWidth = Math.round(activeDisplay.width / 2);

      const docBounds = {
        left: activeDisplay.left,
        top: activeDisplay.top,
        width: halfWidth,
        height: activeDisplay.height
      };

      const searchBounds = {
        left: activeDisplay.left + halfWidth,
        top: activeDisplay.top,
        width: halfWidth,
        height: activeDisplay.height
      };

      // 1. Resize the Document Window safely
      safeResizeWindow(currentWin, docBounds, false, () => {
        
        // 2. Handle the Search Window
        chrome.storage.local.get(['searchWindowId'], (result) => {
          const savedId = result.searchWindowId;

          if (savedId) {
            chrome.windows.get(savedId, (searchWin) => {
              if (chrome.runtime.lastError || !searchWin) {
                createNewSearchWindow(url, searchBounds);
              } else {
                chrome.tabs.query({ windowId: savedId, active: true }, (tabs) => {
                  if (tabs && tabs.length > 0) {
                    chrome.tabs.update(tabs[0].id, { url: url });
                    safeResizeWindow(searchWin, searchBounds, true);
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
    left: bounds.left,
    top: bounds.top,
    width: bounds.width,
    height: bounds.height,
    focused: true,
    type: "normal"
  }, (newWin) => {
    chrome.storage.local.set({ searchWindowId: newWin.id });
  });
}

// ==========================================
// 5. TRIGGERS: CONTEXT MENU & SHORTCUT
// ==========================================

// Trigger A: Context Menu (Works on PDFs and normal sites)
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "searchSplitScreen" && info.selectionText) {
    executeSplitScreen(encodeURIComponent(info.selectionText));
  }
});

// Trigger B: Keyboard Shortcut (Bypasses Right-Click Bans)
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "search_selection") {
    // Inject a script to grab the highlighted text
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection().toString().trim()
    }, (results) => {
      // Ignore if on a restricted page where scripting isn't allowed
      if (chrome.runtime.lastError) return; 
      
      const selectedText = results[0]?.result;
      if (selectedText) {
        executeSplitScreen(encodeURIComponent(selectedText));
      }
    });
  }
});
