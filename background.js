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
// THE BULLETPROOF RESIZE HELPER
// ==========================================
function safeResizeWindow(windowId, bounds, focus, callback) {
  // Step 1: Force the OS to drop any maximized/fullscreen/snapped states
  chrome.windows.update(windowId, { state: "normal" }, () => {
    
    // Step 2: Wait 200ms. This covers the longest OS UI animations (macOS Ventura/Sonoma)
    setTimeout(() => {
      
      // Step 3: Apply the exact coordinates now that the OS is ready
      const updateInfo = {
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height
      };
      
      if (focus) updateInfo.focused = true;
      
      chrome.windows.update(windowId, updateInfo, () => {
        if (callback) callback();
      });
    }, 200);
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "searchSplitScreen") {
    const query = encodeURIComponent(info.selectionText);
    const url = `https://www.google.com/search?q=${query}`;

    chrome.windows.getLastFocused({populate: false}, (currentWin) => {
      if (!currentWin || currentWin.id === chrome.windows.WINDOW_ID_NONE) return;

      chrome.system.display.getInfo((displays) => {
        const primaryDisplay = displays[0].workArea;
        const screenW = primaryDisplay.width;
        const screenH = primaryDisplay.height;
        const halfWidth = Math.round(screenW / 2);

        // Define exact target dimensions for both windows
        const docBounds = {
          left: primaryDisplay.left,
          top: primaryDisplay.top,
          width: halfWidth,
          height: screenH
        };

        const searchBounds = {
          left: primaryDisplay.left + halfWidth,
          top: primaryDisplay.top,
          width: halfWidth,
          height: screenH
        };

        // 1. Resize the Document Window safely
        safeResizeWindow(currentWin.id, docBounds, false, () => {
          
          // 2. Handle the Search Window
          chrome.storage.local.get(['searchWindowId'], (result) => {
            const savedId = result.searchWindowId;

            if (savedId) {
              chrome.windows.get(savedId, (win) => {
                if (chrome.runtime.lastError || !win) {
                  createNewSearchWindow(url, searchBounds);
                } else {
                  chrome.tabs.query({ windowId: savedId, active: true }, (tabs) => {
                    if (tabs && tabs.length > 0) {
                      chrome.tabs.update(tabs[0].id, { url: url });
                      // VENTURA FIX APPLIED HERE: Safely resize the existing search window too!
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
});

function createNewSearchWindow(url, bounds) {
  // By passing explicit bounds, Chrome implicitly creates it as "normal". 
  // We removed `state: "normal"` here because forcing state during creation can trigger OS bugs.
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
