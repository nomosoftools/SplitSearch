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

        // VENTURA FIX: Set state to 'normal' first, then wait 150ms to resize.
        chrome.windows.update(currentWin.id, { state: "normal" }, () => {
          setTimeout(() => {
            chrome.windows.update(currentWin.id, {
              left: primaryDisplay.left,
              top: primaryDisplay.top,
              width: halfWidth,
              height: screenH
            });

            const searchLeft = primaryDisplay.left + halfWidth;

            chrome.storage.local.get(['searchWindowId'], (result) => {
              const savedId = result.searchWindowId;

              if (savedId) {
                chrome.windows.get(savedId, (win) => {
                  if (chrome.runtime.lastError || !win) {
                    createNewSearchWindow(url, searchLeft, primaryDisplay.top, halfWidth, screenH);
                  } else {
                    chrome.tabs.query({ windowId: savedId, active: true }, (tabs) => {
                      if (tabs && tabs.length > 0) {
                        chrome.tabs.update(tabs[0].id, { url: url });
                        // Apply the same 'normal' state logic to the search window
                        chrome.windows.update(savedId, { 
                          state: "normal",
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
          }, 150); // The 150ms buffer allows the OS to process the "un-maximize"
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
    type: "normal",
    state: "normal"
  }, (newWin) => {
    chrome.storage.local.set({ searchWindowId: newWin.id });
  });
}
