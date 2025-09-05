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
        if (!tab || !/^https:\/\/www\.instagram\.com\/[^/]+\/?[^/]+\/?$/.test(tab.url)) {
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
    // Focus only on sections inside the profile <header> and extract by section index
    // Section order (based on current IG desktop DOM):
    // [0] Profile Picture, [1] Top username/actions, [2] Stats, [3] Name/Category/Bio/Links, ...

    const header = document.querySelector('main header');
    if (!header) {
        return { error: 'Header not found', raw: null };
    }

    const sections = Array.from(header.querySelectorAll(':scope > section'));
    const sec = (i) => sections[i] || null;

    // Helpers
    const text = (el) => (el ? (el.textContent || '').trim() : '');
    const attr = (el, a) => (el ? el.getAttribute(a) || '' : '');

    function parseCompactNumber(s) {
        if (!s) return null;
        const clean = String(s).replace(/[,\s]/g, '').toLowerCase();
        const m = clean.match(/^(\d+(?:\.\d+)?)([kmb])?$/);
        if (!m) {
            const asInt = parseInt(clean, 10);
            return Number.isFinite(asInt) ? asInt : null;
        }
        const num = parseFloat(m[1]);
        const suf = m[2];
        const mult = suf === 'k' ? 1e3 : suf === 'm' ? 1e6 : suf === 'b' ? 1e9 : 1;
        return Math.round(num * mult);
    }

    function absoluteUrl(href) {
        try {
            if (!href) return '';
            return new URL(href, location.origin).toString();
        } catch (_) {
            return href;
        }
    }

    // =========================
    // [0] Profile Picture
    // =========================
    const s0 = sec(0);
    const profilePicEl = s0 ? s0.querySelector('img') : null;
    const profilePic = profilePicEl ? profilePicEl.src : '';

    // =========================
    // [1] Top Username / Actions
    // =========================
    const s1 = sec(1);
    const username = text(s1 ? s1.querySelector('h2 span, h2') : null);

    const hasFollowButton = !!(s1 && s1.querySelector('button, div[role="button"]')) &&
        /follow/i.test(text(s1.querySelector('button, div[role="button"]')));
    const hasMessageButton = !!(s1 && s1.querySelector('div[role="button"]')) &&
        /message/i.test(text(s1.querySelector('div[role="button"]')));

    // =========================
    // [2] Stats: posts / followers / following
    // =========================
    const s2 = sec(2);
    const li = s2 ? s2.querySelectorAll('li') : [];

    // posts
    const postsText = text(li[0] ? li[0].querySelector('span span, span') : null);
    const posts = {
        text: postsText,
        value: parseCompactNumber(postsText)
    };

    // followers
    const followersTitleEl = li[1] ? li[1].querySelector('[title]') : null;
    const followersTitle = attr(followersTitleEl, 'title'); // often contains the full number like 16,476
    let followersText = followersTitle || text(li[1] ? li[1].querySelector('span span, span') : null);
    const followers = {
        text: followersText,
        value: parseCompactNumber(followersText)
    };

    // following
    const followingText = text(li[2] ? li[2].querySelector('span span, span') : null);
    const following = {
        text: followingText,
        value: parseCompactNumber(followingText)
    };

    // =========================
    // [3] Name / Category / Bio / Links (About)
    // =========================
    const s3 = sec(3);

    const s3Wrap = s3 ? s3.firstElementChild : null; // wrapper div inside section
    const s3Els = s3Wrap ? Array.from(s3Wrap.children) : [];

    // Expectation based on stable order:
    // [0] Full name container (div with span/h1/h2)
    // [1] (optional/empty) spacer div
    // [2] Category container (div)
    // [3] Bio container (span with multiline text + links)
    // [4] (optional) link button element
    // [5] Mutual followers anchor (a)

    // Full Name
    const fullName = text(s3Els[0] ? (s3Els[0].querySelector('span, h1, h2') || s3Els[0]) : null);

    // Category (index-based; fall back to empty string if missing)
    const category = text(s3Els[2] || null);

    // Bio (index-based; grab the text from the 4th child if present)
    const bioEl = s3Els[3] || null;
    const bio = text(bioEl);

    // Links in bio (index-based; only look inside the bio element)
    const links = bioEl ? Array.from(bioEl.querySelectorAll('a')).map((a) => ({
        text: text(a),
        url: absoluteUrl(a.getAttribute('href'))
    })) : [];

    // Mutual followers blurb (index-based; prefer the 6th child if it's an <a>)
    let mutualsText = '';
    if (s3Els[5] && s3Els[5].tagName === 'A') {
        mutualsText = text(s3Els[5]);
    } else if (s3Wrap) {
        // Fallback (still avoids Array.find on NodeList items; single query is fine if index not present)
        const mEl = s3Wrap.querySelector(':scope > a');
        mutualsText = text(mEl);
    }
    return {
        sectionsCount: sections.length,
        headerIndexed: true,
        about: {
            username,
            fullName,
            profilePic,
            category,
            bio,
            links,
            mutualsText,
            actions: {
                hasFollowButton,
                hasMessageButton
            }
        },
        stats: {
            posts,
            followers,
            following
        }
    };
}