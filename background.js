let searchWindowId = null;

// ADDED: 1. Clean it up after we close the whole window.
chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === searchWindowId) {
    searchWindowId = null;
  }
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
      
      if (!currentWin || currentWin.id === chrome.windows.WINDOW_ID_NONE) {
        return;
      }

      // GLOBAL REORGANIZE: Use the display's total available space instead of current window width
      // This ensures 50/50 split of the whole screen in all cases.
      chrome.system.display.getInfo((displays) => {
        const primaryDisplay = displays[0].workArea;
        const screenW = primaryDisplay.width;
        const screenH = primaryDisplay.height;
        const halfWidth = Math.round(screenW / 2);

        // 1. SNAP DOCUMENT TO LEFT HALF OF SCREEN
        chrome.windows.update(currentWin.id, {
          left: primaryDisplay.left,
          top: primaryDisplay.top,
          width: halfWidth,
          height: screenH,
          state: "normal"
        });

        const searchLeft = primaryDisplay.left + halfWidth;

        // 2. SNAP SEARCH TO RIGHT HALF OF SCREEN
        if (searchWindowId !== null) {
          chrome.windows.get(searchWindowId, (win) => {
            if (chrome.runtime.lastError || !win) {
              searchWindowId = null;
              createNewSearchWindow(url, searchLeft, primaryDisplay.top, halfWidth, screenH);
            } else {
              chrome.tabs.query({ windowId: searchWindowId, active: true }, (tabs) => {
                if (tabs.length > 0) {
                  chrome.tabs.update(tabs[0].id, { url: url });
                  chrome.windows.update(searchWindowId, { 
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
    searchWindowId = newWin.id;
  });
}
