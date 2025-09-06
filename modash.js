// Holds the latest results inside the iframe context
let scrapedData = [];

const $ = (id) => document.getElementById(id);
const statusText = $("statusText");
const totalCount = $("totalCount");

function setStatus(msg) { statusText.textContent = msg; }
function setCount(n) { totalCount.textContent = String(n); }

// Ask parent (content script) to scrape
$("btn-scrape").addEventListener("click", () => {
    setStatus("Scraping…");
    window.parent.postMessage({ source: "trendly_modash_iframe", type: "SCRAPE_REQUEST" }, "*");
});

// Copy JSON to clipboard
$("btn-copy").addEventListener("click", async () => {
    try {
        await navigator.clipboard.writeText(JSON.stringify(scrapedData, null, 2));
        setStatus("JSON copied to clipboard");
    } catch (e) {
        setStatus("Copy failed. See console.");
        console.error(e);
    }
});

// Download CSV
$("btn-download").addEventListener("click", () => {
    if (!scrapedData.length) {
        setStatus("No data to export. Run Scrape first.");
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
    setStatus("CSV downloaded");
});

// Listen for results from content script
window.addEventListener("message", (event) => {
    const msg = event.data || {};
    if (msg.source !== "trendly_modash_content") return;

    if (msg.type === "SCRAPE_RESULT") {
        scrapedData = Array.isArray(msg.payload) ? msg.payload : [];
        setCount(scrapedData.length);
        setStatus(`Received ${scrapedData.length} items`);
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

// // modash.js (content script for https://marketer.modash.io/discovery*)
// (function () {
//     const EXT_SOURCE = "trendly_modash_content";
//     const IFRAME_SOURCE = "trendly_modash_iframe";

//     let panelIframe = null;
//     let openerBtn = null;
//     let scrapedData = [];

//     // Inject a small opener button
//     function ensureOpener() {
//         if (openerBtn) return;
//         openerBtn = document.createElement("button");
//         openerBtn.textContent = "Trendly Scraper";
//         openerBtn.style.position = "fixed";
//         openerBtn.style.bottom = "20px";
//         openerBtn.style.right = "20px";
//         openerBtn.style.zIndex = "2147483647";
//         openerBtn.style.padding = "10px 12px";
//         openerBtn.style.borderRadius = "10px";
//         openerBtn.style.border = "1px solid #1f2937";
//         openerBtn.style.background = "#0b1220";
//         openerBtn.style.color = "#e5e7eb";
//         openerBtn.style.cursor = "pointer";
//         openerBtn.style.boxShadow = "0 6px 24px rgba(0,0,0,0.35)";
//         openerBtn.addEventListener("click", togglePanel);
//         document.documentElement.appendChild(openerBtn);
//     }

//     // Create/remove panel iframe
//     function togglePanel() {
//         if (panelIframe) {
//             panelIframe.remove();
//             panelIframe = null;
//             return;
//         }
//         panelIframe = document.createElement("iframe");
//         panelIframe.src = chrome.runtime.getURL("modash.html");
//         panelIframe.style.position = "fixed";
//         panelIframe.style.bottom = "70px";
//         panelIframe.style.right = "20px";
//         panelIframe.style.width = "380px";
//         panelIframe.style.height = "220px";
//         panelIframe.style.border = "0";
//         panelIframe.style.borderRadius = "12px";
//         panelIframe.style.zIndex = "2147483647";
//         panelIframe.style.boxShadow = "0 12px 40px rgba(0,0,0,0.5)";
//         document.documentElement.appendChild(panelIframe);
//     }

//     // Listen for messages from iframe
//     window.addEventListener("message", async (event) => {
//         const msg = event.data || {};
//         if (msg.source !== IFRAME_SOURCE) return;

//         if (msg.type === "SCRAPE_REQUEST") {
//             try {
//                 scrapedData = await scrapeModashPage();
//                 postToIframe({ type: "SCRAPE_RESULT", payload: scrapedData });
//             } catch (e) {
//                 console.error("Scrape failed:", e);
//                 postToIframe({ type: "SCRAPE_RESULT", payload: [] });
//             }
//         }
//     });

//     function postToIframe(message) {
//         if (!panelIframe || !panelIframe.contentWindow) return;
//         panelIframe.contentWindow.postMessage({ source: EXT_SOURCE, ...message }, "*");
//     }

//     // ====== Template Scraper ======
//     // Replace this with real DOM extraction once we lock selectors/structure.
//     async function scrapeModashPage() {
//         // TODO: Replace placeholders below with real selectors based on Modash DOM
//         // Example shape for each item; keep keys stable so CSV headers are predictable.
//         // You can expand as you discover more fields.
//         const results = [];

//         // Example: find cards (adjust selector once known)
//         // const cards = document.querySelectorAll('[data-testid="creator-card"], .someCardClass');
//         const cards = []; // placeholder until selectors are confirmed

//         // If you want a quick demo without real scraping, you can seed one row:
//         // results.push({
//         //   handle: "@demo_creator",
//         //   name: "Demo Creator",
//         //   platform: "instagram",
//         //   followers: 12345,
//         //   avg_likes: 678,
//         //   location: "India",
//         //   categories: ["Fashion", "Beauty"],
//         //   profile_url: "https://instagram.com/demo_creator"
//         // });

//         for (const card of cards) {
//             // Example extraction (update selectors as needed)
//             const handle = text(card.querySelector(".handle, [data-testid='handle']"));
//             const name = text(card.querySelector(".name, [data-testid='name']"));
//             const platform = text(card.querySelector(".platform, [data-testid='platform']"));
//             const followers = toNumber(text(card.querySelector(".followers")));
//             const avgLikes = toNumber(text(card.querySelector(".avgLikes")));
//             const location = text(card.querySelector(".location"));
//             const categories = (text(card.querySelector(".categories")) || "")
//                 .split(/,|\u2022|\|/).map(s => s.trim()).filter(Boolean);
//             const profileUrl = link(card.querySelector("a[href*='instagram.com'], a[href*='tiktok.com'], a[href*='youtube.com']"));

//             results.push({
//                 handle,
//                 name,
//                 platform,
//                 followers,
//                 avg_likes: avgLikes,
//                 location,
//                 categories,
//                 profile_url: profileUrl
//             });
//         }

//         return results;
//     }

//     function text(el) { return el ? (el.textContent || "").trim() : ""; }
//     function link(el) { return el ? el.href : ""; }
//     function toNumber(s) {
//         if (!s) return 0;
//         // Convert strings like "12.3k" or "4.5M" to numbers
//         const m = String(s).trim().toLowerCase().match(/^([0-9,.]+)\s*([km]?)$/i);
//         if (!m) return Number(String(s).replace(/[^\d.]/g, "")) || 0;
//         const n = parseFloat(m[1].replace(/,/g, "")) || 0;
//         const unit = m[2];
//         if (unit === "k") return Math.round(n * 1_000);
//         if (unit === "m") return Math.round(n * 1_000_000);
//         return Math.round(n);
//     }

//     // Boot
//     ensureOpener();
// })();