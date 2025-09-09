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
 * @property {Object} manual
 * @property {string} manual.gender
 * @property {string[]} manual.niches
 * @property {string} manual.location
 * @property {number} manual.aestheticsScore
 */

/** @type {ScrapedProfile|null} */
let lastData = null;
let dataExists = false

// -------- Strict type guards, parsers, and normalizers (no empty/undefined) --------
// Nothing should be null/undefined/empty string coming out of normalization.
// Use explicit, human-readable fallbacks for strings; numeric fallbacks are 0; arrays default to [].

/** @template T */
function isObject(x) { return !!x && typeof x === 'object'; }
function asString(x, fallback = 'unknown') {
    if (typeof x === 'string') {
        const s = x.trim();
        return s.length ? s : fallback;
    }
    if (x == null) return fallback;
    try {
        const s = String(x).trim();
        return s.length ? s : fallback;
    } catch (_) { return fallback; }
}
function asBoolean(x, fallback = false) {
    if (typeof x === 'boolean') return x;
    if (typeof x === 'string') {
        const s = x.trim().toLowerCase();
        if (['true', '1', 'yes', 'y', 'on'].includes(s)) return true;
        if (['false', '0', 'no', 'n', 'off'].includes(s)) return false;
    }
    if (typeof x === 'number') return x !== 0;
    return fallback;
}
function parseCompactNumberSafe(s) {
    const str = asString(s, '0').replace(/[\s,]/g, '').toLowerCase();
    const m = str.match(/^(\d+(?:\.\d+)?)([kmb])?$/);
    if (m) {
        const num = parseFloat(m[1]);
        const suf = m[2];
        const mult = suf === 'k' ? 1e3 : suf === 'm' ? 1e6 : suf === 'b' ? 1e9 : 1;
        if (Number.isFinite(num)) return Math.round(num * mult);
    }
    const n = parseFloat(str);
    return Number.isFinite(n) ? n : 0;
}
function asNumber(x, fallback = 0) {
    if (typeof x === 'number' && Number.isFinite(x)) return x;
    if (typeof x === 'string') return parseCompactNumberSafe(x);
    return fallback;
}
function asUrl(x, fallback = '#') {
    const s = asString(x, '');
    if (!s) return fallback;
    try { return new URL(s, 'https://www.instagram.com').toString(); } catch (_) { return fallback; }
}
function normalizeCountPair(pair) {
    const text = asString(pair && pair.text, '0');
    const value = asNumber(pair && pair.value);
    return { text, value };
}

function normalizeReelItem(it, idx) {
    return {
        index: asNumber(isObject(it) && it.index, idx),
        url: asUrl(isObject(it) && it.url, '#'),
        thumbnail: asUrl(isObject(it) && it.thumbnail, '#'),
        cover_size_hint: asString(isObject(it) && it.cover_size_hint, 'unknown'),
        overlays: {
            has_hover_overlay: asBoolean(isObject(it) && isObject(it.overlays) && it.overlays.has_hover_overlay, false),
            likes: normalizeCountPair(isObject(it) && isObject(it.overlays) ? it.overlays.likes : { text: '0', value: 0 }),
            comments: normalizeCountPair(isObject(it) && isObject(it.overlays) ? it.overlays.comments : { text: '0', value: 0 }),
        },
        views: normalizeCountPair(isObject(it) ? it.views : { text: '0', value: 0 }),
        pinned: asBoolean(isObject(it) && it.pinned, false),
    };
}

function defaultScrapedProfile() {
    return {
        sectionsCount: 0,
        headerIndexed: false,
        about: {
            username: 'unknown',
            fullName: 'unknown',
            profilePic: '#',
            isVerified: false,
            category: 'unknown',
            bio: 'unknown',
            links: [],
            mutualsText: 'unknown',
            actions: { hasFollowButton: false, hasMessageButton: false }
        },
        stats: {
            posts: { text: '0', value: 0 },
            followers: { text: '0', value: 0 },
            following: { text: '0', value: 0 }
        },
        reels: { count: 0, items: [] }
        ,
        manual: {
            gender: 'unknown',
            niches: [],
            location: 'unknown',
            aestheticsScore: 0
        }
    };
}

/**
 * Best-effort normalization of unknown input into a fully-populated ScrapedProfile.
 * No field is left empty/undefined; strings become non-empty, numbers finite, arrays present.
 * @param {any} raw
 * @returns {ScrapedProfile}
 */
function clampIntRange(x, min, max, fallback = 0) {
    const n = asNumber(x, fallback);
    const i = Math.round(n);
    return Math.max(min, Math.min(max, i));
}

