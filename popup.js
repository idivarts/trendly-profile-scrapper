const scrapeBtn = document.getElementById('scrape');
const out = document.getElementById('out');
const downloadBtn = document.getElementById('download-json');
const copyBtn = document.getElementById('copy-json');

let lastData = null;

function enableActions(enabled) {
    downloadBtn.disabled = !enabled;
    copyBtn.disabled = !enabled;
}

scrapeBtn.addEventListener('click', async () => {
    enableActions(false);
    out.textContent = 'Scraping...';

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !/^https:\/\/www\.instagram\.com\/[^/]+\/?$/.test(tab.url)) {
            out.textContent = 'Please open a profile page like https://www.instagram.com/<username>/ and try again.';
            return;
        }

        const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: scrapeInstagramProfileOnPage
        });

        lastData = result;
        out.textContent = JSON.stringify(result, null, 2);
        enableActions(true);

    } catch (err) {
        console.error(err);
        out.textContent = `Error: ${err.message}`;
    }
});

copyBtn.addEventListener('click', async () => {
    if (!lastData) return;
    await navigator.clipboard.writeText(JSON.stringify(lastData, null, 2));
    copyBtn.textContent = 'Copied';
    setTimeout(() => (copyBtn.textContent = 'Copy JSON'), 1200);
});

downloadBtn.addEventListener('click', () => {
    if (!lastData) return;
    const blob = new Blob([JSON.stringify(lastData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const username = lastData.username || 'instagram_profile';
    a.href = url;
    a.download = `${username}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
});

/**
 * Runs in the page context to scrape profile data.
 * Keep this pure; it returns a plain object.
 */
function scrapeInstagramProfileOnPage() {
    // Helper: get meta content
    const meta = (prop) => document.querySelector(`meta[property="${prop}"]`)?.getAttribute('content') || null;

    // Username from URL
    const pathParts = location.pathname.split('/').filter(Boolean);
    const username = pathParts[0] || null;

    // Basic metas
    const ogTitle = meta('og:title');          // "Full Name (@handle) • Instagram photos and videos"
    const ogDesc = meta('og:description');    // "X Followers, Y Following, Z Posts - See Instagram photos…"
    const ogImage = meta('og:image');          // profile picture

    // Parse counts from og:description
    let followers = null, following = null, posts = null;
    if (ogDesc) {
        // Examples: "1,234 followers, 56 following, 78 posts"
        const lower = ogDesc.toLowerCase();
        const matchFollowers = lower.match(/([\d.,]+)\s*followers/);
        const matchFollowing = lower.match(/([\d.,]+)\s*following/);
        const matchPosts = lower.match(/([\d.,]+)\s*posts?/);

        const toNumber = (s) => s ? Number(s.replace(/[,\.](?=\d{3}\b)/g, '').replace(/,/g, '')) : null;

        followers = matchFollowers ? toNumber(matchFollowers[1]) : null;
        following = matchFollowing ? toNumber(matchFollowing[1]) : null;
        posts = matchPosts ? toNumber(matchPosts[1]) : null;
    }

    // Try to parse ld+json for better name/description
    let fullName = null;
    let bio = null;
    try {
        const ldScript = document.querySelector('script[type="application/ld+json"]');
        if (ldScript?.textContent) {
            const data = JSON.parse(ldScript.textContent);
            // Instagram sometimes wraps it in an array
            const node = Array.isArray(data) ? data.find(x => x['@type'] === 'Person') || data[0] : data;
            fullName = node?.name || fullName;
            bio = node?.description || bio;
        }
    } catch (_) { }

    // If fullName not found, attempt from og:title ("Full Name (@handle) • ...")
    if (!fullName && ogTitle) {
        const nameMatch = ogTitle.split('(@')[0].trim();
        fullName = nameMatch || null;
    }

    // Guess verified tick near name (best effort)
    // Look for an svg with aria-label="Verified" in header region
    let isVerified = false;
    try {
        const header = document.querySelector('header') || document;
        const verifiedSvg = header.querySelector('svg[aria-label="Verified"]');
        isVerified = Boolean(verifiedSvg);
    } catch (_) { }

    // External link (website) if present in header bio area
    let externalUrl = null;
    try {
        // Instagram uses <a> in the bio area; avoid internal links
        const header = document.querySelector('header') || document;
        const links = [...header.querySelectorAll('a[href^="http"]')];
        // Exclude self links to instagram.com
        const external = links.find(a => !a.href.includes('instagram.com'));
        externalUrl = external?.href || null;
    } catch (_) { }

    return {
        url: location.href,
        username,
        fullName,
        bio,
        followers,
        following,
        posts,
        profilePic: ogImage,
        isVerified,
        externalUrl,
        scrapedAt: new Date().toISOString()
    };
}