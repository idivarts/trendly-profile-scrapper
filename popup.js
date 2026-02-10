// --- DOM references ---
const statusEl = document.getElementById('ig-status');
const usernameSection = document.getElementById('ig-username-section');
const usernameEl = document.getElementById('ig-username');
const formSec = document.getElementById('enrich-form');
const confirmView = document.getElementById('confirm-view');
const nicheGroup = document.getElementById('niche-group');
const starGroup = document.getElementById('star-group');
const btnScrape = document.getElementById('btn-scrape');
const btnConfirm = document.getElementById('btn-confirm');
const btnEdit = document.getElementById('btn-edit');

// --- State ---

/** @typedef {Object} ScrapedProfile
 * @property {string} username
 * @property {Object} manual
 * @property {string[]} manual.niches
 * @property {number} manual.aestheticsScore
 */

/** @type {ScrapedProfile|null} */
let lastData = null;
let selectedStars = 0;

// --- Helpers ---

function esc(s) {
    return String(s || '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function normalizeScrapedProfile(raw) {
    const manual = (raw && typeof raw.manual === 'object') ? raw.manual : {};
    return {
        username: (raw && typeof raw.username === 'string') ? raw.username.trim() : 'unknown',
        manual: {
            niches: Array.isArray(manual.niches) ? manual.niches : [],
            aestheticsScore: (typeof manual.aestheticsScore === 'number')
                ? Math.max(0, Math.min(5, manual.aestheticsScore)) : 0
        }
    };
}

function setStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.className = 'status-msg' + (type ? ' ' + type : '');
}

// --- Star rating ---

function renderStars() {
    starGroup.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'star' + (i <= selectedStars ? ' active' : '');
        btn.textContent = i <= selectedStars ? '\u2605' : '\u2606';
        btn.setAttribute('aria-label', i + ' star' + (i > 1 ? 's' : ''));
        btn.addEventListener('click', () => {
            // Toggle off if re-pressing the same star
            selectedStars = (selectedStars === i) ? 0 : i;
            renderStars();
        });
        starGroup.appendChild(btn);
    }
}

// --- API calls (kept from original) ---

callToCheck = async () => {
    const data = await fetch(`https://be.trendly.now${IS_DEV ? "/dev" : ""}/discovery/extension/instagram?username=` + encodeURIComponent(lastData.username), {
        method: "GET",
        headers: {
            "X-USER-ID": LeadAccountID,
        },
    }).then(res => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        return res.json();
    });
    return data;
};

callToUpdate = async () => {
    const data = await fetch(`https://be.trendly.now${IS_DEV ? "/dev" : ""}/discovery/extension/instagram`, {
        method: "POST",
        headers: {
            "X-USER-ID": LeadAccountID,
            "content-type": "application/json"
        },
        body: JSON.stringify({
            socialType: "instagram",
            ...lastData
        })
    }).then(res => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        return res.json();
    });
    return data;
};

// --- Show enrichment form ---

function showForm() {
    // Populate niche checkboxes
    nicheGroup.innerHTML = NICHES.map(n => `
        <label class="opt">
            <input type="checkbox" name="niche" value="${esc(n)}"> <span>${esc(n)}</span>
        </label>
    `).join('\n');

    // Render star rating
    selectedStars = 0;
    renderStars();

    formSec.style.display = 'block';
    confirmView.style.display = 'none';
}

// --- Show confirmation view ---

function showConfirmation() {
    const niches = Array.from(document.querySelectorAll('input[name="niche"]:checked'))
        .map(el => /** @type {HTMLInputElement} */(el).value);

    // Build lastData
    lastData = normalizeScrapedProfile({
        username: lastData.username,
        manual: { niches, aestheticsScore: selectedStars }
    });

    // Render stars text
    const starsText = selectedStars > 0
        ? '\u2605'.repeat(selectedStars) + '\u2606'.repeat(5 - selectedStars)
        : 'None';
    document.getElementById('confirm-stars').textContent = starsText;

    // Render niche chips
    const nichesContainer = document.getElementById('confirm-niches');
    nichesContainer.innerHTML = '';
    if (niches.length === 0) {
        const span = document.createElement('span');
        span.className = 'chip';
        span.textContent = 'No niches selected';
        nichesContainer.appendChild(span);
    } else {
        niches.forEach(n => {
            const span = document.createElement('span');
            span.className = 'chip';
            span.textContent = n;
            nichesContainer.appendChild(span);
        });
    }

    formSec.style.display = 'none';
    confirmView.style.display = 'block';
}

// --- Button handlers ---

btnScrape.addEventListener('click', () => {
    showConfirmation();
});

btnEdit.addEventListener('click', () => {
    // Re-show form without resetting selections (they persist in the DOM)
    formSec.style.display = 'block';
    confirmView.style.display = 'none';
});

btnConfirm.addEventListener('click', async () => {
    btnConfirm.disabled = true;
    btnConfirm.textContent = 'Submitting...';
    btnEdit.disabled = true;

    try {
        const data = await callToUpdate();
        confirmView.style.display = 'none';
        setStatus('Submitted successfully! Move to the next profile.', 'success');
        lastData = null;
    } catch (e) {
        setStatus('Error: ' + e.message, 'error');
        btnConfirm.disabled = false;
        btnEdit.disabled = false;
    } finally {
        btnConfirm.textContent = 'Confirm & Submit';
    }
});

// --- Extract username from a URL ---

function extractUsername(url) {
    const match = url?.match(/^https:\/\/www\.instagram\.com\/([^/]+)/);
    const username = match ? match[1] : null;
    if (!username || ['reels', 'explore', 'direct', 'accounts', 'stories', 'p'].includes(username)) {
        return null;
    }
    return username;
}

// --- Core profile flow (reusable) ---

async function runProfileFlow(username) {
    // Reset UI
    formSec.style.display = 'none';
    confirmView.style.display = 'none';
    btnConfirm.disabled = false;
    btnConfirm.textContent = 'Confirm & Submit';
    btnEdit.disabled = false;

    lastData = normalizeScrapedProfile({ username });
    usernameEl.textContent = '@' + lastData.username;
    usernameSection.style.display = 'block';
    setStatus('Checking if profile exists...');

    try {
        const checkResult = await callToCheck();

        if (checkResult.exists) {
            setStatus('This profile already exists on the server. Try another profile.', 'error');
            return;
        }

        setStatus('New profile detected. Fill in the details and click Scrape.');
        showForm();
    } catch (err) {
        console.error(err);
        setStatus('Error: ' + err.message, 'error');
    }
}

// --- Auto-init on popup open ---

(async function init() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const username = extractUsername(tab?.url);

        if (!username) {
            setStatus('Open an Instagram profile page and reopen this extension.', 'error');
            return;
        }

        await runProfileFlow(username);

        // Listen for URL changes in the active tab
        chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
            if (tabId !== tab.id || !changeInfo.url) return;

            const newUsername = extractUsername(changeInfo.url);
            const currentUsername = lastData?.username;

            if (!newUsername) {
                formSec.style.display = 'none';
                confirmView.style.display = 'none';
                usernameSection.style.display = 'none';
                setStatus('Open an Instagram profile page.', 'error');
                return;
            }

            if (newUsername !== currentUsername) {
                await runProfileFlow(newUsername);
            }
        });

    } catch (err) {
        console.error(err);
        setStatus('Error: ' + err.message, 'error');
    }
})();
