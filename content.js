// content.js
function scrape() {
    // paste the same scrapeInstagramProfileOnPage body here and return the object
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'SCRAPE_IG_PROFILE') {
        try { sendResponse({ ok: true, data: scrape() }); }
        catch (e) { sendResponse({ ok: false, error: e.message }); }
    }
    // Return true to indicate async response (not needed here)
    return false;
});