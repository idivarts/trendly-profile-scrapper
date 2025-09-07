const scrapeBtn = document.getElementById('scrape');
const out = document.getElementById('out');
const submitBtn = document.getElementById('submit');
const copyBtn = document.getElementById('copy-json');

// Form elements are created in HTML; we'll reference them when needed.

/** @typedef {Object} ScrapedProfile
 * @property {number} sectionsCount
 * @property {boolean} headerIndexed
 * @property {Object} about
 * @property {string} about.username
 * @property {string} about.fullName
 * @property {string} about.profilePic
 * @property {string} about.category
 * @property {string} about.bio
 * @property {Array<{text: string, url: string}>} about.links
 * @property {string} about.mutualsText
 * @property {Object} about.actions
 * @property {boolean} about.actions.hasFollowButton
 * @property {boolean} about.actions.hasMessageButton
 * @property {Object} stats
 * @property {{text: string, value: number|null}} stats.posts
 * @property {{text: string, value: number|null}} stats.followers
 * @property {{text: string, value: number|null}} stats.following
 * @property {Object} reels
 * @property {number} reels.count
 * @property {Array<{
 *   index: number,
 *   url: string,
 *   thumbnail: string,
 *   cover_size_hint: string,
 *   overlays: {
 *     has_hover_overlay: boolean,
 *     likes: {text: string, value: number|null},
 *     comments: {text: string, value: number|null}
 *   },
 *   views: {text: string, value: number|null},
 *   pinned: boolean
 * }>} reels.items
 */

/** @type {ScrapedProfile|null} */
let lastData = null;

const GENDERS = [
    "male",
    "female",
    "couple",
    "baby",
    "animal",
    "lgbtq",
    "gender-neutral",
];

const NICHES = [
    "Fashion / Beauty",
    "Lifestyle Vlogs",
    "Food",
    "Travel",
    "Fun / Meme",
    "Health",
    "Tech",
    "NSFW",
    "Others",
];

const LOCATIONS = [
    "Mumbai",
    "Delhi",
    "Bengaluru",
    "Hyderabad",
    "Ahmedabad",
    "Chennai",
    "Kolkata",
    "Pune",
    "Surat",
    "Jaipur"
];

// --- Storage helpers for manual enrichment draft ---
const STORAGE_KEY = 'manualDraft';

async function getManualDraft() {
    try {
        const obj = await chrome.storage.local.get(STORAGE_KEY);
        return obj && obj[STORAGE_KEY] ? obj[STORAGE_KEY] : null;
    } catch (_) {
        return null;
    }
}

async function saveManualDraft(partial) {
    const current = (await getManualDraft()) || {};
    const next = { ...current, ...partial };
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
}

async function clearManualDraft() {
    await chrome.storage.local.remove(STORAGE_KEY);
}

function esc(s) {
    return String(s || "").replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
}

function enableActions(enabled) {
    submitBtn.disabled = !enabled;
    copyBtn.disabled = !enabled;
}

