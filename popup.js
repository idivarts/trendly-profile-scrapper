const scrapeBtn = document.getElementById('scrape');
const out = document.getElementById('out');
const submitBtn = document.getElementById('submit');
const copyBtn = document.getElementById('copy-json');

// Form elements are created in HTML; we'll reference them when needed.

/** @typedef {Object} ScrapedProfile
 * @property {string} username
 * @property {Object} manual
 * @property {string} manual.gender
 * @property {string[]} manual.niches
 * @property {string} manual.location
 * @property {number} manual.aestheticsScore
 */

/** @type {ScrapedProfile|null} */
let lastData = null;
let dataExists = false

function defaultScrapedProfile() {
    return {
        username: 'unknown',
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
 * @param {any} raw
 * @returns {ScrapedProfile}
 */
function normalizeScrapedProfile(raw) {
    const manual = (raw && typeof raw.manual === 'object') ? raw.manual : {};
    return {
        username: (raw && typeof raw.username === 'string') ? raw.username.trim() : 'unknown',
        manual: {
            gender: (typeof manual.gender === 'string') ? manual.gender : 'unknown',
            niches: Array.isArray(manual.niches) ? manual.niches : [],
            location: (typeof manual.location === 'string') ? manual.location : 'unknown',
            aestheticsScore: (typeof manual.aestheticsScore === 'number') ? Math.max(0, Math.min(100, manual.aestheticsScore)) : 0
        }
    };
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

/**
 * Render the profile summary panel using normalized data.
 * @param {ScrapedProfile} data
 */
function renderSummary(data) {
    const d = normalizeScrapedProfile(data);

    const elUser = document.getElementById('sum-username');
    const elGender = document.getElementById('sum-gender');
    const elLocation = document.getElementById('sum-location');
    const elAesthetics = document.getElementById('sum-aesthetics');
    const elNiches = document.getElementById('sum-niches');

    // Top info
    if (elUser) elUser.textContent = d.username ? '@' + d.username : 'unknown';

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
    out.textContent = 'Extracting username...';
    lastData = {}

    const formSec = document.getElementById('enrich-form');
    if (formSec) formSec.style.display = 'none';
    const summarySec = document.getElementById('summary');
    if (summarySec) summarySec.style.display = 'none';

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // Extract username from URL: instagram.com/username/ or instagram.com/username/reels/ etc.
        const match = tab?.url?.match(/^https:\/\/www\.instagram\.com\/([^/]+)/);
        const username = match ? match[1] : null;

        if (!username || ['reels', 'explore', 'direct', 'accounts'].includes(username)) {
            out.textContent = 'Please open an Instagram profile page and try again.';
            enableActions(false);
            return;
        }

        lastData = normalizeScrapedProfile({ username });
        out.textContent = 'Profile identified: @' + lastData.username;
        out.textContent += '\nPlease insert the details below to enrich the data.';

        // Render manual enrichment form
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
            renderSummary(lastData);
            copyBtn.disabled = false;
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
    const data = await fetch('https://be.trendly.now/discovery/extension?username=' + encodeURIComponent(lastData.username), {
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