function normalizeScrapedProfile(raw) {
    const base = defaultScrapedProfile();
    const about = isObject(raw) && isObject(raw.about) ? raw.about : {};
    const stats = isObject(raw) && isObject(raw.stats) ? raw.stats : {};
    const reels = isObject(raw) && isObject(raw.reels) ? raw.reels : {};
    const manual = isObject(raw) && isObject(raw.manual) ? raw.manual : {};

    const links = Array.isArray(about.links) ? about.links.map(l => ({
        text: asString(l && l.text, 'unknown'),
        url: asUrl(l && l.url, '#')
    })) : [];

    const items = Array.isArray(reels.items) ? reels.items.map((it, i) => normalizeReelItem(it, i)) : [];

    const normalized = {
        sectionsCount: asNumber(isObject(raw) && raw.sectionsCount, 0),
        headerIndexed: asBoolean(isObject(raw) && raw.headerIndexed, false),
        about: {
            username: asString(about.username, 'unknown'),
            fullName: asString(about.fullName, 'unknown'),
            profilePic: asUrl(about.profilePic, '#'),
            isVerified: asBoolean(about.isVerified, false),
            category: asString(about.category, 'unknown'),
            bio: asString(about.bio, 'unknown'),
            links,
            mutualsText: asString(about.mutualsText, 'unknown'),
            actions: {
                hasFollowButton: asBoolean(about.actions && about.actions.hasFollowButton, false),
                hasMessageButton: asBoolean(about.actions && about.actions.hasMessageButton, false)
            }
        },
        stats: {
            posts: normalizeCountPair(stats.posts || { text: '0', value: 0 }),
            followers: normalizeCountPair(stats.followers || { text: '0', value: 0 }),
            following: normalizeCountPair(stats.following || { text: '0', value: 0 })
        },
        reels: {
            count: asNumber(reels.count || items.length, items.length),
            items
        },
        manual: {
            gender: asString(manual.gender, 'unknown'),
            niches: Array.isArray(manual.niches) ? manual.niches.map(v => asString(v, 'unknown')) : [],
            location: asString(manual.location, 'unknown'),
            aestheticsScore: clampIntRange(manual.aestheticsScore, 0, 100, 0)
        }
    };

    return normalized;
}

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

function toReadableInt(n) {
    return Number.isFinite(n) ? Math.round(n).toLocaleString() : '0';
}

function averageOf(arr) {
    const nums = arr.filter(v => typeof v === 'number' && Number.isFinite(v));
    if (nums.length === 0) return 0;
    return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function medianOf(arr) {
    const nums = arr.filter(v => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
    if (nums.length === 0) return 0;
    const mid = Math.floor(nums.length / 2);
    return nums.length % 2 !== 0 ? nums[mid] : Math.round((nums[mid - 1] + nums[mid]) / 2);
}

/**
 * Render the profile summary panel using normalized data.
 * @param {ScrapedProfile} data
 */
function renderSummary(data) {
    const d = normalizeScrapedProfile(data);

    const avatar = document.getElementById('sum-avatar');
    const elFull = document.getElementById('sum-fullName');
    const elUser = document.getElementById('sum-username');
    const elCat = document.getElementById('sum-category');
    const elBio = document.getElementById('sum-bio');

    const elPosts = document.getElementById('sum-posts');
    const elFollowers = document.getElementById('sum-followers');
    const elFollowing = document.getElementById('sum-following');
    const elReels = document.getElementById('sum-reels');

    const elAvgViews = document.getElementById('sum-avgviews');
    const elAvgLikes = document.getElementById('sum-avglikes');
    const elAvgComments = document.getElementById('sum-avgcomments');

    const elGender = document.getElementById('sum-gender');
    const elLocation = document.getElementById('sum-location');
    const elAesthetics = document.getElementById('sum-aesthetics');
    const elNiches = document.getElementById('sum-niches');

    // Top info
    if (avatar) avatar.src = d.about.profilePic || '';
    if (elFull) elFull.textContent = d.about.fullName || 'unknown';
    if (elUser) elUser.textContent = d.about.username ? '@' + d.about.username : 'unknown';
    if (elCat) elCat.textContent = d.about.category || 'unknown';
    if (elBio) elBio.textContent = d.about.bio || 'unknown';

    // Base stats
    if (elPosts) elPosts.textContent = toReadableInt(d.stats.posts.value);
    if (elFollowers) elFollowers.textContent = toReadableInt(d.stats.followers.value);
    if (elFollowing) elFollowing.textContent = toReadableInt(d.stats.following.value);
    if (elReels) elReels.textContent = toReadableInt(d.reels.count);

    // Averages (ignore null/NaN)
    const items = Array.isArray(d.reels.items) ? d.reels.items : [];
    const views = items.map(it => (it && it.views && typeof it.views.value === 'number') ? it.views.value : NaN);
    const likes = items.map(it => (it && it.overlays && it.overlays.likes && typeof it.overlays.likes.value === 'number') ? it.overlays.likes.value : NaN);
    const comments = items.map(it => (it && it.overlays && it.overlays.comments && typeof it.overlays.comments.value === 'number') ? it.overlays.comments.value : NaN);

    if (elAvgViews) elAvgViews.textContent = toReadableInt(medianOf(views));
    if (elAvgLikes) elAvgLikes.textContent = toReadableInt(medianOf(likes));
    if (elAvgComments) elAvgComments.textContent = toReadableInt(medianOf(comments));

    // Manual fields
    if (elGender) elGender.textContent = d.manual.gender || 'unknown';
    if (elLocation) elLocation.textContent = d.manual.location || 'unknown';
    if (elAesthetics) elAesthetics.textContent = String(d.manual.aestheticsScore ?? 0);

    if (elNiches) {
        elNiches.innerHTML = '';
        const niches = Array.isArray(d.manual.niches) ? d.manual.niches : [];
        if (niches.length === 0) {
            const span = document.createElement('span');
            span.className = 'chip';
            span.textContent = 'No niches selected';
            elNiches.appendChild(span);
        } else {
            niches.forEach(n => {
                const span = document.createElement('span');
                span.className = 'chip';
                span.textContent = n;
                elNiches.appendChild(span);
            });
        }
    }

    // Toggle visibility
    const formSec = document.getElementById('enrich-form');
    const summarySec = document.getElementById('summary');
    if (formSec) formSec.style.display = 'none';
    if (summarySec) summarySec.style.display = 'block';

    // Edit manual fields
    const editBtn = document.getElementById('edit-manual');
    if (editBtn && !editBtn.dataset.bound) {
        editBtn.addEventListener('click', async () => {
            if (summarySec) summarySec.style.display = 'none';
            await renderManualFieldsForm();
        });
        editBtn.dataset.bound = '1';
    }
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
            out.textContent = 'The data has been successfully scraped and enriched. You can now copy or submit the JSON.';
            enableActions(true);
            // Show summary of key metrics
            renderSummary(lastData);
        });
        confirmBtn.dataset.bound = '1';
    }
}