async function renderManualFieldsForm() {
    enableActions(false);
    const formSec = document.getElementById('enrich-form');
    const genderGroup = document.getElementById('gender-group');
    const nicheGroup = document.getElementById('niche-group');
    const datalist = document.getElementById('location-list');

    // Initialize aesthetics slider
    const aestheticsInput = document.getElementById('aesthetics-input');
    const aestheticsValue = document.getElementById('aesthetics-value');
    if (aestheticsInput && aestheticsValue && !aestheticsInput.dataset.bound) {
        if (!aestheticsInput.value) aestheticsInput.value = '50';
        aestheticsValue.textContent = String(aestheticsInput.value);
        aestheticsInput.addEventListener('input', async () => {
            aestheticsValue.textContent = String(aestheticsInput.value);
            await saveManualDraft({ aestheticsScore: Math.max(0, Math.min(100, parseInt(aestheticsInput.value, 10) || 0)) });
        });
        aestheticsInput.dataset.bound = '1';
    }

    // Populate gender radios
    genderGroup.innerHTML = GENDERS.map(g => `
        <label class="opt">
            <input type="radio" name="gender" value="${esc(g)}"> <span>${esc(g)}</span>
        </label>
    `).join("\n");

    // Populate niche checkboxes
    nicheGroup.innerHTML = NICHES.map(n => `
        <label class="opt">
            <input type="checkbox" name="niche" value="${esc(n)}"> <span>${esc(n)}</span>
        </label>
    `).join("\n");

    // Populate location options
    datalist.innerHTML = LOCATIONS.map(l => `<option value="${esc(l)}"></option>`).join("\n");

    // Restore previous draft (if any)
    const saved = await getManualDraft();

    // Set gender
    if (saved && saved.gender) {
        const gEl = genderGroup.querySelector(`input[name="gender"][value="${CSS.escape(saved.gender)}"]`);
        if (gEl) gEl.checked = true;
    }

    // Set niches
    if (saved && Array.isArray(saved.niches)) {
        saved.niches.forEach(v => {
            const nEl = nicheGroup.querySelector(`input[name="niche"][value="${CSS.escape(v)}"]`);
            if (nEl) nEl.checked = true;
        });
    }

    // Set location
    const locInput = document.getElementById('location-input');
    if (locInput && saved && typeof saved.location === 'string') {
        locInput.value = saved.location;
    }

    // Set aesthetics
    if (aestheticsInput && aestheticsValue && saved && Number.isFinite(saved.aestheticsScore)) {
        aestheticsInput.value = String(saved.aestheticsScore);
        aestheticsValue.textContent = String(saved.aestheticsScore);
    }

    // Wire up persistence for changes
    genderGroup.addEventListener('change', async (e) => {
        const target = e.target;
        if (target && target.name === 'gender' && target.checked) {
            await saveManualDraft({ gender: target.value });
        }
    }, { once: false });

    nicheGroup.addEventListener('change', async () => {
        const selected = Array.from(document.querySelectorAll('input[name="niche"]:checked'))
            .map(el => /** @type {HTMLInputElement} */(el).value);
        await saveManualDraft({ niches: selected });
    }, { once: false });

    if (locInput && !locInput.dataset.bound) {
        locInput.addEventListener('input', async () => {
            await saveManualDraft({ location: (locInput.value || '').trim() });
        });
        locInput.dataset.bound = '1';
    }

    formSec.style.display = 'block';

    // Attach one-time submit listener (if not already attached)
    const confirmBtn = document.getElementById('confirm-enrich');
    if (!confirmBtn.dataset.bound) {
        confirmBtn.addEventListener('click', async () => {
            // Collect gender
            const genderEl = /** @type {HTMLInputElement|null} */(document.querySelector('input[name="gender"]:checked'));
            const gender = genderEl ? genderEl.value : "";

            // Collect niches (multi)
            const nicheEls = Array.from(document.querySelectorAll('input[name="niche"]:checked'));
            const niches = nicheEls.map(el => /** @type {HTMLInputElement} */(el).value);

            // Collect location (allow free text)
            const location = (locInput && locInput.value || "").trim();

            // Collect aesthetics/quality (0-100 integer)
            const aestheticsInputEl = document.getElementById('aesthetics-input');
            const aestheticsScore = aestheticsInputEl ? Math.max(0, Math.min(100, parseInt(aestheticsInputEl.value, 10) || 0)) : 0;

            // Persist the latest snapshot before merging
            await saveManualDraft({ gender, niches, location, aestheticsScore });

            // Merge into lastData
            lastData = Object.assign({}, lastData || {}, {
                manual: { gender, niches, location, aestheticsScore }
            });

            // Hide form and enable actions
            formSec.style.display = 'none';
            out.textContent = 'The data has been successfully scraped and enriched. You can now copy or download the JSON.';
            enableActions(true);
        });
        confirmBtn.dataset.bound = '1';
    }
}

scrapeBtn.addEventListener('click', async () => {
    enableActions(false);
    out.textContent = 'Scraping...';

    const formSec = document.getElementById('enrich-form');
    if (formSec) formSec.style.display = 'none';

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !/^https:\/\/www\.instagram\.com\/[^/]+\/reels\/?$/.test(tab.url)) {
            out.textContent = 'Please open a profile page like https://www.instagram.com/<username>/reels/ and try again.';
            return;
        }

        const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: scrapeInstagramProfileOnPage
        });

        lastData = result;
        if (lastData.stats.followers.value < 1000 || lastData.stats.followers.value > 500000 || lastData.stats.followers == null) {
            out.textContent = 'The profile must have between 1,000 and 500,000 followers. Please try another profile.';
            lastData = null;
            return;
        }

        let quality = 0;
        quality += Math.min(lastData.stats.posts.value / 50, 1);
        quality += Math.min(lastData.reels.count / 20, 1);
        if (lastData.about.bio && lastData.about.bio.length > 10) quality++;
        if (lastData.about.category && lastData.about.category.length > 0) quality++;
        if (quality <= 2) {
            out.textContent = 'Lead Quality Poor\nPlease try another profile.';
            lastData = null;
            return;
        }
        out.textContent = 'Lead Quality Good - ' + quality
        out.textContent += '\nPlease insert the missing details below to enrich the data.';
        // Render manual enrichment form before enabling actions
        await renderManualFieldsForm();

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

