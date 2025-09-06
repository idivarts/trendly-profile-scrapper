(async function initTabs() {
    const igTab = document.getElementById('tab-ig');
    const modashTab = document.getElementById('tab-modash');
    const igPanel = document.getElementById('panel-ig');
    const modashPanel = document.getElementById('panel-modash');

    console.log("Tabs:", { igTab, modashTab, igPanel, modashPanel });

    if (!igTab || !modashTab || !igPanel || !modashPanel) return;

    function select(which) {
        const isIG = which === 'ig';
        igTab.setAttribute('aria-selected', String(isIG));
        modashTab.setAttribute('aria-selected', String(!isIG));

        igPanel.style.display = isIG ? '' : 'none';
        modashPanel.style.display = isIG ? 'none' : '';
    }

    igTab.addEventListener('click', () => select('ig'));
    modashTab.addEventListener('click', () => select('modash'));

    // Optional: support arrow keys navigation
    function onKey(e) {
        if (e.key === 'ArrowRight') { modashTab.focus(); select('modash'); }
        if (e.key === 'ArrowLeft') { igTab.focus(); select('ig'); }
    }
    igTab.addEventListener('keydown', onKey);
    modashTab.addEventListener('keydown', onKey);

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url.includes("marketer.modash.io")) {
        select('ig');
    } else {
        select('modash');
    }
})();