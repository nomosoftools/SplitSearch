// We no longer use 'let searchWindowId' at the top because it's not persistent.

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

        // 1. SNAP DOCUMENT TO LEFT
        chrome.windows.update(currentWin.id, {
          left: primaryDisplay.left,
          top: primaryDisplay.top,
          width: halfWidth,
          height: screenH,
          state: "normal"
        });

        const searchLeft = primaryDisplay.left + halfWidth;

        // 2. RETRIEVE PERSISTENT ID FROM STORAGE
        chrome.storage.local.get(['searchWindowId'], (result) => {
          const savedId = result.searchWindowId;

          if (savedId) {
            chrome.windows.get(savedId, (win) => {
              if (chrome.runtime.lastError || !win) {
                // Window was closed while extension was sleeping
                createNewSearchWindow(url, searchLeft, primaryDisplay.top, halfWidth, screenH);
              } else {
                chrome.tabs.query({ windowId: savedId, active: true }, (tabs) => {
                  if (tabs && tabs.length > 0) {
                    chrome.tabs.update(tabs[0].id, { url: url });
                    chrome.windows.update(savedId, { 
                      left: searchLeft, 
                      top: primaryDisplay.top, 
                      width: halfWidth, 
                      height: screenH, 
                      focused: true 
                    });
                  } else {
                    createNewSearchWindow(url, searchLeft, primaryDisplay.top, halfWidth, screenH);
                  }
                });
              }
            });
          } else {
            createNewSearchWindow(url, searchLeft, primaryDisplay.top, halfWidth, screenH);
          }
        });
      });
    });
  }
});

function createNewSearchWindow(url, left, top, width, height) {
  chrome.windows.create({
    url: url,
    left: left,
    top: top,
    width: width,
    height: height,
    focused: true,
    type: "normal"
  }, (newWin) => {
    // Save the ID to storage so it survives service worker hibernation
    chrome.storage.local.set({ searchWindowId: newWin.id });
  });
}
