let searchWindowId = null;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "searchSplitScreen",
      title: "Search in Focus Window",
      contexts: ["selection"]
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "searchSplitScreen") {
    const query = encodeURIComponent(info.selectionText);
    const url = `https://www.google.com/search?q=${query}`;

    // Get the actual screen dimensions, not the window dimensions
    chrome.system.display.getInfo((displays) => {
      // We target the primary display (usually displays[0])
      const screen = displays[0].workArea; 
      const halfWidth = Math.floor(screen.width / 2);
      const fullHeight = screen.height;
      const screenLeft = screen.left;
      const screenTop = screen.top;

      // 1. Force the Document Window to the LEFT 50% of the SCREEN
      chrome.windows.update(tab.windowId, {
        state: "normal",
        left: screenLeft,
        top: screenTop,
        width: halfWidth,
        height: fullHeight
      });

      const searchLeft = screenLeft + halfWidth;

      // 2. Force the Search Window to the RIGHT 50% of the SCREEN
      if (searchWindowId !== null) {
        chrome.windows.get(searchWindowId, (win) => {
          if (chrome.runtime.lastError || !win) {
            createNewSearchWindow(url, searchLeft, screenTop, halfWidth, fullHeight);
          } else {
            chrome.tabs.query({ windowId: searchWindowId, active: true }, (tabs) => {
              if (tabs.length > 0) {
                chrome.tabs.update(tabs[0].id, { url: url });
                chrome.windows.update(searchWindowId, { 
                  focused: true,
                  left: searchLeft,
                  top: screenTop,
                  width: halfWidth,
                  height: fullHeight,
                  state: "normal"
                });
              }
            });
          }
        });
      } else {
        createNewSearchWindow(url, searchLeft, screenTop, halfWidth, fullHeight);
      }
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