scrapeBtn.addEventListener('click', async () => {
    enableActions(false);
    out.textContent = 'Scraping...';
    lastData = {}

    const formSec = document.getElementById('enrich-form');
    if (formSec) formSec.style.display = 'none';
    const summarySec = document.getElementById('summary');
    if (summarySec) summarySec.style.display = 'none';

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

        lastData = normalizeScrapedProfile(result);
        if (lastData.stats.followers.value < 1000 || lastData.stats.followers.value > 500000) {
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

        const confirmBtn = document.getElementById('confirm-enrich');
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Checking Existing Account...';
        let data = await callToCheck();
        dataExists = data.exists
        if (dataExists) {
            enableActions(false);
            await clearManualDraft();
            out.textContent = 'Data for this profile already exists on the server. Please try another profile.';
            const formSec = document.getElementById('enrich-form');
            if (formSec) formSec.style.display = 'none';
            // scrapeBtn.disabled = true;
        } else {
            confirmBtn.textContent = 'Confirm & Prepare Data';
            confirmBtn.disabled = false;
        }

    } catch (err) {
        console.error(err);
        out.textContent = `Error: ${err.message}`;
    }
});

copyBtn.addEventListener('click', async () => {
    if (!lastData) return;
    lastData = normalizeScrapedProfile(lastData);
    await navigator.clipboard.writeText(JSON.stringify(lastData, null, 2));
    copyBtn.textContent = 'Copied';
    setTimeout(() => (copyBtn.textContent = 'Copy JSON'), 1200);
});

// username
callToCheck = async () => {
    const data = await fetch('https://be.trendly.now/discovery/extension?username=' + encodeURIComponent(lastData.about.username), {
        method: "GET",
        headers: {
            "X-USER-ID": LeadAccountID,
        },
    }).then(res => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        return res.json();
    })
    return data
}
callToUpdate = async () => {
    const data = await fetch('https://be.trendly.now/discovery/extension', {
        method: "POST",
        headers: {
            "X-USER-ID": LeadAccountID,
            "content-type": "application/json"
        },
        body: JSON.stringify(lastData)
    }).then(res => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        return res.json();
    })
    return data
}
submitBtn.addEventListener('click', async () => {
    if (!lastData) return;
    lastData = normalizeScrapedProfile(lastData);
    try {
        out.textContent = 'Sending data to server... Please wait!';
        submitBtn.textContent = 'Submiting...';
        submitBtn.disabled = true;
        await navigator.clipboard.writeText(JSON.stringify(lastData, null, 2));
        const data = await callToUpdate();
        out.textContent = 'The data is sent to server. You can now proceed to other instagram profiles.\n' + JSON.stringify(data);
        lastData = null
        enableActions(false);
        await clearManualDraft();

        const formSec = document.getElementById('enrich-form');
        const summarySec = document.getElementById('summary');
        if (formSec) formSec.style.display = 'none';
        if (summarySec) summarySec.style.display = 'none';
    } catch (e) {
        out.textContent = 'Error: ' + e.message;
        submitBtn.disabled = false;
    } finally {
        submitBtn.textContent = 'Submit Profile';
    }
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