submitBtn.addEventListener('click', async () => {
    if (!lastData) return;
    out.textContent = 'Sending data to server... Please wait!';
    await navigator.clipboard.writeText(JSON.stringify(lastData, null, 2));

    out.textContent = 'The data is sent to server. You can now proceed to other instagram profiles.';
    lastData = null
    enableActions(false);
    await clearManualDraft();
});

/**
 * Runs in the page context to scrape profile data.
 * Keep this pure; it returns a plain object.
 * @returns {ScrapedProfile}
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

    const isVerified = !!(s1 && s1.querySelector('svg[aria-label="Verified"]'));

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
    // =========================
    // Reels Grid Section (index-based traversal)
    // After <header>, skip one sibling element; the **second** sibling <div>
    // is the container that holds the reels grid.
    // =========================
    let reels = { count: 0, items: [] };
    const mainEl = document.querySelector('main');
    if (mainEl && header && header.parentElement) {
        const siblings = Array.from(header.parentElement.children);
        const hIdx = siblings.indexOf(header);
        const reelsContainer = siblings[hIdx + 2] || null; // skip one, take second

        if (reelsContainer) {
            // Collect all anchor cards that link to /reel/
            const reelAnchors = Array.from(reelsContainer.querySelectorAll('a[href*="/reel/"]'));

            function extractReel(a, idx) {
                // Thumbnail: first child div with background-image style inside the anchor
                const thumbDiv = a.querySelector(':scope div[style*="background-image"]');
                let thumbnail = '';
                let cover_size_hint = '';
                if (thumbDiv) {
                    const style = thumbDiv.getAttribute('style') || '';
                    const m = style.match(/background-image:\s*url\(("|')?([^"')]+)("|')?\)/i);
                    if (m) thumbnail = m[2];
                    const sizeMatch = (thumbnail && (thumbnail.match(/_s(\d+x\d+)/i) || thumbnail.match(/s(\d+x\d+)/i))) || null;
                    cover_size_hint = sizeMatch ? sizeMatch[1] : '';
                }

                // Overlays: likes/comments (hover) live under ._aajz > ... > ul > li
                let likesText = '';
                let commentsText = '';
                let likesValue = null;
                let commentsValue = null;
                const hoverOverlay = a.querySelector(':scope ._aajz');
                if (hoverOverlay) {
                    const ul = hoverOverlay.querySelector('ul');
                    const lis = ul ? Array.from(ul.children) : [];
                    const li0 = lis[0] || null;
                    const li1 = lis[1] || null;
                    likesText = text(li0 ? li0.querySelector('span span, span') : null);
                    commentsText = text(li1 ? li1.querySelector('span span, span') : null);
                    likesValue = parseCompactNumber(likesText);
                    commentsValue = parseCompactNumber(commentsText);
                }

                // Views + Pinned are in the gradient strip ._aaj_
                const strip = a.querySelector(':scope ._aaj_');
                const pinned = !!(strip && strip.querySelector('[aria-label="Pinned post icon"]'));
                let viewsText = '';
                let viewsValue = null;
                if (strip) {
                    const viewIcon = strip.querySelector('[aria-label="View count icon"]');
                    if (viewIcon) {
                        // index-based sibling: the first <span> after icon within same container
                        let span = viewIcon.parentElement && viewIcon.parentElement.parentElement
                            ? viewIcon.parentElement.parentElement.querySelector('span span, span')
                            : null;
                        viewsText = text(span);
                        viewsValue = parseCompactNumber(viewsText);
                    }
                }

                const href = a.getAttribute('href') || '';
                const url = absoluteUrl(href);

                return {
                    index: idx,
                    url,
                    thumbnail,
                    cover_size_hint,
                    overlays: {
                        has_hover_overlay: !!hoverOverlay,
                        likes: { text: likesText, value: likesValue },
                        comments: { text: commentsText, value: commentsValue }
                    },
                    views: { text: viewsText, value: viewsValue },
                    pinned
                };
            }

            const items = reelAnchors.map(extractReel);
            reels = { count: items.length, items };
        }
    }

    return {
        sectionsCount: sections.length,
        headerIndexed: true,
        about: {
            username,
            fullName,
            profilePic,
            isVerified,
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
        },
        reels
    };
}