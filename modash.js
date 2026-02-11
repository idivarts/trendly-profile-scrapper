let scrapedData = [];

const $ = (id) => document.getElementById(id);
const statusText = $("statusText");
const totalCount = $("totalCount");

function setModashStatus(msg) { statusText.textContent = msg; }
function setCount(n) { totalCount.textContent = String(n); }

// Get chrome storage and update the scrappedData variable
chrome.storage.local.get(["modashScrapedData"]).then((result) => {
    if (result.modashScrapedData) {
        scrapedData = Array.isArray(result.modashScrapedData) ? result.modashScrapedData : [];
        setCount(scrapedData.length);
        setModashStatus(`Loaded ${scrapedData.length} items from storage`);
    } else {
        setModashStatus("No stored data. Click Scrape to begin.");
    }
})

$("btn-modash-clear").addEventListener("click", async () => {
    scrapedData = [];
    setCount(0);
    setModashStatus("Cleared data");
    await chrome.storage.local.remove("modashScrapedData");
});
// Ask parent (content script) to scrape
$("btn-modash-scrape").addEventListener("click", async () => {
    setModashStatus("Scraping…");
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url.includes("marketer.modash.io")) {
            setModashStatus('Please open a profile page like https://marketer.modash.io/discover/ and try again.');
            return;
        }

        const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: scrapeModashPage
        });

        localData = Array.isArray(result) ? result : [];
        const handleSet = new Set(scrapedData.map(item => item.handle));
        scrapedData.push(...localData.filter(item => !handleSet.has(item.handle)));

        setCount(scrapedData.length);
        setModashStatus(`Scraped ${scrapedData.length} items`);
        console.log("Scraped data:", scrapedData);

        // save in chrome storage
        await chrome.storage.local.set({ modashScrapedData: scrapedData });

        // If you want to also notify a parent/content script, uncomment:
        // window.postMessage({ source: "trendly_modash_ui", type: "SCRAPE_COMPLETE", payload: scrapedData }, "*");
    } catch (err) {
        console.error(err);
        setModashStatus("Scrape failed. See console.");
    }
});

// Copy JSON to clipboard
$("btn-modash-copy").addEventListener("click", async () => {
    try {
        await navigator.clipboard.writeText(JSON.stringify(scrapedData, null, 2));
        setModashStatus("JSON copied to clipboard");
    } catch (e) {
        setModashStatus("Copy failed. See console.");
        console.error(e);
    }
});

// Download CSV
$("btn-modash-download").addEventListener("click", () => {
    if (!scrapedData.length) {
        setModashStatus("No data to export. Run Scrape first.");
        return;
    }
    const csv = toCSV(scrapedData);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trendly-modash-export-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
    setModashStatus("CSV downloaded");
});

// Listen for results from content script
window.addEventListener("message", (event) => {
    const msg = event.data || {};
    if (msg.source !== "trendly_modash_content") return;

    if (msg.type === "SCRAPE_RESULT") {
        scrapedData = Array.isArray(msg.payload) ? msg.payload : [];
        setCount(scrapedData.length);
        setModashStatus(`Received ${scrapedData.length} items`);
        // Optionally preview in console
        console.log("Scraped data:", scrapedData);
    }
});

// Utility: JSON → CSV (flat keys only; nested objects will be JSON-stringified)
function toCSV(rows) {
    const headers = [...new Set(rows.flatMap(obj => Object.keys(obj)))];
    const lines = [
        headers.map(h => csvEscape(h)).join(","),
        ...rows.map(row =>
            headers.map(h => {
                const val = row[h];
                if (val == null) return "";
                if (typeof val === "object") return csvEscape(JSON.stringify(val));
                return csvEscape(String(val));
            }).join(",")
        )
    ];
    return lines.join("\n");
}

function csvEscape(value) {
    const mustQuote = /[",\n]/.test(value);
    const escaped = value.replace(/"/g, '""');
    return mustQuote ? `"${escaped}"` : escaped;
}

function scrapeModashPage() {

    console.log("Scrapping data", document);

    // 1) Anchor to <main id="mainContent"> only
    const main = document.querySelector('main');
    if (!main) return [];
    console.log("Scappring from Main:", main);

    function validateHandle(rawHandle) {
        if (!rawHandle) return null;
        let handle = rawHandle.trim();
        // Ensure it starts with "@"
        if (!handle.startsWith("@")) {
            return null
        }
        // Allow only letters, numbers, underscores, and dots after "@"
        const match = handle.match(/^@[A-Za-z0-9._]+$/);
        if (!match) return null;
        return handle;
    }

    const list = main.querySelector("ul")
    console.log("List:", list);


    const items = list.querySelectorAll("li")
    console.log("Items:", items);


    const results = [];
    for (const card of items) {
        console.log("Card:", card);


        const name = card.children[1].children[0].children[0].innerHTML
        const handle = card.children[1].children[1].innerHTML // example: @handle

        if (!name)
            continue;
        if (!validateHandle(handle))
            continue;

        const profileUrl = "https://www.instagram.com/" + handle.replace("@", "")

        const followers = card.children[2].children[0].innerHTML
        const engagementRate = card.children[3].children[0].innerHTML
        const engagement = card.children[4].children[0].innerHTML
        const reelPlays = card.children[5].children[0].innerHTML

        // Only keep items that at least have a handle or profileUrl
        if (handle || profileUrl) {
            results.push({
                handle,
                name,
                profileUrl,
                followers,
                engagementRate,
                engagement,
                reelPlays
            });
        }
    }

    return results;
}