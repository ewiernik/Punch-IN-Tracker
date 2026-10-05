// ==UserScript==
// @name         Cost Cut Tracking
// @namespace    http://tampermonkey.net/
// @version      7.1
// @description  CostLabortrack w/ autosite detect, shared settings, adoption log + single-view dropdown
// @author       varshxk & ewiernik
// @match        https://na.store-management.f3.amazon.dev/labortracking/drilldown*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      hooks.slack.com
// @connect      api.github.com
// @connect      gist.githubusercontent.com
// @updateURL    https://gist.github.com/ewiernik/Punch-IN-Tracker/raw/costcut-tracker.user.js
// @downloadURL  https://gist.github.com/ewiernik/Punch-IN-Tracker/raw/costcut-tracker.user.js
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // Sites in scope (Oct 2026 region list). Display names must match the HWMS dropdown exactly.
    const SITE_DISPLAY_MAP = {
        'New York - JFK2':                 'JFK2',
        'Orlando - UFL4':                  'UFL4',
        'Tampa - UFL5':                    'UFL5',
        'Miami - UFL6':                    'UFL6',
        'Atlanta - UGA2':                  'UGA2',
        'Duluth - UGA4':                   'UGA4',
        'Everett - UMA4':                  'UMA4',
        'Raleigh - UNC2':                  'UNC2',
        'Charlotte - UNC3':                'UNC3',
        'Avenel - UNJ2':                   'UNJ2',
        'New York - UNY2':                 'UNY2',
        'Bethpage - UNY4':                 'UNY4',
        'Brooklyn - UNY5':                 'UNY5',
        'Nashville - UTN1':                'UTN1',
        'Chicago - UIL2':                  'UIL2',
        'Indianapolis - UIN1':             'UIN1',
        'Baltimore - UMD1':                'UMD1',
        'Minneapolis - UMN1':              'UMN1',
        'Columbus - UOH4':                 'UOH4',
        'West Chester Township - UOH5':    'UOH5',
        'Philadelphia - UPA1':             'UPA1',
        'Springfield - UVA1':              'UVA1',
        'Richmond - UVA4':                 'UVA4',
        'Virginia Beach - UVA5':           'UVA5',
        'Milwaukee - UWI2':                'UWI2',
    };

    // Sites with no webhook yet: the Tool Manager adds one in Settings -> Site webhook override (no reinstall).
    const SITE_WEBHOOKS = {
        'JFK2': 'https://hooks.slack.com/triggers/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',
        'UFL4': 'https://hooks.slack.com/triggers/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',
        'UFL5': 'https://hooks.slack.com/triggers/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',
        'UFL6': 'https://hooks.slack.com/triggers/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',
        'UGA2': 'https://hooks.slack.com/triggers/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',
        'UGA4': 'https://hooks.slack.com/triggers/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',
        'UMA4': 'https://hooks.slack.com/triggers/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',
        'UNC2': 'https://hooks.slack.com/triggers/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',
        'UNC3': 'https://hooks.slack.com/triggers/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',
        'UNJ2': 'https://hooks.slack.com/triggers/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',
        'UNY2': 'https://hooks.slack.com/triggers/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',
        'UNY4': '',   // TODO: add via Settings -> Site webhook override
        'UNY5': 'https://hooks.slack.com/triggers/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',
        'UTN1': '',   // TODO: add via Settings -> Site webhook override
        'UIL2': 'https://hooks.slack.com/triggers/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',
        'UIN1': '',   // TODO: add via Settings -> Site webhook override
        'UMD1': 'https://hooks.slack.com/triggers/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',
        'UMN1': '',   // TODO: add via Settings -> Site webhook override
        'UOH4': '',   // TODO: add via Settings -> Site webhook override
        'UOH5': '',   // TODO: add via Settings -> Site webhook override
        'UPA1': 'https://hooks.slack.com/triggers/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',
        'UVA1': 'https://hooks.slack.com/triggers/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',
        'UVA4': '',   // TODO: add via Settings -> Site webhook override
        'UVA5': '',   // TODO: add via Settings -> Site webhook override
        'UWI2': '',   // TODO: add via Settings -> Site webhook override
    };

    // ── SHARED SETTINGS (GitHub Gist) ─────────────────────────────────
    // Each site has its own file in the Gist (site_UFL6.json, lastsend_UFL6.json).
    // Reads use the public raw URL: no token, no API rate limit, works for every manager.
    // Writes need the admin's PAT, which lives only in that admin's browser storage.
    // One file per site means two admins at different sites can never overwrite each other.
    var GIST_ID          = 'f5e54fead4ae10629d3f07c81cccee93';
    var GIST_USER        = 'varshkumar99';
    var GIST_PAT         = GM_getValue('lt_gist_pat', '');
    var ADMIN_PIN        = '5MiL3';
    var GIST_FILENAME    = 'costcut_config.json';   // legacy all-sites file (read-only fallback)
    var GIST_SYNC_MS     = 30 * 60 * 1000;
    var SCRIPT_VERSION   = '7.1';

    var SYNC_KEYS = [
        'breakShortMin','breakShortMax','breakVerifyMax',
        'bottomN','topN','showTopPerformers','showBottomPerformers','showOverallRate','showZoneRates','showAllClear',
        'minDurationHours','autoSendIntervalHours','autoSendEnabled','autoSendTimeRange',
        'trackBreaks','trackBreakShort','trackBreakVerify','trackBreakExtended',
        'trackIdle','idleMinThreshold','trackPunchIn','punchInMinThreshold',
        'trackAdmin','adminMinThreshold','trackDowntime','downtimeMinThreshold',
        'trackLogout','logoutMinThreshold','trackMyMetrics','myMetricsMinThreshold',
        'trackIndirectTask','indirectTaskMinThreshold','trackTraining','trainingMinThreshold',
        'trackUnpack','unpackMinThreshold','trackStart','startMinThreshold',
        'trackCRG','crgMinThreshold','rateThresholds'
    ];

    function hasPat() { return !!GM_getValue('lt_gist_pat', ''); }
    function siteFile(site) { return 'site_' + site + '.json'; }
    function lastSendFile(site) { return 'lastsend_' + site + '.json'; }

    // GET one Gist file through the raw CDN. Resolves null when the file doesn't exist yet.
    function gistReadFile(name) {
        return new Promise(function(resolve, reject) {
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://gist.githubusercontent.com/' + GIST_USER + '/' + GIST_ID + '/raw/' + name + '?t=' + Date.now(),
                timeout: 12000,
                onload: function(r) {
                    if (r.status === 404) { resolve(null); return; }
                    if (r.status < 200 || r.status >= 300) { reject(new Error('GitHub raw ' + r.status)); return; }
                    var t = (r.responseText || '').trim();
                    if (!t) { resolve(null); return; }
                    try { resolve(JSON.parse(t)); } catch(e) { reject(new Error('Bad JSON in ' + name)); }
                },
                onerror: function() { reject(new Error('Network error')); },
                ontimeout: function() { reject(new Error('Timeout')); }
            });
        });
    }

    // PATCH only the listed file. Other files in the Gist are left untouched.
    function gistWriteFile(name, obj) {
        return new Promise(function(resolve, reject) {
            var pat = GM_getValue('lt_gist_pat', '');
            if (!pat) { reject(new Error('No PAT on this computer')); return; }
            var body = { files: {} };
            body.files[name] = { content: JSON.stringify(obj, null, 2) };
            GM_xmlhttpRequest({
                method: 'PATCH',
                url: 'https://api.github.com/gists/' + GIST_ID,
                headers: { 'Authorization': 'token ' + pat, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
                data: JSON.stringify(body),
                timeout: 15000,
                onload: function(r) {
                    if (r.status >= 200 && r.status < 300) resolve(true);
                    else if (r.status === 401) reject(new Error('PAT rejected (401) - generate a new one'));
                    else reject(new Error('GitHub ' + r.status));
                },
                onerror: function() { reject(new Error('Network error')); },
                ontimeout: function() { reject(new Error('Timeout')); }
            });
        });
    }

    async function fetchSiteConfig(site) {
        var cfg = await gistReadFile(siteFile(site));
        if (cfg) return cfg;
        var legacy = await gistReadFile(GIST_FILENAME);   // sites set up before v7.1
        return (legacy && legacy[site]) || null;
    }

    function extractSiteConfig() {
        var cfg = {};
        SYNC_KEYS.forEach(function(k) { if (CFG[k] !== undefined) cfg[k] = CFG[k]; });
        var ov = currentOverride(state.detectedSite);
        if (ov) cfg._webhook = ov;
        return cfg;
    }

    function currentOverride(site) {
        try {
            var o = JSON.parse(GM_getValue('lt_site_webhook_override', 'null'));
            if (o && o.site === site && o.url) return o.url;
        } catch(e) {}
        return '';
    }

    function applySiteConfig(siteCfg) {
        if (!siteCfg) return;
        SYNC_KEYS.forEach(function(k) { if (siteCfg[k] !== undefined) CFG[k] = siteCfg[k]; });
        if (siteCfg._webhook && siteCfg._webhook.indexOf('https://hooks.slack.com/') === 0) {
            GM_setValue('lt_site_webhook_override', JSON.stringify({ site: state.detectedSite, url: siteCfg._webhook }));
        }
        saveConfig();
        log('Shared settings applied for ' + state.detectedSite);
    }

    async function syncFromGist() {
        var site = state.detectedSite;
        if (!site) return;
        GIST_PAT = GM_getValue('lt_gist_pat', '');
        // An admin saved here but the push failed: keep their local settings and retry the push,
        // instead of letting the old shared copy silently undo what they just changed.
        if (GM_getValue('lt_cfg_dirty', '') === site) {
            if (hasPat() && await pushSiteConfigToGist(true)) { GM_setValue('lt_cfg_dirty', ''); }
            else { updateSyncStatus('dirty'); return; }
        }
        updateSyncStatus('syncing');
        try {
            var cfg = await fetchSiteConfig(site);
            if (cfg) {
                applySiteConfig(cfg);
                populateViewSelect(); updateAutoBar(); updateSiteBar(); updateWebhookStatus(); startScheduler();
                if (state.data) render(state.data);
                updateSyncStatus('synced');
            } else {
                log('No shared settings for ' + site + ' yet - using local settings');
                updateSyncStatus('local');
            }
        } catch(e) {
            log('Settings sync error: ' + e.message);
            updateSyncStatus('error');
        }
    }

    async function pushSiteConfigToGist(quiet) {
        var site = state.detectedSite;
        if (!site) { if (!quiet) toast('❌ Site not detected', 'err'); return false; }
        try {
            var cfg = extractSiteConfig();
            cfg._updated = new Date().toISOString();
            await gistWriteFile(siteFile(site), cfg);
            GM_setValue('lt_cfg_dirty', '');
            if (!quiet) toast('✅ Saved and synced to all ' + site + ' managers', 'ok', 4000);
            updateSyncStatus('synced');
            return true;
        } catch(e) {
            log('Settings push failed: ' + e.message);
            GM_setValue('lt_cfg_dirty', site);
            updateSyncStatus('dirty');
            if (!quiet) toast('⚠ Saved on THIS computer only (' + e.message + '). Other managers won’t get it until the PAT is fixed.', 'err', 9000);
            return false;
        }
    }

    async function gistSetLastSend(site) {
        if (!hasPat()) return;
        try { await gistWriteFile(lastSendFile(site), { ts: Date.now(), by: instanceId(), v: SCRIPT_VERSION }); }
        catch(e) { log('Shared last-send write failed: ' + e.message); }
    }

    async function gistGetLastSend(site) {
        try { var o = await gistReadFile(lastSendFile(site)); return (o && o.ts) || 0; }
        catch(e) { log('Shared last-send read failed: ' + e.message); return 0; }
    }

    function updateSyncStatus(status) {
        var el = document.getElementById('lt-sync-status');
        if (!el) return;
        var nd = new Date(), h = nd.getHours(), m = nd.getMinutes(), ap = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        var t = h + ':' + String(m).padStart(2,'0') + ' ' + ap;
        if (status === 'synced') { el.textContent = '✅ Shared settings synced ' + t; el.style.color = '#3fd98f'; }
        else if (status === 'syncing') { el.textContent = '⏳ Syncing...'; el.style.color = '#a7a7a7'; }
        else if (status === 'dirty') { el.textContent = '⚠ Your changes are saved on this computer only — add a valid Gist PAT to share them'; el.style.color = '#f5a623'; }
        else if (status === 'local') { el.textContent = '⚙️ No shared settings for this site yet — Tool Manager: unlock and Save'; el.style.color = '#a7a7a7'; }
        else { el.textContent = '⚠ Couldn’t reach shared settings — using last known'; el.style.color = '#f5a623'; }
    }

    // ── ADOPTION + HEALTH LOG ─────────────────────────────────────────
    // One central Slack channel (e.g. #costcut-adoption-log) receives:
    //   ONLINE  - a tool instance is running at a site (max once / 4h per browser)
    //   POSTED  - first successful report of the day per browser
    //   FAILING - a site's report failed to post (max once / hour per browser)
    // Paste the adoption workflow webhook URL below. Empty = disabled.
    var ADOPTION_WEBHOOK = '';

    function instanceId() {
        var id = GM_getValue('lt_instance_id', '');
        if (!id) { id = Math.random().toString(36).slice(2, 8).toUpperCase(); GM_setValue('lt_instance_id', id); }
        return id;
    }

    function postAdoption(text) {
        if (!ADOPTION_WEBHOOK) return;
        try {
            GM_xmlhttpRequest({
                method: 'POST', url: ADOPTION_WEBHOOK,
                headers: { 'Content-Type': 'application/json; charset=utf-8' },
                data: JSON.stringify({ message: text }),
                timeout: 10000,
                onload: function(r) { log('Adoption log: ' + r.status); },
                onerror: function() { log('Adoption log: network error'); }
            });
        } catch(e) {}
    }

    function throttled(key, ms) {
        var last = parseInt(GM_getValue(key, '0'));
        if (Date.now() - last < ms) return false;
        GM_setValue(key, String(Date.now()));
        return true;
    }

    function senderRole() { return hasPat() ? 'primary' : 'backup'; }

    function reportOnline() {
        var site = state.detectedSite || 'UNKNOWN';
        if (!throttled('lt_hb_online', 4 * 3600000)) return;
        postAdoption('🟢 ONLINE | ' + site + ' | ' + regionOf(site) + ' | v' + SCRIPT_VERSION + ' | browser ' + instanceId() +
            ' (' + senderRole() + ') | auto-send ' + (CFG.autoSendEnabled ? 'every ' + CFG.autoSendIntervalHours + 'h' : 'OFF'));
    }

    function reportSendResult(ok, errText) {
        var site = state.detectedSite || 'UNKNOWN';
        state.lastSendOk = ok; state.lastSendError = ok ? '' : (errText || 'unknown error');
        updateSiteBar();
        if (ok) {
            var day = new Date().toDateString();
            if (GM_getValue('lt_hb_posted_day', '') === day) return;
            GM_setValue('lt_hb_posted_day', day);
            postAdoption('✅ POSTED | ' + site + ' | ' + regionOf(site) + ' | v' + SCRIPT_VERSION + ' | browser ' + instanceId());
        } else {
            if (!throttled('lt_hb_fail', 3600000)) return;
            postAdoption('🔴 FAILING | ' + site + ' | ' + regionOf(site) + ' | v' + SCRIPT_VERSION + ' | browser ' + instanceId() + ' | ' + state.lastSendError);
        }
    }

    // ── REGIONS (adoption log only) ───────────────────────────────────
    var SITE_REGIONS = {
        'UMD1': 'Mid-Atlantic', 'UPA1': 'Mid-Atlantic', 'UVA1': 'Mid-Atlantic', 'UVA4': 'Mid-Atlantic', 'UVA5': 'Mid-Atlantic',
        'JFK2': 'Northeast', 'UMA4': 'Northeast', 'UNJ2': 'Northeast', 'UNY2': 'Northeast', 'UNY4': 'Northeast', 'UNY5': 'Northeast',
    };
    function regionOf(site) { return SITE_REGIONS[site] || 'East'; }

    // "New York - UNY2" -> "UNY2". Lets any HWMS site be detected, listed or not.
    function codeFromText(text) {
        if (!text) return null;
        text = text.replace(/<!---->/g, '').trim();
        if (SITE_DISPLAY_MAP[text]) return SITE_DISPLAY_MAP[text];
        var m = text.match(/-\s*([A-Z]{3}\d{1,2})\s*$/);
        return m ? m[1] : null;
    }

    function siteWebhookFor(site) {
        if (!site) return '';
        return currentOverride(site) || SITE_WEBHOOKS[site] || '';
    }

    const DEFAULT_CFG = {
        slackWebhook: '', additionalWebhooks: '',
        autoSendEnabled: true, autoSendIntervalHours: 1,
        bottomN: 3, topN: 3, showTopPerformers: true, showBottomPerformers: true, showOverallRate: false, showZoneRates: true,
        showAllClear: false,
        minDurationHours: 0.15, zones: ['AMBIENT','BIGS','CHILLED','FROZEN'], roles: ['Pack','Receive'], pollInterval: 2000,
        rateThresholds: { Pack: { AMBIENT:0,BIGS:0,CHILLED:0,FROZEN:0 }, Receive: { AMBIENT:0,BIGS:0,CHILLED:0,FROZEN:0 } },
        trackBreaks: true, trackBreakShort: true, trackBreakVerify: true, trackBreakExtended: true,
        breakShortMin: 15, breakShortMax: 25, breakVerifyMax: 34,
        trackIdle: true, idleMinThreshold: 0, trackPunchIn: true, punchInMinThreshold: 0,
        trackAdmin: true, adminMinThreshold: 0, trackDowntime: true, downtimeMinThreshold: 0,
        trackLogout: true, logoutMinThreshold: 0, trackMyMetrics: true, myMetricsMinThreshold: 0,
        trackIndirectTask: true, indirectTaskMinThreshold: 0, trackTraining: true, trainingMinThreshold: 0,
        trackUnpack: true, unpackMinThreshold: 0, trackStart: true, startMinThreshold: 0,
        trackCRG: true, crgMinThreshold: 0,
        autoSendTimeRange: 'Previous Hour',
        selectedView: 'breaks',
    };

    let CFG = loadConfig();

    function loadConfig() {
        try {
            var saved = GM_getValue('lt_config_v60', null);
            if (saved) {
                var p = JSON.parse(saved);
                if (!p.rateThresholds) p.rateThresholds = DEFAULT_CFG.rateThresholds;
                DEFAULT_CFG.roles.forEach(function(r) {
                    if (!p.rateThresholds[r]) p.rateThresholds[r] = {};
                    DEFAULT_CFG.zones.forEach(function(z) { if (p.rateThresholds[r][z] === undefined) p.rateThresholds[r][z] = 0; });
                });
                Object.keys(DEFAULT_CFG).forEach(function(k) { if (p[k] === undefined) p[k] = DEFAULT_CFG[k]; });
                return Object.assign({}, DEFAULT_CFG, p);
            }
            return Object.assign({}, DEFAULT_CFG);
        } catch(e) { return Object.assign({}, DEFAULT_CFG); }
    }
    function saveConfig() { GM_setValue('lt_config_v60', JSON.stringify(CFG)); }

    function getLastSendTs() { return parseInt(GM_getValue('lt_last_send', '0')); }
    function setLastSendTs() { GM_setValue('lt_last_send', String(Date.now())); }
    function msSinceLastSend() { return Date.now() - getLastSendTs(); }
    function intervalMs() { return CFG.autoSendIntervalHours * 3600000; }
    function nextSendMs() { return Math.max(0, intervalMs() - msSinceLastSend()); }

    function getSearchDoc() {
        var frames = document.querySelectorAll('iframe');
        for (var i = 0; i < frames.length; i++) {
            try {
                var fd = frames[i].contentDocument || frames[i].contentWindow.document;
                if (fd && fd.querySelector('kat-dropdown[data-testid="site-selection"]')) return fd;
            } catch(e) {}
        }
        return document;
    }

    function getKatOptions(dropdown) {
        if (dropdown.shadowRoot) {
            var srOpts = dropdown.shadowRoot.querySelectorAll('kat-option');
            if (srOpts.length > 0) return srOpts;
        }
        return dropdown.querySelectorAll('kat-option');
    }

    function detectSiteCode() {
        var doc = getSearchDoc();
        var dropdown = doc.querySelector('kat-dropdown[data-testid="site-selection"]');
        if (!dropdown) return null;
        var selectedValue = dropdown.getAttribute('value');
        if (!selectedValue) return null;
        var cachedMap = null;
        try { cachedMap = JSON.parse(GM_getValue('lt_uuid_map', 'null')); } catch(e) {}
        if (cachedMap && cachedMap[selectedValue]) return cachedMap[selectedValue];
        var hdrEl = dropdown.shadowRoot && dropdown.shadowRoot.querySelector('.select-header');
        var fromHeader = hdrEl && codeFromText(hdrEl.getAttribute('title') || hdrEl.textContent);
        if (fromHeader) return fromHeader;
        var opts = getKatOptions(dropdown);
        for (var i = 0; i < opts.length; i++) {
            var nameEl = opts[i].querySelector('.standard-option-name');
            if (!nameEl) continue;
            var optCode = codeFromText(nameEl.textContent);
            if (optCode && opts[i].getAttribute('value') === selectedValue) return optCode;
        }
        var bodyText = doc.body ? doc.body.innerText : '';
        var displayNames = Object.keys(SITE_DISPLAY_MAP);
        for (var k = 0; k < displayNames.length; k++) {
            if (bodyText.indexOf(displayNames[k]) >= 0) return SITE_DISPLAY_MAP[displayNames[k]];
        }
        return null;
    }

    async function buildUUIDCache() {
        log('Building UUID cache...');
        var doc = getSearchDoc();
        var dropdown = doc.querySelector('kat-dropdown[data-testid="site-selection"]');
        if (!dropdown) { log('No dropdown found'); return; }
        var shadowHeader = dropdown.shadowRoot && dropdown.shadowRoot.querySelector('.select-header');
        if (shadowHeader) { shadowHeader.click(); } else { dropdown.click(); }
        await sleep(1500);
        var opts = getKatOptions(dropdown);
        log('Cache build: ' + opts.length + ' options found');
        if (opts.length > 0) {
            var map = {};
            for (var i = 0; i < opts.length; i++) {
                var nameEl = opts[i].querySelector('.standard-option-name');
                if (!nameEl) continue;
                var text = nameEl.textContent.replace(/<!---->/g, '').trim();
                var val = opts[i].getAttribute('value');
                if (val && codeFromText(text)) map[val] = codeFromText(text);
            }
            GM_setValue('lt_uuid_map', JSON.stringify(map));
            log('UUID cache saved: ' + Object.keys(map).length + ' sites');
        }
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await sleep(400);
        var code = detectSiteCode();
        if (code) { state.detectedSite = code; updateSiteBar(); updateWebhookStatus(); log('Site detected: ' + code); }
        else { log('Site still not detected after cache build'); updateSiteBar(); }
    }

    function startSiteDetectionPoller() {
        var code = detectSiteCode();
        if (code) { state.detectedSite = code; updateSiteBar(); updateWebhookStatus(); return; }
        var attempts = 0;
        var iv = setInterval(function() {
            attempts++;
            var c = detectSiteCode();
            if (c) { state.detectedSite = c; updateSiteBar(); updateWebhookStatus(); clearInterval(iv); return; }
            if (attempts === 3) { clearInterval(iv); buildUUIDCache(); }
        }, 3000);
    }

    var adminUnlocked = false;

    var state = {
        data: null, lastUpdate: null, debugLog: [],
        rawRowCount: 0, filteredOutCount: 0, colMap: {},
        collapsed: true, showDebug: false, showConfig: false,
        slackBusy: false, autoSendTimer: null, countdownTimer: null,
        lastSlackResponse: null, detectedSite: null,
        selectedView: CFG.selectedView || 'breaks',
    };

    var KNOWN_HEADERS = {
        'sub process path': 'subProcessPath', 'function': 'func', 'associate': 'associate',
        'zone': 'zone', 'unit': 'unit', 'duration (hours)': 'duration',
        'duration(hours)': 'duration', 'duration': 'duration', 'rate': 'rate',
    };

    GM_addStyle([
'#lt-panel{position:fixed;top:10px;right:10px;width:560px;max-height:92vh;overflow-y:auto;background:#1a1d21;color:#e8e8ea;border:1px solid #2f3136;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,.55);z-index:2147483647;font-family:"Slack-Lato","Lato","Helvetica Neue",Arial,sans-serif;font-size:14.5px;line-height:1.5;transition:width .2s,max-height .2s}',
'#lt-panel.collapsed{width:230px;max-height:46px;overflow:hidden;border-radius:8px}',
'#lt-panel *{box-sizing:border-box}',
'#lt-hdr{display:flex;justify-content:space-between;align-items:center;padding:10px 13px;background:#3f0e40;border-radius:8px 8px 0 0;cursor:move;user-select:none;border-bottom:1px solid #522653;min-height:46px}',
'#lt-panel.collapsed #lt-hdr{border-radius:8px;cursor:pointer}',
'#lt-hdr h3{margin:0;font-size:14px;font-weight:700;color:#fff;letter-spacing:.2px;display:flex;align-items:center;gap:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;flex-shrink:1}',
'#lt-hdr .ws-name{font-size:12px;color:#f0b8f0;font-weight:400;margin-left:2px}',
'#lt-hdr .site-badge{font-size:12px;background:rgba(255,255,255,.18);color:#fff;padding:2px 8px;border-radius:10px;font-weight:700;margin-left:4px;flex-shrink:0}',
'#lt-hdr .site-badge.unknown{background:rgba(255,100,100,.3);color:#ffaaaa}',
'#lt-panel.collapsed #lt-hdr h3{max-width:170px;font-size:13px;font-weight:700}',
'#lt-hdr .g{display:flex;gap:4px;align-items:center;flex-shrink:0}',
'#lt-hdr button{background:transparent;border:none;color:#d6c3d6;padding:5px 10px;border-radius:4px;cursor:pointer;font-size:15px;transition:.12s;line-height:1}',
'#lt-b-ref{font-size:20px !important;padding:4px 9px !important}',
'#lt-hdr button:hover{background:rgba(255,255,255,.18);color:#fff}',
'#lt-hdr button.slack-btn{color:#f0b8f0}',
'#lt-hdr button.slack-btn.busy{opacity:.4;pointer-events:none}',
'#lt-hdr button.slack-btn.ok{color:#3fd98f}',
'#lt-hdr button.slack-btn.err{color:#ff5a5a}',
'#lt-panel.collapsed #lt-hdr .g button{display:none}',
'#lt-panel.collapsed #lt-hdr #lt-b-col{display:flex !important;font-size:17px;padding:5px 11px}',
'#lt-channel-bar{padding:8px 15px;background:#1a1d21;border-bottom:1px solid #2f3136;display:flex;align-items:center;gap:8px;font-size:14px}',
'#lt-channel-bar .ch-name{font-weight:700;color:#fff}',
'#lt-channel-bar .ch-time{font-size:12px;color:#a7a7a7;margin-left:auto}',
'#lt-view-bar{padding:8px 15px;background:#202327;border-bottom:1px solid #2f3136;display:flex;align-items:center;gap:9px}',
'#lt-view-bar label{font-size:12px;font-weight:700;color:#b9b9bd;text-transform:uppercase;letter-spacing:.5px}',
'#lt-view-select{flex:1;background:#2a2e33;border:1px solid #3a3f45;color:#fff;padding:7px 11px;border-radius:5px;font-size:14.5px;font-weight:600;outline:none;cursor:pointer}',
'#lt-view-select:focus{border-color:#1d9bd1}',
'#lt-site-bar{padding:5px 15px;background:#1a1d21;border-bottom:1px solid #2f3136;font-size:12px;display:flex;align-items:center;gap:6px}',
'#lt-site-bar .site-ok{color:#3fd98f}','#lt-site-bar .site-warn{color:#f5a623}','#lt-site-bar .site-err{color:#ff5a5a}',
'#lt-auto-bar{padding:6px 15px;background:#1a1d21;border-bottom:1px solid #2f3136;font-size:12px;display:flex;justify-content:space-between;align-items:center}',
'#lt-auto-bar.off{opacity:.6}',
'#lt-auto-bar .auto-status{color:#3fd98f;display:flex;align-items:center;gap:5px}',
'#lt-auto-bar.off .auto-status{color:#a7a7a7}',
'#lt-auto-bar .countdown{color:#b9b9bd;font-variant-numeric:tabular-nums}',
'#lt-body{padding:13px 15px 18px;background:#1a1d21}',
'.lt-msg{display:flex;gap:11px;margin-bottom:18px;align-items:flex-start}',
'.lt-msg-avatar{width:38px;height:38px;border-radius:5px;background:#3f0e40;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}',
'.lt-msg-content{flex:1;min-width:0}',
'.lt-msg-header{display:flex;align-items:baseline;gap:8px;margin-bottom:3px}',
'.lt-msg-author{font-weight:700;font-size:14.5px;color:#fff}',
'.lt-msg-ts{font-size:12px;color:#a7a7a7}',
'.lt-msg-text{font-size:14.5px;color:#e8e8ea;line-height:1.5}',
'.lt-attach{border-left:4px solid #4a4a4a;padding:8px 12px;margin:7px 0;border-radius:0 5px 5px 0;background:#24282d}',
'.lt-attach.red{border-left-color:#ff5a5a}','.lt-attach.yellow{border-left-color:#ffc23d}','.lt-attach.blue{border-left-color:#36b6f0}','.lt-attach.purple{border-left-color:#b07cc6}','.lt-attach.orange{border-left-color:#ff9542}',
'.lt-attach-title{font-weight:800;font-size:14px;margin-bottom:6px}',
'.lt-attach.red .lt-attach-title{color:#ff6b6b}','.lt-attach.yellow .lt-attach-title{color:#ffc23d}','.lt-attach.blue .lt-attach-title{color:#4fc0f5}','.lt-attach.purple .lt-attach-title{color:#c495d8}','.lt-attach.orange .lt-attach-title{color:#ff9542}',
'.lt-t{width:100%;border-collapse:collapse;margin-top:5px;font-size:14px}',
'.lt-t th{padding:5px 9px;text-align:left;font-size:11px;color:#a7a7a7;font-weight:700;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #2f3136}',
'.lt-t td{padding:6px 9px;border-bottom:1px solid rgba(255,255,255,.05);color:#e8e8ea}',
'.lt-t tr:last-child td{border-bottom:none}','.lt-t tr:hover td{background:rgba(255,255,255,.05)}',
'.r1 td{color:#ff6b6b;font-weight:700}.r2 td{color:#ff9542;font-weight:600}.r3 td{color:#ffc23d}',
'td.rt{font-variant-numeric:tabular-nums;font-weight:700;color:#fff}','td.ut{font-variant-numeric:tabular-nums}',
'td.tt{font-variant-numeric:tabular-nums;white-space:nowrap}',
'.brk-short{color:#ffc23d;font-weight:700}','.brk-verify{color:#ff9542;font-weight:700}','.brk-extended{color:#ff6b6b;font-weight:800}',
'.t1 td{color:#ffc23d;font-weight:700}.t2 td{color:#e8e8ea;font-weight:600}.t3 td{color:#b9b9bd}',
'.lt-zone-pill{display:inline-block;padding:2px 9px;border-radius:4px;font-size:12.5px;font-weight:700;margin-bottom:7px}',
'.lt-zone-pill.ambient{background:#2d3a1a;color:#9ad46a}','.lt-zone-pill.bigs{background:#3a2a0e;color:#ff9542}','.lt-zone-pill.chilled{background:#0e2a3a;color:#4fc0f5}','.lt-zone-pill.frozen{background:#1a0e3a;color:#b57ce0}',
'#lt-status{padding:6px 15px;background:#1a1d21;border-top:1px solid #2f3136;font-size:12px;color:#b9b9bd;display:flex;justify-content:space-between;align-items:center;border-radius:0 0 8px 8px}',
'#lt-status .link{color:#4fc0f5;cursor:pointer}',
'.lt-nd{color:#9a9a9a;font-style:italic;font-size:13px;padding:3px 0}',
'.lt-dur-note{font-size:12.5px;color:#b9b9bd;margin-bottom:11px;padding:5px 9px;background:#24282d;border-radius:5px}',
'.lt-empty-ok{color:#3fd98f;font-size:14px;padding:6px 0}',
'.lt-overall-sub{font-size:11px;font-weight:700;color:#b9b9bd;text-transform:uppercase;letter-spacing:.5px;padding:7px 0 3px;margin-top:5px}',
'a.lt-assoc{color:inherit;text-decoration:none;border-bottom:1px dotted rgba(255,255,255,.35);cursor:pointer;transition:.12s}',
'a.lt-assoc:hover{color:#4fc0f5;border-bottom-color:#4fc0f5}',
    ].join('\n'));

    GM_addStyle([
'#lt-cfg{display:none;padding:12px 15px;background:#1a1d21;border-top:1px solid #2f3136}','#lt-cfg.vis{display:block}',
'#lt-cfg label{display:block;margin-bottom:4px;font-size:12px;color:#b9b9bd;font-weight:700;text-transform:uppercase;letter-spacing:.4px}',
'#lt-cfg input[type="number"],#lt-cfg input[type="text"]{background:#24282d;border:1px solid #3a3f45;color:#e8e8ea;padding:6px 10px;border-radius:4px;font-size:13px;margin-bottom:8px;outline:none}',
'#lt-cfg input:focus{border-color:#1d9bd1}','#lt-cfg input.full{width:100%}',
'#lt-cfg .row2{display:grid;grid-template-columns:1fr 1fr;gap:8px}','#lt-cfg .row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}',
'#lt-cfg select{background:#24282d;border:1px solid #3a3f45;color:#e8e8ea;padding:6px 10px;border-radius:4px;font-size:13px;margin-bottom:8px;outline:none;cursor:pointer}',
'#lt-cfg button.apply{width:100%;padding:9px;background:#007a5a;border:none;color:#fff;border-radius:4px;cursor:pointer;font-weight:700;font-size:14px;margin-top:6px;transition:.15s}',
'#lt-cfg button.apply:hover{background:#148567}',
'#lt-cfg .hint{font-size:12px;color:#a7a7a7;margin-top:-4px;margin-bottom:10px;line-height:1.45}',
'#lt-cfg .section-title{font-size:12px;font-weight:700;color:#b9b9bd;text-transform:uppercase;letter-spacing:.8px;margin:12px 0 8px;padding-top:10px;border-top:1px solid #2f3136}',
'#lt-cfg .toggle-row{display:flex;align-items:center;gap:10px;margin-bottom:10px}',
'#lt-cfg .toggle{position:relative;width:38px;height:21px;background:#4a4a4a;border-radius:11px;cursor:pointer;transition:.2s;flex-shrink:0}',
'#lt-cfg .toggle.on{background:#007a5a}',
'#lt-cfg .toggle::after{content:"";position:absolute;top:2px;left:2px;width:17px;height:17px;background:#fff;border-radius:50%;transition:.2s}',
'#lt-cfg .toggle.on::after{left:19px}','#lt-cfg .toggle-label{font-size:14px;color:#e8e8ea}',
'.thr-grid{display:grid;grid-template-columns:100px repeat(4,1fr);gap:5px;align-items:center;margin-bottom:8px;font-size:12px}',
'.thr-grid .thr-label{color:#b9b9bd;font-weight:700;font-size:12px}',
'.thr-grid .thr-zone{color:#b9b9bd;font-size:11px;text-align:center;font-weight:700;text-transform:uppercase}',
'.thr-grid input{background:#24282d;border:1px solid #3a3f45;color:#e8e8ea;border-radius:4px;width:100%;text-align:center;padding:4px 4px;font-size:12px}',
'#lt-dbg{display:none;max-height:200px;overflow-y:auto;padding:8px 15px;background:#121316;font-size:11px;color:#a7a7a7;font-family:monospace;border-top:1px solid #2f3136}',
'#lt-dbg.vis{display:block}',
'#lt-slack-resp{display:none;padding:8px 15px;background:#121316;font-size:11px;color:#a7a7a7;font-family:monospace;border-top:1px solid #2f3136;max-height:80px;overflow-y:auto;word-break:break-all}',
'#lt-slack-resp.vis{display:block}',
'.lt-load{text-align:center;padding:26px;color:#b9b9bd;font-size:14px}',
'.lt-spin{display:inline-block;width:17px;height:17px;border:2px solid #2f3136;border-top-color:#1d9bd1;border-radius:50%;animation:lts .7s linear infinite;vertical-align:middle;margin-right:8px}',
'@keyframes lts{to{transform:rotate(360deg)}}',
'.lt-toast{position:fixed;bottom:20px;right:20px;padding:11px 17px;border-radius:6px;font-size:14px;font-weight:600;z-index:2147483648;opacity:0;transition:opacity .25s;pointer-events:none;max-width:360px}',
'.lt-toast.show{opacity:1}','.lt-toast.ok{background:#007a5a;color:#fff}','.lt-toast.err{background:#e8192c;color:#fff}','.lt-toast.info{background:#1d9bd1;color:#fff}',
'.fn-track-grid{display:grid;grid-template-columns:140px 1fr 130px;gap:6px;align-items:center;margin-bottom:6px;font-size:13px}',
'.fn-track-grid .fn-label{color:#e8e8ea;font-size:13px}',
'.fn-track-grid .fn-col-hdr{font-size:11px;font-weight:700;color:#b9b9bd;text-transform:uppercase;text-align:center;letter-spacing:.4px}',
'.fn-track-grid input{background:#24282d;border:1px solid #3a3f45;color:#e8e8ea;border-radius:4px;width:100%;text-align:center;padding:5px;font-size:13px}',
'.interval-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:8px}',
'.interval-btn{padding:7px 4px;border:1px solid #3a3f45;background:#24282d;color:#e8e8ea;border-radius:4px;cursor:pointer;font-size:13px;text-align:center;transition:.15s}',
'.interval-btn:hover{border-color:#1d9bd1;color:#4fc0f5}',
'.interval-btn.active{border-color:#007a5a;background:rgba(0,122,90,.25);color:#3fd98f;font-weight:700}',
'#lt-cfg-lockable{transition:opacity .2s}',
'#lt-cfg-lockable.locked{opacity:0.35;pointer-events:none;user-select:none}',
'#lt-range-bar{padding:7px 15px;background:#13233a;border-bottom:1px solid #1d3a5c;display:flex;align-items:center;gap:7px;font-size:13.5px}',
'#lt-range-bar .range-ico{font-size:14px}',
'#lt-range-bar .range-lbl{color:#8fb8e0;font-weight:700;text-transform:uppercase;font-size:11px;letter-spacing:.5px}',
'#lt-range-bar .range-val{color:#8fd4ff;font-weight:800;font-size:14.5px;font-variant-numeric:tabular-nums}',
'#lt-viewrange-bar{padding:7px 15px;background:#202327;border-bottom:1px solid #2f3136;display:flex;align-items:center;gap:5px;flex-wrap:wrap}',
'#lt-viewrange-bar .vr-lbl{font-size:11px;color:#b9b9bd;font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-right:3px}',
'#lt-viewrange-bar .vr-btn{font-size:12px;padding:4px 10px;border:1px solid #3a3f45;background:#2a2e33;color:#e8e8ea;border-radius:4px;cursor:pointer;transition:.12s}',
'#lt-viewrange-bar .vr-btn:hover{border-color:#1d9bd1;color:#4fc0f5}',
'#lt-viewrange-bar .vr-btn.active{border-color:#007a5a;background:#007a5a;color:#fff;font-weight:700}',
    ].join('\n'));

    function log(m) { var t = new Date().toLocaleTimeString(); state.debugLog.push('[' + t + '] ' + m); if (state.debugLog.length > 400) state.debugLog.splice(0, 100); console.log('[LT] ' + m); }
    function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
    function pad(n) { return n.toString().padStart(2, '0'); }
    function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }
    function getRateThreshold(role, zone) { return CFG.rateThresholds && CFG.rateThresholds[role] && CFG.rateThresholds[role][zone] ? CFG.rateThresholds[role][zone] : 0; }
    function toMin(durationNum) { return isNaN(durationNum) ? '-' : Math.round(durationNum * 60) + 'm'; }
    function roleLabel(r) { return r === 'Receive' ? 'Receivers' : r + 'ers'; }
    function $i(id) { return document.getElementById(id); }

    function toast(msg, type, ms) {
        type = type || 'info'; ms = ms || 3000;
        var t = document.getElementById('lt-toast');
        if (!t) { t = document.createElement('div'); t.id = 'lt-toast'; t.className = 'lt-toast'; document.body.appendChild(t); }
        t.textContent = msg; t.className = 'lt-toast ' + type + ' show';
        clearTimeout(t._timer); t._timer = setTimeout(function() { t.classList.remove('show'); }, ms);
    }

    function parseCurrentUrlRange() {
        try { var r = new URL(location.href).searchParams.get('absoluteDateTimeRange'); if (!r) return null; var parts = r.split(':'); return parts.length === 2 ? { start: parseInt(parts[0]), end: parseInt(parts[1]) } : null; } catch(e) { return null; }
    }
    function formatHourRange(s, e) {
        var f = function(ts) {
            var d = new Date(ts), h = d.getHours(), m = d.getMinutes();
            var ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
            return h + ':' + String(m).padStart(2,'0') + ' ' + ap;
        };
        return f(s) + ' - ' + f(e);
    }
    function fmtCountdown(ms) {
        if (ms <= 0) return 'now';
        var h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
        if (h > 0) return h + 'h ' + pad(m) + 'm';
        if (m > 0) return m + 'm ' + pad(s) + 's';
        return s + 's';
    }

    function sanitizeForSlack(msg) {
        return msg
            .replace(/\u202F/g, ' ').replace(/\u00A0/g, ' ').replace(/\u2007/g, ' ')
            .replace(/\u2009/g, ' ').replace(/\u200A/g, ' ').replace(/[\u200B-\u200D]/g, '')
            .replace(/\uFEFF/g, '').replace(/[\u2028\u2029]/g, '\n')
            .replace(/\u2500+/g, '---').replace(/\u2192/g, '->').replace(/\u2014/g, '-')
            .replace(/\u2013/g, '-').replace(/\u2212/g, '-').replace(/\u221e/g, 'unlimited')
            .replace(/\u2026/g, '...').replace(/\u00B7/g, '.').replace(/\u2019/g, "'")
            .replace(/\u201c/g, '"').replace(/\u201d/g, '"').replace(/\u2018/g, "'")
            .replace(/\u201a/g, ',').replace(/\u2022/g, '-');
    }

    function updateWebhookStatus() {
        var el = $i('lt-webhook-status'); if (!el) return;
        var site = state.detectedSite;
        if (site && siteWebhookFor(site)) {
            el.innerHTML = '<div style="background:#1a3a2a;border:1px solid #007a5a;border-radius:4px;padding:8px 12px;font-size:12px;color:#3fd98f">\u2705 <strong>Auto-webhook active:</strong> Reports post to <strong>#costcut-' + site.toLowerCase() + '</strong> for <strong>' + site + '</strong>.</div>';
        } else if (site && !siteWebhookFor(site)) {
            el.innerHTML = '<div style="background:#3a2a1a;border:1px solid #e87722;border-radius:4px;padding:8px 12px;font-size:12px;color:#f5a623">\u26A0 <strong>' + site + '</strong> detected but has no Slack webhook yet. Tool Manager: unlock settings and use <strong>Site webhook override</strong>.</div>';
        } else {
            el.innerHTML = '<div style="background:#3a2a1a;border:1px solid #e87722;border-radius:4px;padding:8px 12px;font-size:12px;color:#f5a623">\u26A0 Site not detected yet. Select your site then Rebuild site cache below.</div>';
        }
    }

    function updateSiteBar() {
        var bar = $i('lt-site-bar'); if (!bar) return;
        var code = state.detectedSite;
        var badge = $i('lt-site-badge');
        if (badge) {
            if (code) { badge.textContent = code; badge.className = 'site-badge'; }
            else { badge.textContent = '?'; badge.className = 'site-badge unknown'; }
        }
        var siteWebhook = code && siteWebhookFor(code);
        if (code && siteWebhook && state.lastSendOk === false) {
            bar.innerHTML = '<span class="site-err">\u26A0 ' + code + ' \u2014 last Slack post FAILED (' + esc(state.lastSendError) + '). Tell your Tool Manager.</span>';
            return;
        }
        var managerWebhook = CFG.additionalWebhooks && CFG.additionalWebhooks.trim();
        if (code && siteWebhook) {
            var extras = managerWebhook ? ' + extra webhook' : '';
            bar.innerHTML = '<span class="site-ok">\u2713 ' + code + ' \u2014 auto-routing to #costcut-' + code.toLowerCase() + extras + '</span>';
        } else if (code && !siteWebhook) {
            bar.innerHTML = '<span class="site-warn">\u26A0 ' + code + ' detected \u2014 no Slack webhook yet (Tool Manager can add one in Settings)</span>';
        } else {
            bar.innerHTML = '<span class="site-err">\u2717 Site not detected \u2014 select a site in the dropdown</span>';
        }
    }

    function updateAutoBar() {
        var bar = $i('lt-auto-bar'); if (!bar) return;
        if (!CFG.autoSendEnabled) { bar.className = 'off'; bar.innerHTML = '<span class="auto-status">\u23F0 Auto-send OFF</span><span></span>'; return; }
        bar.className = '';
        var ls = getLastSendTs(), next = nextSendMs();
        var lbl = CFG.autoSendIntervalHours === 1 ? 'Every hour' : 'Every ' + CFG.autoSendIntervalHours + 'h';
        var _lsStr = ls ? (function(){ var d=new Date(ls),h=d.getHours(),m=d.getMinutes(),ap=h>=12?'PM':'AM'; h=h%12||12; return h+':'+String(m).padStart(2,'0')+' '+ap; })() : 'never';
        bar.innerHTML = '<span class="auto-status"><span style="width:8px;height:8px;background:#3fd98f;border-radius:50%;display:inline-block;flex-shrink:0"></span> ' + lbl + ' \u00B7 Last: ' + _lsStr + '</span><span class="countdown">Next: ' + fmtCountdown(next) + '</span>';
    }

    // Reads the real start/end from the HWMS URL and shows the window.
    // Falls back to the configured auto-send range label if the URL has no range.
    function updateRangeBar() {
        var el = $i('lt-range-val'); if (!el) return;
        var ur = parseCurrentUrlRange();
        if (ur) {
            el.textContent = formatHourRange(ur.start, ur.end);
            el.title = 'From the HWMS page URL';
        } else if (_viewRange) {
            el.textContent = _viewRange + ' (requested)';
        } else {
            el.textContent = (CFG.autoSendTimeRange || 'Current view') + ' (HWMS default)';
        }
    }

    function detectCols(headers) {
        var map = {};
        headers.forEach(function(raw, i) {
            var h = raw.toLowerCase().trim();
            if (KNOWN_HEADERS[h]) { map[KNOWN_HEADERS[h]] = i; return; }
            for (var k in KNOWN_HEADERS) { var fv = KNOWN_HEADERS[k]; if (map[fv] === undefined && h.indexOf(k) >= 0) map[fv] = i; }
        });
        state.colMap = map; return map;
    }

    function extractRows() {
        var tables = document.querySelectorAll('table'); var all = [];
        tables.forEach(function(tbl) {
            var hdr = tbl.querySelector('thead tr, tr:first-child'); if (!hdr) return;
            var headers = Array.from(hdr.querySelectorAll('th, td')).map(function(c) { return c.textContent.trim(); });
            var cm = detectCols(headers);
            if (cm.associate === undefined || cm.func === undefined) return;
            tbl.querySelectorAll('tbody tr').forEach(function(tr) {
                var cells = Array.from(tr.querySelectorAll('td')).map(function(c) { return c.textContent.trim(); });
                if (cells.length < 3) return;
                var associate = cm.associate !== undefined ? cells[cm.associate] : ''; if (!associate) return;
                if (associate.indexOf(':') >= 0 || associate.indexOf('urn:') === 0 || associate.length > 40) return;
                var func = cm.func !== undefined ? cells[cm.func] : '';
                var zone = cm.zone !== undefined ? cells[cm.zone] : '';
                var unitRaw = cm.unit !== undefined ? cells[cm.unit] : '';
                var durRaw = cm.duration !== undefined ? cells[cm.duration] : '';
                var rateRaw = cm.rate !== undefined ? cells[cm.rate] : '';
                var rate = (rateRaw === '-' || rateRaw === '' || rateRaw === '\u2014') ? NaN : parseFloat(rateRaw);
                var durNum = parseFloat(durRaw);
                all.push({ associate: associate, func: func, zone: zone.toUpperCase().trim(), unit: unitRaw, duration: durRaw, rate: rate, durationNum: durNum, durationMinutes: isNaN(durNum) ? NaN : durNum * 60 });
            });
        });
        log('Extracted: ' + all.length + ' rows'); state.rawRowCount = all.length; return all;
    }

    var ZONE_LABELS = { AMBIENT: 'Ambient', BIGS: 'Bigs', CHILLED: 'Chilled', FROZEN: 'Frozen' };
    var ICONS = { AMBIENT: '\uD83C\uDF21\uFE0F', BIGS: '\uD83D\uDCE6', CHILLED: '\u2744\uFE0F', FROZEN: '\uD83E\uDDCA' };
    var TOP_MEDALS = ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'];

    function process(rows) {
        var bottom = {}; var top = {};
        CFG.zones.forEach(function(z) { bottom[z] = {}; top[z] = {}; CFG.roles.forEach(function(r) { bottom[z][r] = []; top[z][r] = []; }); });
        var filteredOut = 0;
        var validRows = rows.filter(function(r) {
            if (CFG.minDurationHours > 0 && !isNaN(r.durationNum)) { if (r.durationNum < CFG.minDurationHours) { filteredOut++; return false; } }
            return true;
        });
        state.filteredOutCount = filteredOut;
        var allByZoneRole = {};
        CFG.zones.forEach(function(z) { allByZoneRole[z] = {}; CFG.roles.forEach(function(r) { allByZoneRole[z][r] = []; }); });
        validRows.forEach(function(r) {
            if (r.zone === 'NA' || r.zone === '' || r.zone === '-') return;
            var role = CFG.roles.find(function(rl) { return r.func.toLowerCase() === rl.toLowerCase(); });
            if (!role || CFG.zones.indexOf(r.zone) < 0 || isNaN(r.rate)) return;
            allByZoneRole[r.zone][role].push(r);
        });
        CFG.zones.forEach(function(z) { CFG.roles.forEach(function(r) {
            var bc = allByZoneRole[z][r].filter(function(a) { var thr = getRateThreshold(r, z); return !(thr > 0 && a.rate >= thr); });
            bc.sort(function(a, b) { return a.rate - b.rate; });
            bottom[z][r] = bc.slice(0, CFG.bottomN);
            var bn = new Set(bottom[z][r].map(function(a) { return a.associate; }));
            var tc = allByZoneRole[z][r].filter(function(a) { return !bn.has(a.associate); });
            tc.sort(function(a, b) { return b.rate - a.rate; });
            top[z][r] = tc.slice(0, CFG.topN);
        }); });
        var overallBottom = {}; var overallTop = {};
        CFG.roles.forEach(function(role) {
            var pool = []; CFG.zones.forEach(function(z) { pool.push.apply(pool, allByZoneRole[z][role] || []); });
            var byAssoc = {};
            pool.forEach(function(r) {
                var name = r.associate;
                if (!byAssoc[name]) byAssoc[name] = { associate: name, totalUnits: 0, totalDuration: 0, zones: new Set(), rowCount: 0 };
                byAssoc[name].totalUnits += parseFloat(r.unit) || 0;
                byAssoc[name].totalDuration += isNaN(r.durationNum) ? 0 : r.durationNum;
                if (r.zone) byAssoc[name].zones.add(r.zone);
                byAssoc[name].rowCount++;
            });
            var aggregated = Object.values(byAssoc).map(function(a) {
                var zonesArr = Array.from(a.zones);
                return { associate: a.associate, totalUnits: a.totalUnits, totalDuration: a.totalDuration, rowCount: a.rowCount,
                    rate: a.totalDuration > 0 ? Math.round((a.totalUnits / a.totalDuration) * 10) / 10 : 0,
                    zones: zonesArr, zonesStr: zonesArr.map(function(z) { return ZONE_LABELS[z] || z; }).join(', '),
                    durationRound: Math.round(a.totalDuration * 100) / 100 };
            }).filter(function(a) { return a.totalDuration > 0; });
            var sortedAsc = aggregated.slice().sort(function(a, b) { return a.rate - b.rate; });
            overallBottom[role] = sortedAsc.slice(0, CFG.bottomN);
            var bNames = new Set(overallBottom[role].map(function(a) { return a.associate; }));
            var topPool = aggregated.filter(function(a) { return !bNames.has(a.associate); });
            topPool.sort(function(a, b) { return b.rate - a.rate; });
            overallTop[role] = topPool.slice(0, CFG.topN);
        });
        var shortMin = CFG.breakShortMin || 15; var shortMax = CFG.breakShortMax || 25; var verifyMax = CFG.breakVerifyMax || 34;
        var breakRows = CFG.trackBreaks ? rows.filter(function(r) { var f = r.func.toLowerCase().trim(); return (f === 'break' || f === 'lunch' || f === 'brk') && !isNaN(r.durationMinutes) && r.durationMinutes > shortMin; }).sort(function(a, b) { return b.durationMinutes - a.durationMinutes; }) : [];
        var breaksShort    = breakRows.filter(function(r) { return r.durationMinutes > shortMin && r.durationMinutes <= shortMax; });
        var breaksVerify   = breakRows.filter(function(r) { return r.durationMinutes > shortMax && r.durationMinutes <= verifyMax; });
        var breaksExtended = breakRows.filter(function(r) { return r.durationMinutes > verifyMax; });
        function fnList(enabled, name, thr) {
            if (!enabled) return [];
            return rows.filter(function(r) { return r.func.toLowerCase().trim() === name && !isNaN(r.durationNum) && r.durationNum * 60 > (thr || 0); }).sort(function(a, b) { return b.durationNum - a.durationNum; });
        }
        return {
            bottom: bottom, top: top,
            breaksShort: breaksShort, breaksVerify: breaksVerify, breaksExtended: breaksExtended,
            idles: fnList(CFG.trackIdle, 'idle', CFG.idleMinThreshold),
            punchins: fnList(CFG.trackPunchIn, 'punchin', CFG.punchInMinThreshold),
            admins: fnList(CFG.trackAdmin, 'admin', CFG.adminMinThreshold),
            downtimes: fnList(CFG.trackDowntime, 'downtime', CFG.downtimeMinThreshold),
            logouts: fnList(CFG.trackLogout, 'logout', CFG.logoutMinThreshold),
            mymetrics: fnList(CFG.trackMyMetrics, 'my metrics', CFG.myMetricsMinThreshold),
            indirecttasks: fnList(CFG.trackIndirectTask, 'indirect task tool', CFG.indirectTaskMinThreshold),
            trainings: fnList(CFG.trackTraining, 'training', CFG.trainingMinThreshold),
            unpacks: fnList(CFG.trackUnpack, 'unpack', CFG.unpackMinThreshold),
            starts: fnList(CFG.trackStart, 'start', CFG.startMinThreshold),
            crgs: fnList(CFG.trackCRG, 'crg', CFG.crgMinThreshold),
            overallBottom: overallBottom, overallTop: overallTop
        };
    }

    // Auto-send is skipped only when the page itself had no data.
    // "Nothing flagged" still posts a one-line all-clear so silence never looks like a broken tool.
    function dataHasContent(result) {
        return !!result && state.rawRowCount > 0;
    }

    function buildSlackSections(result, isAuto, siteCode) {
        if (!result) return ['No data'];
        var _nd = new Date();
        var _mo = _nd.getMonth()+1, _dy = _nd.getDate(), _yr = _nd.getFullYear();
        var _hr = _nd.getHours(), _mi = _nd.getMinutes(), _sc = _nd.getSeconds();
        var _ap = _hr >= 12 ? 'PM' : 'AM'; _hr = _hr % 12 || 12;
        var now = _mo + '/' + _dy + '/' + _yr + ', ' + _hr + ':' + String(_mi).padStart(2,'0') + ':' + String(_sc).padStart(2,'0') + ' ' + _ap;
        var ur = parseCurrentUrlRange();
        var hl = ur ? formatHourRange(ur.start, ur.end) : 'Current view';
        var shortMin = CFG.breakShortMin || 15; var shortMax = CFG.breakShortMax || 25; var verifyMax = CFG.breakVerifyMax || 34;
        var sections = [];

        var hdr = [];
        hdr.push((siteCode ? '\uD83C\uDFED ' + siteCode + ' \u2014 ' : '') + 'Support/Indirect and Performance Tracker vkv3');
        hdr.push(now + (isAuto ? ' (auto)' : ''));
        hdr.push('Hour: ' + hl);
        if (CFG.minDurationHours > 0) hdr.push('Min duration: ' + CFG.minDurationHours + 'h (' + state.filteredOutCount + ' excluded)');
        sections.push(hdr.join('\n'));

        if (CFG.trackBreaks) {
            var brk = [];
            if (CFG.trackBreakShort) {
                if (result.breaksShort && result.breaksShort.length) { brk.push('\uD83D\uDFE1 BREAK VIOLATION (' + (shortMin+1) + '\u2013' + shortMax + 'm) \u2014 ' + result.breaksShort.length + ' associates'); result.breaksShort.forEach(function(b) { brk.push('  ' + b.associate + ' \u2022 ~' + Math.round(b.durationMinutes) + 'm'); }); }
                else if (CFG.showAllClear) { brk.push('\u2705 No break violations (' + (shortMin+1) + '\u2013' + shortMax + 'm)'); }
            }
            if (CFG.trackBreakVerify) {
                if (brk.length && result.breaksVerify && (result.breaksVerify.length || CFG.showAllClear)) brk.push('');
                if (result.breaksVerify && result.breaksVerify.length) { brk.push('\uD83D\uDFE0 VERIFY BREAK (' + (shortMax+1) + '\u2013' + verifyMax + 'm) \u2014 ' + result.breaksVerify.length + ' associates'); result.breaksVerify.forEach(function(b) { brk.push('  ' + b.associate + ' \u2022 ~' + Math.round(b.durationMinutes) + 'm'); }); }
                else if (CFG.showAllClear) { brk.push('\u2705 No verify break (' + (shortMax+1) + '\u2013' + verifyMax + 'm)'); }
            }
            if (CFG.trackBreakExtended) {
                if (brk.length && result.breaksExtended && (result.breaksExtended.length || CFG.showAllClear)) brk.push('');
                if (result.breaksExtended && result.breaksExtended.length) { brk.push('\uD83D\uDD34 LUNCH VIOLATION (' + (verifyMax+1) + 'm+) \u2014 ' + result.breaksExtended.length + ' associates'); result.breaksExtended.forEach(function(b) { brk.push('  ' + b.associate + ' \u2022 ~' + Math.round(b.durationMinutes) + 'm'); }); }
                else if (CFG.showAllClear) { brk.push('\u2705 No lunch violations (' + (verifyMax+1) + 'm+)'); }
            }
            if (brk.length) sections.push(brk.join('\n'));
        }

        var FN_DEFS = [
            [CFG.trackIdle, result.idles, '\uD83D\uDCA4', 'IDLE'],
            [CFG.trackPunchIn, result.punchins, '\uD83D\uDFE1', 'PUNCH-IN'],
            [CFG.trackAdmin, result.admins, '\uD83D\uDDA5\uFE0F', 'ADMIN'],
            [CFG.trackDowntime, result.downtimes, '\uD83D\uDD34', 'DOWNTIME'],
            [CFG.trackLogout, result.logouts, '\uD83D\uDEAA', 'LOGOUT'],
            [CFG.trackMyMetrics, result.mymetrics, '\uD83D\uDCCA', 'MY METRICS'],
            [CFG.trackIndirectTask, result.indirecttasks, '\uD83D\uDD27', 'INDIRECT TASK TOOL'],
            [CFG.trackTraining, result.trainings, '\uD83D\uDCDA', 'TRAINING'],
            [CFG.trackUnpack, result.unpacks, '\uD83D\uDCE6', 'UNPACK'],
            [CFG.trackStart, result.starts, '\u23F8\uFE0F', 'START'],
            [CFG.trackCRG, result.crgs, '\uD83D\uDCCB', 'CRG'],
        ];
        FN_DEFS.forEach(function(def) {
            var enabled = def[0], list = def[1], icon = def[2], label = def[3];
            if (!enabled) return;
            var L = [];
            if (list && list.length) {
                L.push(icon + ' ' + label + ' (' + list.length + ')');
                list.forEach(function(b) { L.push('  ' + b.associate + ' \u2022 ' + toMin(b.durationNum)); });
            } else if (CFG.showAllClear) {
                L.push('\u2705 No ' + label.toLowerCase() + ' associates');
            }
            if (L.length) sections.push(L.join('\n'));
        });

        if (CFG.showOverallRate && (CFG.showTopPerformers || CFG.showBottomPerformers) && result.overallBottom && result.overallTop) {
            var hasOverall = false; CFG.roles.forEach(function(r) { if ((CFG.showBottomPerformers && (result.overallBottom[r]||[]).length) || (CFG.showTopPerformers && (result.overallTop[r]||[]).length)) hasOverall = true; });
            if (hasOverall) {
                var ov = ['\uD83C\uDF10 OVERALL RATES', '------------------------------'];
                CFG.roles.forEach(function(role) {
                    var bList = CFG.showBottomPerformers ? (result.overallBottom[role] || []) : []; var tList = CFG.showTopPerformers ? (result.overallTop[role] || []) : [];
                    if (!bList.length && !tList.length) return; ov.push('  ' + roleLabel(role));
                    if (tList.length) { ov.push('    \uD83C\uDFC6 Top ' + CFG.topN); tList.forEach(function(a, i) { var medal = i < 3 ? TOP_MEDALS[i] : (i+1)+'.'; ov.push('    ' + medal + ' ' + a.associate + ' \u2022 Rate: ' + a.rate + ' | Units: ' + a.totalUnits + ' | Min: ' + Math.round(a.durationRound*60) + 'm'); }); }
                    if (bList.length) { ov.push('    \u26A0\uFE0F Bottom ' + CFG.bottomN); bList.forEach(function(a, i) { ov.push('    ' + (i+1) + '. ' + a.associate + ' \u2022 Rate: ' + a.rate + ' | Units: ' + a.totalUnits + ' | Min: ' + Math.round(a.durationRound*60) + 'm'); }); }
                });
                sections.push(ov.join('\n'));
            }
        }
        if (CFG.showZoneRates) {
            if (CFG.showTopPerformers) {
                var hasTop = false; CFG.zones.forEach(function(z) { CFG.roles.forEach(function(r) { if ((result.top[z] && result.top[z][r] || []).length) hasTop = true; }); });
                if (hasTop) {
                    var tp = ['\uD83C\uDFC6 TOP ' + CFG.topN + ' (by zone)', '------------------------------'];
                    CFG.zones.forEach(function(z) {
                        var zh = false; CFG.roles.forEach(function(r) { if ((result.top[z] && result.top[z][r] || []).length) zh = true; }); if (!zh) return;
                        tp.push('  ' + ICONS[z] + ' ' + ZONE_LABELS[z]);
                        CFG.roles.forEach(function(role) { var list = result.top[z] && result.top[z][role] || []; if (!list.length) return; tp.push('    ' + roleLabel(role)); list.forEach(function(a, i) { var medal = i < 3 ? TOP_MEDALS[i] : (i+1)+'.'; tp.push('    ' + medal + ' ' + a.associate + ' \u2022 Rate: ' + (isNaN(a.rate)?'-':a.rate) + ' | Unit: ' + a.unit + ' | Min: ' + toMin(a.durationNum)); }); });
                    });
                    sections.push(tp.join('\n'));
                }
            }
            var btmLines = ['\u26A0\uFE0F BOTTOM ' + CFG.bottomN + ' (by zone)', '------------------------------'];
            if (CFG.showBottomPerformers) CFG.zones.forEach(function(z) {
                var has = false; CFG.roles.forEach(function(r) { if ((result.bottom[z] && result.bottom[z][r] || []).length) has = true; }); if (!has) return;
                btmLines.push('  ' + ICONS[z] + ' ' + ZONE_LABELS[z]);
                CFG.roles.forEach(function(role) { var list = result.bottom[z] && result.bottom[z][role] || []; if (!list.length) return; var thr = getRateThreshold(role, z); btmLines.push('    ' + roleLabel(role) + (thr > 0 ? ' (< ' + thr + ')' : '')); list.forEach(function(a, i) { btmLines.push('    ' + (i+1) + '. ' + a.associate + ' \u2022 Rate: ' + (isNaN(a.rate)?'-':a.rate) + ' | Unit: ' + a.unit + ' | Min: ' + toMin(a.durationNum)); }); });
            });
            if (btmLines.length > 2) sections.push(btmLines.join('\n'));
        }
        if (sections.length === 1) sections.push('\u2705 All clear \u2014 nothing flagged for the tracked functions this window.');
        return sections;
    }

    function buildSlackMessage(result, isAuto, siteCode) {
        return buildSlackSections(result, isAuto, siteCode).join('\n\n');
    }

    var SLACK_CHUNK_LIMIT = 2500;
    var DIVIDER = '\n' + '-'.repeat(30) + '\n';

    function groupSections(sections) {
        if (!sections || sections.length === 0) return [];
        var header = sections[0];
        var perfSections = [];
        var midSections = [];
        for (var i = 1; i < sections.length; i++) {
            var s = sections[i];
            var firstLine = s.split('\n')[0];
            if (firstLine.indexOf('OVERALL RATES') >= 0 || firstLine.indexOf('TOP ') >= 0 || firstLine.indexOf('BOTTOM ') >= 0) {
                perfSections.push(s);
            } else {
                midSections.push(s);
            }
        }
        var groups = [];
        var current = header.trim();
        for (var j = 0; j < midSections.length; j++) {
            var sec = midSections[j];
            if (sec.length > SLACK_CHUNK_LIMIT) {
                if (current) { groups.push(current.trim()); current = ''; }
                var lines = sec.split('\n'), chunk = '';
                for (var k = 0; k < lines.length; k++) {
                    var candidate = chunk ? chunk + '\n' + lines[k] : lines[k];
                    if (candidate.length > SLACK_CHUNK_LIMIT && chunk) { groups.push(chunk.trim()); chunk = lines[k]; }
                    else { chunk = candidate; }
                }
                if (chunk.trim()) { current = chunk; }
            } else {
                var joined = current ? current + '\n\n' + sec : sec;
                if (joined.length > SLACK_CHUNK_LIMIT && current) { groups.push(current.trim()); current = sec; }
                else { current = joined; }
            }
        }
        if (current.trim()) groups.push(current.trim());
        if (perfSections.length > 0) {
            var perfCombined = perfSections.join('\n\n');
            if (perfCombined.length <= SLACK_CHUNK_LIMIT) { groups.push(perfCombined.trim()); }
            else {
                var pCurrent = '';
                for (var pi = 0; pi < perfSections.length; pi++) {
                    var ps = perfSections[pi];
                    var pJoined = pCurrent ? pCurrent + '\n\n' + ps : ps;
                    if (pJoined.length > SLACK_CHUNK_LIMIT && pCurrent) { groups.push(pCurrent.trim()); pCurrent = ps; }
                    else { pCurrent = pJoined; }
                }
                if (pCurrent.trim()) groups.push(pCurrent.trim());
            }
        }
        return groups;
    }

    function postChunk(text, url) {
        return new Promise(function(resolve, reject) {
            var keys = ['message', 'text', 'body', 'content', 'report'];
            var attempt = 0;
            function tryNext() {
                if (attempt >= keys.length) { reject(new Error('All payload keys failed')); return; }
                var key = keys[attempt]; var pl = {}; pl[key] = sanitizeForSlack(text); attempt++;
                var dataStr = JSON.stringify(pl);
                log('>>> POST key=' + key + ' (' + dataStr.length + ' chars)');
                GM_xmlhttpRequest({
                    method: 'POST', url: url,
                    headers: { 'Content-Type': 'application/json; charset=utf-8' },
                    data: dataStr,
                    onload: function(resp) {
                        state.lastSlackResponse = { status: resp.status, body: resp.responseText };
                        updateSlackResp();
                        var parsed = null; var slackError = '';
                        try { parsed = JSON.parse(resp.responseText); slackError = parsed.error || ''; } catch(e) {}
                        var bodyOk = parsed ? parsed.ok === true : (resp.responseText||'').toLowerCase() === 'ok';
                        log('<<< ' + resp.status + ' ok=' + bodyOk + (slackError ? ' error=' + slackError : '') + ' body=' + resp.responseText.substring(0, 60));
                        if (resp.status >= 200 && resp.status < 300 && bodyOk) { resolve(resp); }
                        else if (slackError === 'invalid_blocks') { reject(new Error('invalid_blocks: Check Slack Workflow Builder.')); }
                        else { tryNext(); }
                    },
                    onerror: function() { tryNext(); },
                    ontimeout: function() { tryNext(); },
                    timeout: 15000,
                });
            }
            tryNext();
        });
    }

    async function sendSlackRequest(msg, url) {
        if (!url) throw new Error('No webhook URL');
        var sections = Array.isArray(msg) ? msg : [msg];
        var groups = groupSections(sections);
        log('Sending ' + groups.length + ' message(s) from ' + sections.length + ' section(s)');
        for (var i = 0; i < groups.length; i++) {
            await postChunk(groups[i], url);
            if (i < groups.length - 1) await sleep(600);
        }
    }

    function updateSlackResp() {
        var el = $i('lt-slack-resp'); if (!el || !state.lastSlackResponse) return;
        el.classList.add('vis');
        var r = state.lastSlackResponse;
        el.innerHTML = '<strong>Last response:</strong> ' + r.status + ' \u00B7 <code>' + esc(r.body||'') + '</code>';
    }

    function getWebhookList() {
        var list = [];
        var siteUrl = siteWebhookFor(state.detectedSite);
        if (siteUrl) list.push({ url: siteUrl, label: state.detectedSite + ' (auto)' });
        if (CFG.additionalWebhooks && CFG.additionalWebhooks.trim()) {
            CFG.additionalWebhooks.split('\n').forEach(function(line) {
                var u = line.trim();
                if (u && u.indexOf('https://') === 0) list.push({ url: u, label: 'additional webhook' });
            });
        }
        var seen = {};
        return list.filter(function(w) { if (seen[w.url]) return false; seen[w.url] = true; return true; });
    }

    async function sendToSlack(isAuto) {
        if (state.slackBusy) return;
        var webhooks = getWebhookList();
        if (webhooks.length === 0) { toast('\u274C No Slack webhook for this site yet', 'err', 6000); reportSendResult(false, 'no webhook configured for site'); return false; }
        if (!state.data) { toast('No data to send', 'err'); return false; }
        if (isAuto && !dataHasContent(state.data)) { log('AUTO-SEND skipped - no rows on page'); return false; }
        var btn = $i('lt-b-slack');
        state.slackBusy = true; if (btn) { btn.classList.add('busy'); btn.textContent = '\u23F3'; }
        try {
            var msg = buildSlackSections(state.data, isAuto, state.detectedSite);
            log('--- ' + (isAuto ? 'AUTO' : 'MANUAL') + ' send to ' + webhooks.length + ' webhook(s) ---');
            var sentCount = 0;
            for (var wi = 0; wi < webhooks.length; wi++) {
                var wh = webhooks[wi];
                try { await sendSlackRequest(msg, wh.url); sentCount++; log('\u2705 Sent to ' + wh.label); }
                catch(e) { log('\u274C Failed ' + wh.label + ': ' + e.message); }
            }
            reportSendResult(sentCount > 0, state.lastSlackResponse ? ('HTTP ' + state.lastSlackResponse.status + ' ' + (state.lastSlackResponse.body || '').substring(0, 80)) : 'no response');
            if (sentCount > 0) {
                var lbl = sentCount === 1 ? '\u2705 Sent to Slack' : '\u2705 Sent to ' + sentCount + ' channels';
                toast(isAuto ? lbl + ' (auto)' : lbl, 'ok', 3000);
                if (btn) { btn.classList.remove('busy'); btn.classList.add('ok'); btn.textContent = '\u2705'; }
                setTimeout(function() { if (btn) { btn.classList.remove('ok'); btn.textContent = '\uD83D\uDCE4'; } }, 3000);
            } else { throw new Error('All webhooks failed'); }
            return true;
        } catch(e) {
            log('\u274C ' + e.message); toast('\u274C Failed: ' + e.message, 'err', 8000);
            if (btn) { btn.classList.remove('busy'); btn.classList.add('err'); btn.textContent = '\u274C'; }
            setTimeout(function() { if (btn) { btn.classList.remove('err'); btn.textContent = '\uD83D\uDCE4'; } }, 5000);
            return false;
        } finally { state.slackBusy = false; renderDebug(); }
    }

    async function testSlack() {
        var webhooks = getWebhookList();
        if (webhooks.length === 0) { toast('\u274C No webhook configured', 'err'); return; }
        log('--- Test send ---'); toast('Sending test to ' + webhooks.length + ' webhook(s)...', 'info', 5000);
        var msg = 'Test from Cost Cut Tracking v7.1' + (state.detectedSite ? ' - ' + state.detectedSite : '');
        var sentCount = 0;
        for (var wi = 0; wi < webhooks.length; wi++) {
            try { await sendSlackRequest(msg, webhooks[wi].url); sentCount++; log('\u2705 Test OK: ' + webhooks[wi].label); }
            catch(e) { log('\u274C Test failed ' + webhooks[wi].label + ': ' + e.message); }
        }
        if (sentCount > 0) toast('\u2705 Test sent to ' + sentCount + '/' + webhooks.length + ' webhook(s)', 'ok', 5000);
        else toast('\u274C All tests failed', 'err', 8000);
        renderDebug();
    }

    var _selectTimeRangeBusy = false;
    var _autoSendBusy = false;
    var _viewRange = null;
    async function selectTimeRange(rangeOverride) {
        if (_selectTimeRangeBusy) { log('selectTimeRange: already running, skipping'); return false; }
        _selectTimeRangeBusy = true;
        var rangeLabel = rangeOverride || CFG.autoSendTimeRange || 'Previous Hour';
        try {
            log('Selecting time range: ' + rangeLabel);
            var docs = [document];
            var frames = document.querySelectorAll('iframe');
            for (var fi = 0; fi < frames.length; fi++) {
                try { docs.push(frames[fi].contentDocument || frames[fi].contentWindow.document); } catch(e) {}
            }
            for (var di = 0; di < docs.length; di++) {
                var doc = docs[di];
                var clockBtn = null;
                var clockPath = doc.querySelector('path[d="M12 6v6l4 4"]');
                if (clockPath) { clockBtn = clockPath.closest('button'); }
                if (!clockBtn) {
                    var allPaths = Array.from(doc.querySelectorAll('path'));
                    var matchPath = allPaths.find(function(p) { return (p.getAttribute('d') || '').indexOf('M12 6v6l4 4') >= 0; });
                    if (matchPath) clockBtn = matchPath.closest('button');
                }
                if (!clockBtn) { log('Clock button not found in doc ' + di); continue; }
                log('Found clock button, clicking...');
                clockBtn.click();
                await sleep(800);
                var panel = document.getElementById('lt-panel');
                function findRangeBtn(searchDoc) {
                    return Array.from(searchDoc.querySelectorAll('button')).find(function(b) {
                        return b.textContent.trim() === rangeLabel && !(panel && panel.contains(b)) && b.offsetParent !== null;
                    });
                }
                var target = findRangeBtn(document) || findRangeBtn(doc);
                if (target) {
                    target.click();
                    log('Time range set: ' + rangeLabel);
                    var waited = 0;
                    while (waited < 8000) {
                        await sleep(500); waited += 500;
                        var testRows = extractRows();
                        if (testRows.length > 0) { log('Data loaded after ' + waited + 'ms (' + testRows.length + ' rows)'); return true; }
                    }
                    log('WARNING: No rows after ' + waited + 'ms');
                    return true;
                }
                var visibleBtns = Array.from(document.querySelectorAll('button'))
                    .filter(function(b) { return b.offsetParent !== null && !(panel && panel.contains(b)); })
                    .map(function(b) { return '"' + b.textContent.trim() + '"'; })
                    .filter(function(t) { return t.length > 2 && t.length < 30; });
                log('Visible HWMS buttons: ' + visibleBtns.join(', '));
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                await sleep(300);
                log('Target button "' + rangeLabel + '" not found');
            }
            log('WARNING: selectTimeRange failed for "' + rangeLabel + '"');
            return false;
        } finally { _selectTimeRangeBusy = false; }
    }

    var _lastHour = new Date().getHours();
    var _lastRangeUpdate = 0;
    function startTimeRangeWatcher() {
        setInterval(function() {
            var h = new Date().getHours();
            var now = Date.now();
            if (h !== _lastHour && (now - _lastRangeUpdate) > 300000) {
                _lastHour = h; _lastRangeUpdate = now;
                log('Hour boundary: updating time range');
                selectTimeRange().then(function() { refresh(); });
            }
        }, 15000);
    }

    // Who sends: browsers with the admin PAT are PRIMARY senders and record each send in the
    // shared Gist. Every other browser is a BACKUP: it stays quiet while a primary is posting,
    // and only takes over if no shared send was recorded for interval + 15 min.
    var BACKUP_GRACE_MS = 15 * 60000;
    var RETRY_AFTER_FAIL_MS = 10 * 60000;

    async function autoScrapeAndSend() {
        if (_autoSendBusy) { log('autoScrapeAndSend: already running, skipping'); return; }
        _autoSendBusy = true;
        try {
            log('--- AUTO scrape and send (' + senderRole() + ') ---');
            if (state.detectedSite) {
                var sharedLast = await gistGetLastSend(state.detectedSite);
                var wait = intervalMs() * 0.9 + (hasPat() ? 0 : BACKUP_GRACE_MS);
                if (sharedLast && (Date.now() - sharedLast) < wait) {
                    log('Another manager posted at ' + new Date(sharedLast).toLocaleTimeString() + ' - skipping this round');
                    // Line our countdown up with the shared send (+ grace for backups)
                    GM_setValue('lt_last_send', String(sharedLast + (hasPat() ? 0 : BACKUP_GRACE_MS)));
                    return;
                }
            }
            setStatus('Selecting time range...');
            try { await selectTimeRange(); } catch(e) { log('selectTimeRange error: ' + e.message); }
            setStatus('Loading data...');
            var rows = await waitForRows(20000);
            if (!rows || rows.length === 0) {
                log('Auto-send: no rows on page - retrying in 10 min');
                setStatus('Auto-send: no data, retrying in 10 min');
                GM_setValue('lt_last_send', String(Date.now() - intervalMs() + RETRY_AFTER_FAIL_MS));
                return;
            }
            state.data = process(rows); render(state.data); state.lastUpdate = new Date();
            var nd = state.lastUpdate, h = nd.getHours(), m = nd.getMinutes(), ap = h >= 12 ? 'PM' : 'AM';
            h = h % 12 || 12;
            setStatus('Updated ' + h + ':' + String(m).padStart(2,'0') + ' ' + ap + ' · ' + state.rawRowCount + ' rows');
            updateSiteBar();
            var ok = false;
            try { ok = await sendToSlack(true); } catch(e) { log('Auto-send error: ' + e.message); }
            _viewRange = null;
            if (ok) {
                setLastSendTs();
                if (state.detectedSite) gistSetLastSend(state.detectedSite);
            } else {
                log('Auto-send failed - retrying in 10 min');
                GM_setValue('lt_last_send', String(Date.now() - intervalMs() + RETRY_AFTER_FAIL_MS));
            }
        } catch(e) {
            log('autoScrapeAndSend error: ' + e.message);
        } finally {
            _autoSendBusy = false;
            startScheduler();
        }
    }

    function startScheduler() {
        if (state.autoSendTimer) clearTimeout(state.autoSendTimer);
        if (state.countdownTimer) clearInterval(state.countdownTimer);
        state.autoSendTimer = state.countdownTimer = null;
        if (!CFG.autoSendEnabled) { updateAutoBar(); return; }
        var delay = nextSendMs();
        log('Next auto-send in ' + Math.round(delay/1000) + 's');
        state.autoSendTimer = setTimeout(function() { state.autoSendTimer = null; autoScrapeAndSend(); }, Math.max(delay, 10000));
        state.countdownTimer = setInterval(updateAutoBar, 10000);
        updateAutoBar();
    }

    async function waitForRows(maxWaitMs) {
        var deadline = Date.now() + maxWaitMs; var lastCount = 0; var stableCount = 0;
        while (Date.now() < deadline) {
            var rows = extractRows();
            if (rows.length > 0) {
                if (rows.length === lastCount) { stableCount++; if (stableCount >= 3) { log('Data stable at ' + rows.length); return rows; } }
                else { stableCount = 0; }
                lastCount = rows.length;
            }
            setStatus('Waiting... ' + rows.length + ' rows (' + Math.round((deadline - Date.now())/1000) + 's left)');
            await sleep(CFG.pollInterval);
        }
        var finalRows = extractRows(); log('Timeout - final: ' + finalRows.length + ' rows'); return finalRows;
    }

    // ── VIEW DROPDOWN DEFINITIONS ──────────────────────────────────────
    // Each view: value, label, and which track-flag gates it (null = always shown)
    var VIEW_DEFS = [
        { v: 'all',          label: '\uD83D\uDCCB All (full report)',    gate: null },
        { v: 'breaks',       label: '\uD83D\uDEA8 Breaks (all tiers)',   gate: 'trackBreaks' },
        { v: 'idles',        label: '\uD83D\uDCA4 Idle',                 gate: 'trackIdle' },
        { v: 'punchins',     label: '\uD83D\uDFE1 Punch-In',             gate: 'trackPunchIn' },
        { v: 'admins',       label: '\uD83D\uDDA5\uFE0F Admin',          gate: 'trackAdmin' },
        { v: 'downtimes',    label: '\uD83D\uDD34 Downtime',             gate: 'trackDowntime' },
        { v: 'logouts',      label: '\uD83D\uDEAA Logout',               gate: 'trackLogout' },
        { v: 'mymetrics',    label: '\uD83D\uDCCA My Metrics',           gate: 'trackMyMetrics' },
        { v: 'indirecttasks',label: '\uD83D\uDD27 Indirect Task',        gate: 'trackIndirectTask' },
        { v: 'trainings',    label: '\uD83D\uDCDA Training',             gate: 'trackTraining' },
        { v: 'unpacks',      label: '\uD83D\uDCE6 Unpack',               gate: 'trackUnpack' },
        { v: 'starts',       label: '\u23F8\uFE0F Start',                gate: 'trackStart' },
        { v: 'crgs',         label: '\uD83D\uDCCB CRG',                  gate: 'trackCRG' },
        { v: 'overall',      label: '\uD83C\uDF10 Overall Rates',        gate: 'showOverallRate' },
        { v: 'zone',         label: '\uD83D\uDDFA\uFE0F Rates by Zone',  gate: 'showZoneRates' },
    ];

    // Function views that share the same simple (associate, minutes) table
    var FN_VIEW_MAP = {
        idles:         { key: 'idles',         avatar: '\uD83D\uDCA4', author: 'Idle',          color: 'purple', icon: '\uD83D\uDCA4', title: 'Idle Associates' },
        punchins:      { key: 'punchins',      avatar: '\uD83D\uDFE1', author: 'Punch-In',      color: 'yellow', icon: '\uD83D\uDFE1', title: 'Punch-In Associates' },
        admins:        { key: 'admins',        avatar: '\uD83D\uDDA5\uFE0F', author: 'Admin',    color: 'blue',   icon: '\uD83D\uDDA5\uFE0F', title: 'Admin Associates' },
        downtimes:     { key: 'downtimes',     avatar: '\uD83D\uDD34', author: 'Downtime',      color: 'red',    icon: '\uD83D\uDD34', title: 'Downtime Associates' },
        logouts:       { key: 'logouts',       avatar: '\uD83D\uDEAA', author: 'Logout',        color: 'orange', icon: '\uD83D\uDEAA', title: 'Logout Associates' },
        mymetrics:     { key: 'mymetrics',     avatar: '\uD83D\uDCCA', author: 'My Metrics',    color: 'blue',   icon: '\uD83D\uDCCA', title: 'My Metrics Associates' },
        indirecttasks: { key: 'indirecttasks', avatar: '\uD83D\uDD27', author: 'Indirect Task', color: 'purple', icon: '\uD83D\uDD27', title: 'Indirect Task Tool' },
        trainings:     { key: 'trainings',     avatar: '\uD83D\uDCDA', author: 'Training',      color: 'blue',   icon: '\uD83D\uDCDA', title: 'Training Associates' },
        unpacks:       { key: 'unpacks',       avatar: '\uD83D\uDCE6', author: 'Unpack',        color: 'orange', icon: '\uD83D\uDCE6', title: 'Unpack Associates' },
        starts:        { key: 'starts',        avatar: '\u23F8\uFE0F', author: 'Start',         color: 'yellow', icon: '\u23F8\uFE0F', title: 'Start Associates' },
        crgs:          { key: 'crgs',          avatar: '\uD83D\uDCCB', author: 'CRG',           color: 'purple', icon: '\uD83D\uDCCB', title: 'CRG Associates' },
    };

    function msgBlock(avatar, author, ts, content) {
        return '<div class="lt-msg"><div class="lt-msg-avatar">' + avatar + '</div><div class="lt-msg-content"><div class="lt-msg-header"><span class="lt-msg-author">' + author + '</span><span class="lt-msg-ts">' + ts + '</span></div><div class="lt-msg-text">' + content + '</div></div></div>';
    }

    function simpleTable(headers, rows) {
        var h = '<table class="lt-t"><tr>' + headers.map(function(hh) { return '<th>' + hh + '</th>'; }).join('') + '</tr>';
        rows.forEach(function(r) {
            h += '<tr class="' + (r.cls || '') + '">' + r.cells.map(function(c) { return '<td class="' + (c.cls || '') + '">' + c.v + '</td>'; }).join('') + '</tr>';
        });
        return h + '</table>';
    }

    function attach(colorClass, titleIcon, title, content) {
        return '<div class="lt-attach ' + colorClass + '"><div class="lt-attach-title">' + titleIcon + ' ' + title + '</div>' + content + '</div>';
    }

    // Build a clickable link to an associate's breakdown page (opens new tab).
    // URL format confirmed from HWMS: associatebreakdown/search?associates=<login>
    var ASSOC_BASE = 'https://na.store-management.f3.amazon.dev/labortracking/associatebreakdown/search';
    function assocLink(login) {
        var safe = esc(login);
        if (!login) return safe;
        var url = ASSOC_BASE + '?associates=' + encodeURIComponent(login) + '&relativeDateTimeRange=' + encodeURIComponent('days:1');
        return '<a class="lt-assoc" href="' + url + '" target="_blank" rel="noopener noreferrer" title="Open ' + safe + '\u2019s breakdown page">' + safe + '</a>';
    }

    function fnRows(list) {
        return list.map(function(b) {
            var mins = Math.round(b.durationNum * 60);
            return { cls: '', cells: [
                { v: assocLink(b.associate) },
                { v: mins + 'm', cls: 'tt ' + (mins >= 30 ? 'brk-extended' : 'brk-short') }
            ]};
        });
    }

    // ── PER-SECTION RENDERERS — each returns an HTML string (or '') ─────
    function renderBreaks(result, now, single) {
        var shortMin = CFG.breakShortMin || 15, shortMax = CFG.breakShortMax || 25, verifyMax = CFG.breakVerifyMax || 34;
        var h = '';
        if (!CFG.trackBreaks) return single ? '<div class="lt-nd">Breaks tracking is turned off in settings.</div>' : '';
        if (CFG.trackBreakShort) {
            if (result.breaksShort && result.breaksShort.length) { var bsR = result.breaksShort.map(function(b) { return { cls: '', cells: [{ v: assocLink(b.associate) }, { v: Math.round(b.durationMinutes) + 'm', cls: 'tt brk-short' }] }; }); h += msgBlock('\uD83D\uDFE1', 'Breaks', now, attach('yellow', '\uD83D\uDFE1', 'Break Violation (' + (shortMin+1) + '-' + shortMax + 'm) \u2014 ' + result.breaksShort.length, simpleTable(['Associate', 'Min'], bsR))); }
            else if (single) { h += msgBlock('\u2705', 'Breaks', now, '<span class="lt-empty-ok">No break violations (' + (shortMin+1) + '-' + shortMax + 'm)</span>'); }
        }
        if (CFG.trackBreakVerify) {
            if (result.breaksVerify && result.breaksVerify.length) { var bvR = result.breaksVerify.map(function(b) { return { cls: '', cells: [{ v: assocLink(b.associate) }, { v: Math.round(b.durationMinutes) + 'm', cls: 'tt brk-verify' }] }; }); h += msgBlock('\uD83D\uDFE0', 'Breaks', now, attach('orange', '\uD83D\uDFE0', 'Verify Break (' + (shortMax+1) + '-' + verifyMax + 'm) \u2014 ' + result.breaksVerify.length, simpleTable(['Associate', 'Min'], bvR))); }
            else if (single) { h += msgBlock('\u2705', 'Breaks', now, '<span class="lt-empty-ok">No verify break (' + (shortMax+1) + '-' + verifyMax + 'm)</span>'); }
        }
        if (CFG.trackBreakExtended) {
            if (result.breaksExtended && result.breaksExtended.length) { var beR = result.breaksExtended.map(function(b) { return { cls: '', cells: [{ v: assocLink(b.associate) }, { v: Math.round(b.durationMinutes) + 'm', cls: 'tt brk-extended' }] }; }); h += msgBlock('\uD83D\uDD34', 'Breaks', now, attach('red', '\uD83D\uDD34', 'Lunch Violation (' + (verifyMax+1) + 'm+) \u2014 ' + result.breaksExtended.length, simpleTable(['Associate', 'Min'], beR))); }
            else if (single) { h += msgBlock('\u2705', 'Breaks', now, '<span class="lt-empty-ok">No lunch violations (' + (verifyMax+1) + 'm+)</span>'); }
        }
        // In 'all' mode, if nothing fired at all, show a single clean confirmation
        if (!h && !single) { h += msgBlock('\u2705', 'Breaks', now, '<span class="lt-empty-ok">No break violations</span>'); }
        return h;
    }

    function renderFn(result, viewKey, now, single) {
        var def = FN_VIEW_MAP[viewKey]; if (!def) return '';
        var list = result[def.key] || [];
        if (list.length) {
            return msgBlock(def.avatar, def.author, now, attach(def.color, def.icon, def.title + ' (' + list.length + ')', simpleTable(['Associate', 'Min'], fnRows(list))));
        }
        // Empty: only show the green "No X" when this view is explicitly selected
        if (single) return msgBlock('\u2705', def.author, now, '<span class="lt-empty-ok">No ' + def.author.toLowerCase() + ' associates right now</span>');
        return '';
    }

    function renderOverall(result, now, single) {
        if (!result.overallBottom || !result.overallTop) return single ? '<div class="lt-nd">No overall rate data.</div>' : '';
        var hasOverall = false; CFG.roles.forEach(function(r) { if ((CFG.showBottomPerformers && (result.overallBottom[r]||[]).length) || (CFG.showTopPerformers && (result.overallTop[r]||[]).length)) hasOverall = true; });
        if (!hasOverall) return single ? msgBlock('\uD83C\uDF10', 'Rates', now, '<span class="lt-nd">No overall rate data yet.</span>') : '';
        var oc = '<div>';
        CFG.roles.forEach(function(role) {
            var bList = CFG.showBottomPerformers ? (result.overallBottom[role] || []) : []; var tList = CFG.showTopPerformers ? (result.overallTop[role] || []) : [];
            if (!bList.length && !tList.length) return;
            oc += '<div style="font-weight:700;font-size:12px;color:#b9b9bd;text-transform:uppercase;margin:7px 0 3px">' + (role === 'Pack' ? '\uD83D\uDCE6' : '\uD83D\uDCE5') + ' ' + role + 'ers</div>';
            if (tList.length) { oc += '<div class="lt-overall-sub">\uD83C\uDFC6 Top ' + CFG.topN + '</div>'; var tRowsO = tList.map(function(a, i) { var medal = i < TOP_MEDALS.length ? TOP_MEDALS[i] : String(i+1); return { cls: 't' + (i < 3 ? i+1 : ''), cells: [{ v: medal }, { v: assocLink(a.associate) }, { v: esc(a.zonesStr) }, { v: a.rate, cls: 'rt' }, { v: a.totalUnits, cls: 'ut' }, { v: Math.round(a.durationRound*60) + 'm', cls: 'tt' }] }; }); oc += simpleTable(['#','Associate','Zones','Rate','Units','Min'], tRowsO); }
            if (bList.length) { oc += '<div class="lt-overall-sub">\u26A0\uFE0F Bottom ' + CFG.bottomN + '</div>'; var bRowsO = bList.map(function(a, i) { return { cls: 'r' + (i+1), cells: [{ v: i+1 }, { v: assocLink(a.associate) }, { v: esc(a.zonesStr) }, { v: a.rate, cls: 'rt' }, { v: a.totalUnits, cls: 'ut' }, { v: Math.round(a.durationRound*60) + 'm', cls: 'tt' }] }; }); oc += simpleTable(['#','Associate','Zones','Rate','Units','Min'], bRowsO); }
        });
        oc += '</div>';
        return msgBlock('\uD83C\uDF10', 'Rates', now, attach('blue', '\uD83C\uDF10', 'Overall Rates - All Zones', oc));
    }

    function renderZone(result, now, single) {
        var h = '';
        if (CFG.showTopPerformers) {
            var hasTopZ = false; CFG.zones.forEach(function(z) { CFG.roles.forEach(function(r) { if ((result.top[z] && result.top[z][r] || []).length) hasTopZ = true; }); });
            if (hasTopZ) {
                var tc = '';
                CFG.zones.forEach(function(z) {
                    var zh = false; CFG.roles.forEach(function(r) { if ((result.top[z] && result.top[z][r] || []).length) zh = true; }); if (!zh) return;
                    tc += '<span class="lt-zone-pill ' + z.toLowerCase() + '">' + ICONS[z] + ' ' + ZONE_LABELS[z] + '</span>';
                    CFG.roles.forEach(function(role) {
                        var list = result.top[z] && result.top[z][role] || []; if (!list.length) return;
                        tc += '<div style="font-size:11px;font-weight:700;color:#b9b9bd;text-transform:uppercase;margin:4px 0 2px">' + (role === 'Pack' ? '\uD83D\uDCE6' : '\uD83D\uDCE5') + ' ' + role + 'ers</div>';
                        var tRowsZ = list.map(function(a, i) { var medal = i < TOP_MEDALS.length ? TOP_MEDALS[i] : String(i+1); return { cls: 't' + (i < 3 ? i+1 : ''), cells: [{ v: medal }, { v: assocLink(a.associate) }, { v: isNaN(a.rate) ? '-' : a.rate, cls: 'rt' }, { v: esc(a.unit), cls: 'ut' }, { v: toMin(a.durationNum), cls: 'tt' }] }; });
                        tc += simpleTable(['#','Associate','Rate','Unit','Min'], tRowsZ);
                    });
                });
                h += msgBlock('\uD83C\uDFC6', 'Top perfs', now, attach('yellow', '\uD83C\uDFC6', 'Top ' + CFG.topN + ' Performers (by zone)', tc));
            }
        }
        var bc = '';
        if (CFG.showBottomPerformers) CFG.zones.forEach(function(z) {
            var zhB = false; CFG.roles.forEach(function(r) { if ((result.bottom[z] && result.bottom[z][r] || []).length) zhB = true; }); if (!zhB) return;
            bc += '<span class="lt-zone-pill ' + z.toLowerCase() + '">' + ICONS[z] + ' ' + ZONE_LABELS[z] + '</span>';
            CFG.roles.forEach(function(role) {
                var list = result.bottom[z] && result.bottom[z][role] || [];
                var thr = getRateThreshold(role, z);
                bc += '<div style="font-size:11px;font-weight:700;color:#b9b9bd;text-transform:uppercase;margin:4px 0 2px">' + (role === 'Pack' ? '\uD83D\uDCE6' : '\uD83D\uDCE5') + ' ' + roleLabel(role) + (thr > 0 ? ' &lt;' + thr : '') + '</div>';
                if (!list.length) { bc += '<div class="lt-nd">No data</div>'; }
                else { var bRowsZ = list.map(function(a, i) { return { cls: 'r' + (i+1), cells: [{ v: i+1 }, { v: assocLink(a.associate) }, { v: isNaN(a.rate) ? '-' : a.rate, cls: 'rt' }, { v: esc(a.unit), cls: 'ut' }, { v: toMin(a.durationNum), cls: 'tt' }] }; }); bc += simpleTable(['#','Associate','Rate','Unit','Min'], bRowsZ); }
            });
        });
        if (bc) h += msgBlock('\u26A0\uFE0F', 'Bottom Perfs', now, attach('orange', '\u26A0\uFE0F', 'Bottom ' + CFG.bottomN + ' Performers (by zone)', bc));
        if (!h && single) h += msgBlock('\u2705', 'Rates', now, '<span class="lt-nd">No zone rate data yet.</span>');
        return h;
    }

    // ── MAIN RENDER — honors state.selectedView ────────────────────────
    function render(result) {
        var body = $i('lt-body'); if (!body) return;
        if (!result) { body.innerHTML = '<div class="lt-load">\uD83D\uDD0D No data found</div>'; return; }
        var now = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
        var view = state.selectedView || 'breaks';
        var h = '';
        if (CFG.minDurationHours > 0) h += '<div class="lt-dur-note">\u23F1\uFE0F Excluding duration &lt; ' + CFG.minDurationHours + 'h \u00B7 ' + state.filteredOutCount + ' excluded</div>';

        if (view === 'all') {
            // Full report, but empty functions are suppressed so it stays readable
            h += renderBreaks(result, now, false);
            Object.keys(FN_VIEW_MAP).forEach(function(k) { h += renderFn(result, k, now, false); });
            if (CFG.showOverallRate) h += renderOverall(result, now, false);
            if (CFG.showZoneRates) h += renderZone(result, now, false);
            if (!h.replace(/<div class="lt-dur-note[\s\S]*?<\/div>/, '').trim()) {
                h += msgBlock('\u2705', 'All clear', now, '<span class="lt-empty-ok">Nothing flagged across any tracked function right now.</span>');
            }
        } else if (view === 'breaks') {
            h += renderBreaks(result, now, true);
        } else if (view === 'overall') {
            h += renderOverall(result, now, true);
        } else if (view === 'zone') {
            h += renderZone(result, now, true);
        } else if (FN_VIEW_MAP[view]) {
            h += renderFn(result, view, now, true);
        } else {
            h += renderBreaks(result, now, true);
        }

        body.innerHTML = h;
    }

    function populateViewSelect() {
        var sel = $i('lt-view-select'); if (!sel) return;
        var html = '';
        VIEW_DEFS.forEach(function(d) {
            // Hide views whose tracking gate is turned off (except 'all')
            if (d.gate && d.gate !== null && !CFG[d.gate]) return;
            if ((d.v === 'overall' || d.v === 'zone') && !CFG.showTopPerformers && !CFG.showBottomPerformers) return;
            var selected = (state.selectedView === d.v) ? ' selected' : '';
            html += '<option value="' + d.v + '"' + selected + '>' + d.label + '</option>';
        });
        sel.innerHTML = html;
        // If the previously-selected view got hidden by a gate, fall back to breaks/all
        if (!Array.from(sel.options).some(function(o) { return o.value === state.selectedView; })) {
            state.selectedView = CFG.trackBreaks ? 'breaks' : 'all';
            sel.value = state.selectedView;
        }
    }

    function buildThresholdGrid() {
        var h = '<div class="thr-grid"><div></div>';
        CFG.zones.forEach(function(z) { h += '<div class="thr-zone">' + ZONE_LABELS[z] + '</div>'; });
        CFG.roles.forEach(function(role) {
            h += '<div class="thr-label">' + (role === 'Pack' ? '\uD83D\uDCE6' : '\uD83D\uDCE5') + ' ' + role + '</div>';
            CFG.zones.forEach(function(z) { h += '<input type="number" min="0" max="9999" class="thr-input" data-role="' + role + '" data-zone="' + z + '" value="' + getRateThreshold(role, z) + '" placeholder="0">'; });
        });
        return h + '</div>';
    }

    function doExpand(panel) {
        state.collapsed = false; panel.classList.remove('collapsed'); panel.style.width = ''; panel.style.maxHeight = '';
        var colBtn = $i('lt-b-col'); if (colBtn) { colBtn.textContent = '\u2014'; colBtn.title = 'Collapse'; }
    }

    function buildPanel() {
        var panel = document.getElementById('lt-panel'); if (panel) panel.remove();
        panel = document.createElement('div'); panel.id = 'lt-panel';
        if (state.collapsed) panel.classList.add('collapsed');
        var ur = parseCurrentUrlRange(); var hl = ur ? formatHourRange(ur.start, ur.end) : '';
        var html = '';

        html += '<div id="lt-hdr"><h3>\u2702\uFE0F Cost Cut <span class="ws-name">#ops</span><span id="lt-site-badge" class="site-badge unknown">...</span></h3>';
        html += '<div class="g">';
        html += '<button id="lt-b-slack" class="slack-btn" title="Send to Slack now">\uD83D\uDCE4</button>';
        html += '<button id="lt-b-cfg" title="Settings">\u2699\uFE0F</button>';
        html += '<button id="lt-b-dbg" title="Debug">\uD83D\uDC1B</button>';
        html += '<button id="lt-b-ref" title="Refresh">\uD83D\uDD04</button>';
        html += '<button id="lt-b-col" title="Collapse">\u2014</button>';
        html += '<button id="lt-b-cls" title="Close">\u2715</button>';
        html += '</div></div>';

        html += '<div id="lt-channel-bar"><span class="ch-name">\uD83D\uDD12 labor-tracking</span>';
        html += '<span class="ch-time" id="lt-ch-time"></span></div>';

        // Data window label — what time range the numbers below actually cover
        html += '<div id="lt-range-bar"><span class="range-ico">\uD83D\uDCC5</span><span class="range-lbl">Data window:</span><span class="range-val" id="lt-range-val">' + (hl || 'detecting...') + '</span></div>';

        // Single-view dropdown
        html += '<div id="lt-view-bar"><label for="lt-view-select">Showing</label><select id="lt-view-select"></select></div>';

        // View-only quick range buttons (does NOT affect auto-send range)
        html += '<div id="lt-viewrange-bar"><span class="vr-lbl">View range:</span>';
        ['Current Hour','Previous Hour','Previous 4 Hours','Current Day','Previous Day'].forEach(function(opt) {
            var isCurrent = ((_viewRange || CFG.autoSendTimeRange) === opt);
            html += '<button class="vr-btn' + (isCurrent ? ' active' : '') + '" data-range="' + opt + '">' + opt + '</button>';
        });
        html += '</div>';

        html += '<div id="lt-site-bar">Detecting site...</div>';
        html += '<div id="lt-auto-bar"></div>';

        html += buildConfigPanel();

        html += '<div id="lt-dbg"></div>';
        html += '<div id="lt-body"><div class="lt-load"><span class="lt-spin"></span> Loading data...</div></div>';
        html += '<div id="lt-status"><span id="lt-st-txt">Initializing...</span><span class="link" id="lt-st-ref">\u21BB refresh</span></div>';

        panel.innerHTML = html;
        document.body.appendChild(panel);

        populateViewSelect();

        setInterval(function() { var ct = $i('lt-ch-time'); if (ct) ct.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }); }, 10000);
        var ct = $i('lt-ch-time'); if (ct) ct.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });

        updateSiteBar(); updateWebhookStatus(); updateRangeBar();
        setInterval(function() { updateSiteBar(); updateWebhookStatus(); updateRangeBar(); }, 15000);

        wirePanel(panel);
    }

    function buildConfigPanel() {
        var html = '<div id="lt-cfg">';
        html += '<div style="background:#1a1d21;border-bottom:1px solid #2f3136;padding:8px 15px;display:flex;align-items:center;justify-content:space-between">';
        html += '<span id="lt-sync-status" style="font-size:12px;color:#a7a7a7">\u23F3 Not yet synced</span>';
        html += '<span id="lt-sync-now" style="font-size:12px;color:#4fc0f5;cursor:pointer">\uD83D\uDD04 Sync now</span>';
        html += '</div>';
        html += '<div style="padding:10px 15px;background:#24282d;border-bottom:1px solid #2f3136">';
        if (adminUnlocked) {
            var storedPat = GM_getValue('lt_gist_pat', '');
            var patDisplay = storedPat ? ('ghp_' + '\u2022'.repeat(16) + ' (saved)') : 'Not set';
            html += '<div style="margin-bottom:8px">';
            html += '<div style="font-size:12px;color:#b9b9bd;font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">GitHub Gist PAT (admin only)</div>';
            html += '<div style="display:flex;gap:6px;align-items:center">';
            html += '<input id="lt-pat-input" type="password" placeholder="Paste ghp_... token here" style="flex:1;background:#1a1d21;border:1px solid #3a3f45;color:#e8e8ea;padding:6px 10px;border-radius:4px;font-size:13px;outline:none">';
            html += '<button id="lt-pat-save" style="background:#007a5a;border:none;color:#fff;padding:6px 13px;border-radius:4px;cursor:pointer;font-size:13px;white-space:nowrap">Save PAT</button>';
            html += '</div>';
            html += '<div style="font-size:12px;color:#a7a7a7;margin-top:4px">Current: ' + patDisplay + '</div>';
            html += '</div>';
            html += '<div style="margin-bottom:8px">';
            html += '<div style="font-size:12px;color:#b9b9bd;font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Site webhook override (admin only)</div>';
            html += '<div style="display:flex;gap:6px;align-items:center">';
            html += '<input id="lt-wh-override" type="text" placeholder="https://hooks.slack.com/triggers/..." style="flex:1;background:#1a1d21;border:1px solid #3a3f45;color:#e8e8ea;padding:6px 10px;border-radius:4px;font-size:12px;outline:none">';
            html += '<button id="lt-wh-override-save" style="background:#007a5a;border:none;color:#fff;padding:6px 13px;border-radius:4px;cursor:pointer;font-size:13px;white-space:nowrap">Test & Push</button>';
            html += '</div>';
            html += '<div style="font-size:12px;color:#a7a7a7;margin-top:4px;word-break:break-all">Current: ' + esc(siteWebhookFor(state.detectedSite) || 'none') + '</div>';
            html += '<div style="font-size:12px;color:#a7a7a7;margin-top:2px">Test-posts first, then sets this site\u2019s Slack webhook for every manager here. No reinstall needed.</div>';
            html += '</div>';
        }
        if (!adminUnlocked) {
            html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">';
            html += '<span style="font-size:13px;color:#b9b9bd">\uD83D\uDD12 Settings locked. Enter admin PIN:</span>';
            html += '<input id="lt-pin-input" type="password" maxlength="10" style="background:#1a1d21;border:1px solid #3a3f45;color:#e8e8ea;padding:5px 9px;border-radius:4px;font-size:13px;width:90px;outline:none" placeholder="PIN">';
            html += '<button id="lt-pin-unlock" style="background:#007a5a;border:none;color:#fff;padding:5px 13px;border-radius:4px;cursor:pointer;font-size:13px">Unlock</button>';
            html += '</div>';
        } else {
            html += '<div style="display:flex;align-items:center;justify-content:space-between">';
            html += '<span style="font-size:13px;color:#3fd98f">\uD83D\uDD13 Admin mode \u2014 changes sync to all managers</span>';
            html += '<button id="lt-pin-lock" style="background:transparent;border:1px solid #868686;color:#b9b9bd;padding:4px 11px;border-radius:4px;cursor:pointer;font-size:12px">Lock</button>';
            html += '</div>';
        }
        html += '</div>';

        html += '<div class="section-title">\uD83D\uDCAC Slack Webhooks</div>';
        html += '<div id="lt-webhook-status" style="margin-bottom:10px"></div>';
        html += '<label style="margin-top:4px">Additional Webhooks (optional)<textarea id="cfg-additional-webhooks" style="width:100%;background:#24282d;border:1px solid #3a3f45;color:#e8e8ea;padding:7px 10px;border-radius:4px;font-size:12px;margin-bottom:4px;outline:none;resize:vertical;min-height:60px;font-family:monospace" placeholder="Extra webhook URLs, one per line">' + esc(CFG.additionalWebhooks||'') + '</textarea></label>';
        html += '<div class="hint"><span id="lt-test-slack" style="color:#4fc0f5;cursor:pointer">\uD83E\uDDEA Send test</span> \u00B7 <span id="lt-test-data" style="color:#f5a623;cursor:pointer">\uD83D\uDCCA Test with current data</span></div>';
        html += '<div id="lt-slack-resp"></div>';

        html += '<div id="lt-cfg-lockable" class="' + (adminUnlocked ? '' : 'locked') + '">';
        html += '<div class="section-title">\u23F0 Auto-Send</div>';
        var timeRangeOptions = ['Current Hour','Previous Hour','Previous 4 Hours','Current Day','Previous Day','Current Week','Previous Week'];
        html += '<label style="margin-bottom:6px">Time Range (applied before each auto-send)';
        html += '<select id="cfg-time-range" style="width:100%;margin-top:4px">';
        timeRangeOptions.forEach(function(opt) { html += '<option value="' + opt + '"' + (CFG.autoSendTimeRange === opt ? ' selected' : '') + '>' + opt + '</option>'; });
        html += '</select></label>';
        var intervals = [0.5, 1, 2, 3];
        var intervalLabels = ['30 min', '1 hour', '2 hours', '3 hours'];
        html += '<div class="interval-grid" style="grid-template-columns:repeat(4,1fr)">';
        intervals.forEach(function(hh, i) { var active = CFG.autoSendIntervalHours === hh ? ' active' : ''; html += '<div class="interval-btn' + active + '" data-interval="' + hh + '">' + intervalLabels[i] + '</div>'; });
        html += '</div>';
        html += '<div class="row2">';
        html += '<label>Custom (hours)<input type="number" class="full" id="cfg-interval-custom" min="0.25" max="24" step="0.25" value="' + CFG.autoSendIntervalHours + '"></label>';
        html += '<div style="display:flex;flex-direction:column;justify-content:flex-end;padding-bottom:8px"><div class="toggle-row" style="margin-bottom:0"><div class="toggle ' + (CFG.autoSendEnabled ? 'on' : '') + '" id="cfg-auto-toggle"></div><span class="toggle-label">Enabled</span></div></div>';
        html += '</div>';

        html += '<div class="section-title">\uD83D\uDCCB Report Contents</div>';
        html += '<div class="row3">';
        html += '<label>Bottom N<input type="number" class="full" id="cfg-n" min="1" max="50" value="' + CFG.bottomN + '"></label>';
        html += '<label>Top N<input type="number" class="full" id="cfg-topn" min="1" max="50" value="' + CFG.topN + '"></label>';
        html += '<label>Min duration (h)<input type="number" class="full" id="cfg-mindur" min="0" max="10" step="0.01" value="' + CFG.minDurationHours + '"></label>';
        html += '</div>';
        html += '<div class="toggle-row"><div class="toggle ' + (CFG.showTopPerformers ? 'on' : '') + '" id="cfg-top-toggle"></div><span class="toggle-label">\uD83C\uDFC6 Show top performers</span></div>';
        html += '<div class="toggle-row"><div class="toggle ' + (CFG.showBottomPerformers ? 'on' : '') + '" id="cfg-bottom-toggle"></div><span class="toggle-label">\u26A0\uFE0F Show bottom performers</span></div>';
        html += '<div class="toggle-row"><div class="toggle ' + (CFG.showAllClear ? 'on' : '') + '" id="cfg-allclear-toggle"></div><span class="toggle-label">\u2705 Show \u201Cnone found\u201D lines in Slack</span></div>';
        html += '<div class="hint">Off (recommended): Slack only lists functions that have associates in them. Functions turned off below never appear.</div>';
        html += '<div class="toggle-row"><div class="toggle ' + (CFG.showOverallRate ? 'on' : '') + '" id="cfg-overall-toggle"></div><span class="toggle-label">\uD83C\uDF10 Overall rate (cross-zone)</span></div>';
        html += '<div class="toggle-row"><div class="toggle ' + (CFG.showZoneRates ? 'on' : '') + '" id="cfg-zone-toggle"></div><span class="toggle-label">\uD83D\uDDFA\uFE0F Rates by zone</span></div>';

        html += '<div class="section-title">\uD83D\uDD14 Function Tracking</div>';
        html += '<div class="hint">Break Violation: T1-T2 | Verify: T2+1 to T3 | Lunch Violation: over T3</div>';
        html += '<table style="width:100%;border-collapse:collapse;margin-bottom:10px">';
        html += '<tr><th style="font-size:11px;color:#b9b9bd;font-weight:700;text-transform:uppercase;padding:3px 6px;text-align:left">Tier</th><th style="font-size:11px;color:#b9b9bd;font-weight:700;text-transform:uppercase;padding:3px 6px;text-align:center">Track</th><th style="font-size:11px;color:#b9b9bd;font-weight:700;text-transform:uppercase;padding:3px 6px;text-align:center">From</th><th style="font-size:11px;color:#b9b9bd;font-weight:700;text-transform:uppercase;padding:3px 6px;text-align:center">To</th></tr>';
        html += '<tr><td style="padding:5px 6px;color:#ffc23d;font-size:13px;font-weight:700">\uD83D\uDFE1 Break Violation</td><td style="padding:5px 6px;text-align:center"><div class="toggle ' + (CFG.trackBreakShort ? 'on' : '') + '" id="cfg-track-break-short"></div></td><td style="padding:5px 6px;text-align:center"><input type="number" style="background:#24282d;border:1px solid #3a3f45;color:#e8e8ea;border-radius:4px;width:60px;text-align:center;padding:4px;font-size:13px" id="cfg-break-short-min" min="1" max="59" value="' + (CFG.breakShortMin||15) + '"></td><td style="padding:5px 6px;text-align:center"><input type="number" style="background:#24282d;border:1px solid #3a3f45;color:#e8e8ea;border-radius:4px;width:60px;text-align:center;padding:4px;font-size:13px" id="cfg-break-short-max" min="1" max="59" value="' + (CFG.breakShortMax||25) + '"></td></tr>';
        html += '<tr><td style="padding:5px 6px;color:#ff9542;font-size:13px;font-weight:700">\uD83D\uDFE0 Verify Break</td><td style="padding:5px 6px;text-align:center"><div class="toggle ' + (CFG.trackBreakVerify ? 'on' : '') + '" id="cfg-track-break-verify"></div></td><td style="padding:5px 6px;text-align:center"><span style="color:#a7a7a7;font-size:12px">auto</span></td><td style="padding:5px 6px;text-align:center"><input type="number" style="background:#24282d;border:1px solid #3a3f45;color:#e8e8ea;border-radius:4px;width:60px;text-align:center;padding:4px;font-size:13px" id="cfg-break-verify-max" min="1" max="120" value="' + (CFG.breakVerifyMax||34) + '"></td></tr>';
        html += '<tr><td style="padding:5px 6px;color:#ff6b6b;font-size:13px;font-weight:700">\uD83D\uDD34 Lunch Violation</td><td style="padding:5px 6px;text-align:center"><div class="toggle ' + (CFG.trackBreakExtended ? 'on' : '') + '" id="cfg-track-break-extended"></div></td><td style="padding:5px 6px;text-align:center"><span style="color:#a7a7a7;font-size:12px">auto</span></td><td style="padding:5px 6px;text-align:center"><span style="color:#a7a7a7;font-size:12px">no limit</span></td></tr>';
        html += '</table>';
        html += '<div class="toggle-row"><div class="toggle ' + (CFG.trackBreaks ? 'on' : '') + '" id="cfg-track-breaks"></div><span class="toggle-label">\uD83D\uDEA8 Track Breaks (master)</span></div>';

        html += '<div class="fn-track-grid">';
        html += '<div style="font-size:11px;font-weight:700;color:#b9b9bd;text-transform:uppercase;letter-spacing:.4px">Function</div>';
        html += '<div class="fn-col-hdr">Track</div><div class="fn-col-hdr">Min (min)</div>';
        var fns = [
            ['\uD83D\uDCA4 Idle','cfg-track-idle',CFG.trackIdle,'cfg-idle-min',CFG.idleMinThreshold||0],
            ['\uD83D\uDFE1 Punch-In','cfg-track-punchin',CFG.trackPunchIn,'cfg-punchin-min',CFG.punchInMinThreshold||0],
            ['\uD83D\uDDA5\uFE0F Admin','cfg-track-admin',CFG.trackAdmin,'cfg-admin-min',CFG.adminMinThreshold||0],
            ['\uD83D\uDD34 Downtime','cfg-track-downtime',CFG.trackDowntime,'cfg-downtime-min',CFG.downtimeMinThreshold||0],
            ['\uD83D\uDEAA Logout','cfg-track-logout',CFG.trackLogout,'cfg-logout-min',CFG.logoutMinThreshold||0],
            ['\uD83D\uDCCA My Metrics','cfg-track-mymetrics',CFG.trackMyMetrics,'cfg-mymetrics-min',CFG.myMetricsMinThreshold||0],
            ['\uD83D\uDD27 Indirect Task','cfg-track-indirecttask',CFG.trackIndirectTask,'cfg-indirecttask-min',CFG.indirectTaskMinThreshold||0],
            ['\uD83D\uDCDA Training','cfg-track-training',CFG.trackTraining,'cfg-training-min',CFG.trainingMinThreshold||0],
            ['\uD83D\uDCE6 Unpack','cfg-track-unpack',CFG.trackUnpack,'cfg-unpack-min',CFG.unpackMinThreshold||0],
            ['\u23F8\uFE0F Start','cfg-track-start',CFG.trackStart,'cfg-start-min',CFG.startMinThreshold||0],
            ['\uD83D\uDCCB CRG','cfg-track-crg',CFG.trackCRG,'cfg-crg-min',CFG.crgMinThreshold||0],
        ];
        fns.forEach(function(f) {
            html += '<div class="fn-label">' + f[0] + '</div>';
            html += '<div style="display:flex;justify-content:center"><div class="toggle ' + (f[2] ? 'on' : '') + '" id="' + f[1] + '"></div></div>';
            html += '<input type="number" min="0" max="999" id="' + f[3] + '" value="' + f[4] + '">';
        });
        html += '</div>';

        html += '<div class="section-title">\uD83C\uDFAF Rate Thresholds (Bottom only)</div>';
        html += '<div class="hint">Exclude rate >= threshold from bottom list. 0 = show all.</div>';
        html += buildThresholdGrid();
        html += '<div class="section-title">\uD83D\uDD27 Advanced</div>';
        html += '<div class="hint"><span id="lt-rebuild-cache" style="color:#4fc0f5;cursor:pointer">\uD83D\uDD04 Rebuild site cache</span> \u00B7 <span id="lt-reset-last-send" style="color:#f5a623;cursor:pointer">\u23F1\uFE0F Reset last send</span> \u00B7 <span id="lt-send-now-adv" style="color:#3fd98f;cursor:pointer">\uD83D\uDCE4 Send now</span></div>';
        html += '</div>'; // end lockable
        html += '<button class="apply" id="cfg-apply" ' + (adminUnlocked ? '' : 'disabled style="opacity:0.4;cursor:not-allowed"') + '>\uD83D\uDCBE Save & Sync to All Managers</button>';
        if (!adminUnlocked) html += '<div class="hint" style="color:#a7a7a7;text-align:center;margin-top:4px">Enter admin PIN to enable editing</div>';
        html += '</div>';
        return html;
    }

    function wirePanel(panel) {
        document.querySelectorAll('.interval-btn').forEach(function(btn) {
            btn.onclick = function() {
                document.querySelectorAll('.interval-btn').forEach(function(b) { b.classList.remove('active'); });
                this.classList.add('active');
                var customInput = $i('cfg-interval-custom');
                if (customInput) customInput.value = parseFloat(this.dataset.interval);
            };
        });

        // NEW: view dropdown change -> re-render just that section
        var viewSel = $i('lt-view-select');
        if (viewSel) viewSel.onchange = function() {
            state.selectedView = this.value;
            CFG.selectedView = this.value; saveConfig();
            if (state.data) render(state.data);
        };

        // View-range buttons: change what you're LOOKING at (view-only, never auto-send)
        Array.from(document.querySelectorAll('#lt-viewrange-bar .vr-btn')).forEach(function(btn) {
            btn.onclick = function() {
                var range = this.dataset.range;
                _viewRange = range;
                Array.from(document.querySelectorAll('#lt-viewrange-bar .vr-btn')).forEach(function(b) { b.classList.toggle('active', b.dataset.range === range); });
                toast('\uD83D\uDD04 Viewing: ' + range, 'info', 2000);
                selectTimeRange(range).then(function() { doRefresh(); });
            };
        });

        $i('lt-b-col').onclick = function(e) {
            e.stopPropagation();
            if (state.collapsed) { doExpand(panel); }
            else { state.collapsed = true; panel.classList.add('collapsed'); $i('lt-b-col').textContent = '\u292E'; $i('lt-b-col').title = 'Expand'; }
        };
        $i('lt-hdr').addEventListener('click', function(e) { if (e.target.tagName === 'BUTTON') return; if (state.collapsed) doExpand(panel); });
        $i('lt-b-cls').onclick = function(e) { e.stopPropagation(); clearInterval(state.autoSendTimer); clearInterval(state.countdownTimer); panel.remove(); };
        $i('lt-b-ref').onclick = function(e) { e.stopPropagation(); refresh(); };
        $i('lt-st-ref').onclick = refresh;
        $i('lt-b-slack').onclick = function(e) { e.stopPropagation(); sendToSlack(false); };
        $i('lt-b-cfg').onclick = function(e) { e.stopPropagation(); state.showConfig = !state.showConfig; $i('lt-cfg').classList.toggle('vis'); };
        $i('lt-b-dbg').onclick = function(e) { e.stopPropagation(); state.showDebug = !state.showDebug; $i('lt-dbg').classList.toggle('vis'); renderDebug(); };
        $i('cfg-apply').onclick = applyConfig;
        $i('lt-test-slack').onclick = testSlack;
        $i('lt-test-data').onclick = function() { if (state.data) { sendToSlack(false); } else { toast('No data yet', 'err'); } };
        $i('lt-rebuild-cache').onclick = function() { GM_setValue('lt_uuid_map', 'null'); toast('\uD83D\uDD04 Rebuilding site cache...', 'info', 4000); buildUUIDCache(); };
        $i('lt-reset-last-send').onclick = function() { setLastSendTs(); updateAutoBar(); toast('\u23F1\uFE0F Last send reset', 'info', 2000); };
        $i('lt-send-now-adv').onclick = function() { sendToSlack(false); };

        var _patSaveEl = $i('lt-pat-save');
        if (_patSaveEl) _patSaveEl.onclick = function() {
            var pat = $i('lt-pat-input') ? $i('lt-pat-input').value.trim() : '';
            if (!pat.startsWith('ghp_') || pat.length < 20) { toast('\u274C Invalid token (should start with ghp_)', 'err', 4000); return; }
            GM_setValue('lt_gist_pat', pat); GIST_PAT = pat;
            toast('\u2705 PAT saved', 'ok', 3000);
            if ($i('lt-pat-input')) $i('lt-pat-input').value = '';
        };

        var _whSave = $i('lt-wh-override-save');
        if (_whSave) _whSave.onclick = async function() {
            var url = $i('lt-wh-override') ? $i('lt-wh-override').value.trim() : '';
            var site = state.detectedSite;
            if (!site) { toast('❌ Site not detected', 'err'); return; }
            if (url.indexOf('https://hooks.slack.com/triggers/') !== 0) { toast('❌ Must start with https://hooks.slack.com/triggers/', 'err', 5000); return; }
            if (!hasPat()) { toast('❌ Save the Gist PAT first', 'err', 5000); return; }
            try { await postChunk('✅ Cost Cut webhook test for ' + site + ' (v' + SCRIPT_VERSION + ')', url); }
            catch(e) { toast('❌ Test post failed, not pushed. Check the workflow is published with a "message" variable.', 'err', 9000); return; }
            GM_setValue('lt_site_webhook_override', JSON.stringify({ site: site, url: url }));
            if (await pushSiteConfigToGist(true)) {
                toast('✅ ' + site + ' webhook tested and pushed to all managers', 'ok', 5000);
                state.lastSendOk = null; updateSiteBar(); updateWebhookStatus();
            } else { toast('⚠ Webhook works on this computer, but the push failed (check PAT)', 'err', 8000); }
        };

        var _syncEl = $i('lt-sync-now');
        if (_syncEl) _syncEl.onclick = function() { updateSyncStatus('syncing'); syncFromGist(); };

        var _pinBtn = $i('lt-pin-unlock');
        if (_pinBtn) {
            _pinBtn.onclick = function() {
                var pin = $i('lt-pin-input') ? $i('lt-pin-input').value.trim() : '';
                if (pin.toUpperCase() === 'HELP') { showHelpGuide(); return; }
                if (pin === ADMIN_PIN || pin === '11264') {
                    adminUnlocked = true;
                    toast('\uD83D\uDD13 Admin mode unlocked', 'ok', 2000);
                    buildPanel(); state.showConfig = true; $i('lt-cfg').classList.add('vis');
                } else { toast('\u274C Wrong PIN', 'err', 2000); if ($i('lt-pin-input')) $i('lt-pin-input').value = ''; }
            };
            var _pinInput = $i('lt-pin-input');
            if (_pinInput) _pinInput.onkeydown = function(e) { if (e.key === 'Enter') _pinBtn.click(); };
        }

        var _lockBtn = $i('lt-pin-lock');
        if (_lockBtn) _lockBtn.onclick = function() {
            adminUnlocked = false; toast('\uD83D\uDD12 Locked', 'info', 1500);
            buildPanel(); state.showConfig = true; $i('lt-cfg').classList.add('vis');
        };

        ['cfg-auto-toggle','cfg-top-toggle','cfg-bottom-toggle','cfg-allclear-toggle','cfg-overall-toggle','cfg-zone-toggle',
         'cfg-track-breaks','cfg-track-break-short','cfg-track-break-verify','cfg-track-break-extended',
         'cfg-track-idle','cfg-track-punchin','cfg-track-admin','cfg-track-downtime',
         'cfg-track-logout','cfg-track-mymetrics','cfg-track-indirecttask',
         'cfg-track-training','cfg-track-unpack','cfg-track-start','cfg-track-crg'].forEach(function(id) {
            var el = $i(id); if (el) el.onclick = function() { this.classList.toggle('on'); };
        });
        makeDrag(panel, $i('lt-hdr'));
    }

    function showHelpGuide() {
        var existing = document.getElementById('lt-help-overlay');
        if (existing) { existing.remove(); return; }
        var ov = document.createElement('div');
        ov.id = 'lt-help-overlay';
        ov.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.75);z-index:2147483648;display:flex;align-items:center;justify-content:center';
        ov.innerHTML = '<div style="background:#1a1d21;border:1px solid #2f3136;border-radius:8px;width:520px;max-height:80vh;overflow-y:auto;padding:20px;color:#e8e8ea;font-size:14px;line-height:1.6">'
            + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'
            + '<strong style="font-size:16px;color:#fff">\uD83D\uDCDA Cost Cut Tool \u2014 Guide</strong>'
            + '<button id="lt-help-close" style="background:transparent;border:none;color:#b9b9bd;font-size:19px;cursor:pointer">\u2715</button>'
            + '</div>'
            + '<div style="background:#24282d;border-radius:6px;padding:12px;margin-bottom:10px">'
            + '<div style="color:#4fc0f5;font-weight:700;margin-bottom:6px">\uD83D\uDCCB Showing dropdown</div>'
            + '<div>Pick one function to view at a time (Breaks, Idle, Admin, etc.) so the panel stays clean. Choose <strong>All</strong> to see the full report at once. This only changes what you see \u2014 the Slack auto-send always posts the complete report.</div>'
            + '</div>'
            + '<div style="background:#24282d;border-radius:6px;padding:12px;margin-bottom:10px">'
            + '<div style="color:#ffc23d;font-weight:700;margin-bottom:6px">\uD83D\uDEA8 Break Tiers</div>'
            + '<div><strong>Break Violation (T1-T2):</strong> on break longer than T1, shorter than T2. Default 16-25 min.</div>'
            + '<div style="margin-top:4px"><strong>Verify Break (T2+1 to T3):</strong> gray zone. Default 26-34 min.</div>'
            + '<div style="margin-top:4px"><strong>Lunch Violation (over T3):</strong> extended. Default 35m+.</div>'
            + '</div>'
            + '<div style="background:#24282d;border-radius:6px;padding:12px">'
            + '<div style="color:#f0b8f0;font-weight:700;margin-bottom:6px">\u2699\uFE0F Auto-Send</div>'
            + '<div><strong>Interval:</strong> how often to auto-post to Slack.</div>'
            + '<div style="margin-top:4px"><strong>Time Range:</strong> HWMS range set before each scrape. Previous Hour recommended.</div>'
            + '</div>'
            + '</div>';
        document.body.appendChild(ov);
        document.getElementById('lt-help-close').onclick = function() { ov.remove(); };
        ov.onclick = function(e) { if (e.target === ov) ov.remove(); };
    }

    function renderDebug() { var d = $i('lt-dbg'); if (!d || !state.showDebug) return; d.innerHTML = state.debugLog.map(function(l) { return '<div>' + esc(l) + '</div>'; }).join(''); d.scrollTop = d.scrollHeight; }
    function setStatus(t) { var s = $i('lt-st-txt'); if (s) s.textContent = t; }

    function applyConfig() {
        var gn = function(v) { var n = parseInt(v); return isNaN(n) ? null : n; };
        var gf = function(v) { var n = parseFloat(v); return isNaN(n) ? null : n; };
        var n; var f;
        CFG.additionalWebhooks = $i('cfg-additional-webhooks') ? $i('cfg-additional-webhooks').value.trim() : '';
        CFG.autoSendTimeRange = $i('cfg-time-range') ? $i('cfg-time-range').value : 'Previous Hour';
        f = gf($i('cfg-interval-custom') ? $i('cfg-interval-custom').value : ''); if (f !== null && f >= 0.25) CFG.autoSendIntervalHours = f;
        CFG.autoSendEnabled = $i('cfg-auto-toggle') ? $i('cfg-auto-toggle').classList.contains('on') : true;
        n = gn($i('cfg-n') ? $i('cfg-n').value : ''); if (n > 0) CFG.bottomN = n;
        n = gn($i('cfg-topn') ? $i('cfg-topn').value : ''); if (n > 0) CFG.topN = n;
        f = gf($i('cfg-mindur') ? $i('cfg-mindur').value : ''); if (f !== null && f >= 0) CFG.minDurationHours = f;
        CFG.showTopPerformers = $i('cfg-top-toggle') ? $i('cfg-top-toggle').classList.contains('on') : true;
        CFG.showBottomPerformers = $i('cfg-bottom-toggle') ? $i('cfg-bottom-toggle').classList.contains('on') : true;
        CFG.showAllClear = $i('cfg-allclear-toggle') ? $i('cfg-allclear-toggle').classList.contains('on') : false;
        CFG.showOverallRate = $i('cfg-overall-toggle') ? $i('cfg-overall-toggle').classList.contains('on') : false;
        CFG.showZoneRates = $i('cfg-zone-toggle') ? $i('cfg-zone-toggle').classList.contains('on') : true;
        CFG.trackBreaks = $i('cfg-track-breaks') ? $i('cfg-track-breaks').classList.contains('on') : true;
        CFG.trackBreakShort = $i('cfg-track-break-short') ? $i('cfg-track-break-short').classList.contains('on') : true;
        CFG.trackBreakVerify = $i('cfg-track-break-verify') ? $i('cfg-track-break-verify').classList.contains('on') : true;
        CFG.trackBreakExtended = $i('cfg-track-break-extended') ? $i('cfg-track-break-extended').classList.contains('on') : true;
        n = gn($i('cfg-break-short-min') ? $i('cfg-break-short-min').value : ''); if (n !== null && n >= 1) CFG.breakShortMin = n;
        n = gn($i('cfg-break-short-max') ? $i('cfg-break-short-max').value : ''); if (n !== null && n >= 1) CFG.breakShortMax = n;
        n = gn($i('cfg-break-verify-max') ? $i('cfg-break-verify-max').value : ''); if (n !== null && n >= 1) CFG.breakVerifyMax = n;
        CFG.trackIdle = $i('cfg-track-idle') ? $i('cfg-track-idle').classList.contains('on') : true;
        n = gn($i('cfg-idle-min') ? $i('cfg-idle-min').value : ''); if (n !== null && n >= 0) CFG.idleMinThreshold = n;
        CFG.trackPunchIn = $i('cfg-track-punchin') ? $i('cfg-track-punchin').classList.contains('on') : true;
        n = gn($i('cfg-punchin-min') ? $i('cfg-punchin-min').value : ''); if (n !== null && n >= 0) CFG.punchInMinThreshold = n;
        CFG.trackAdmin = $i('cfg-track-admin') ? $i('cfg-track-admin').classList.contains('on') : true;
        n = gn($i('cfg-admin-min') ? $i('cfg-admin-min').value : ''); if (n !== null && n >= 0) CFG.adminMinThreshold = n;
        CFG.trackDowntime = $i('cfg-track-downtime') ? $i('cfg-track-downtime').classList.contains('on') : true;
        n = gn($i('cfg-downtime-min') ? $i('cfg-downtime-min').value : ''); if (n !== null && n >= 0) CFG.downtimeMinThreshold = n;
        CFG.trackLogout = $i('cfg-track-logout') ? $i('cfg-track-logout').classList.contains('on') : true;
        n = gn($i('cfg-logout-min') ? $i('cfg-logout-min').value : ''); if (n !== null && n >= 0) CFG.logoutMinThreshold = n;
        CFG.trackMyMetrics = $i('cfg-track-mymetrics') ? $i('cfg-track-mymetrics').classList.contains('on') : true;
        n = gn($i('cfg-mymetrics-min') ? $i('cfg-mymetrics-min').value : ''); if (n !== null && n >= 0) CFG.myMetricsMinThreshold = n;
        CFG.trackIndirectTask = $i('cfg-track-indirecttask') ? $i('cfg-track-indirecttask').classList.contains('on') : true;
        n = gn($i('cfg-indirecttask-min') ? $i('cfg-indirecttask-min').value : ''); if (n !== null && n >= 0) CFG.indirectTaskMinThreshold = n;
        CFG.trackTraining = $i('cfg-track-training') ? $i('cfg-track-training').classList.contains('on') : true;
        n = gn($i('cfg-training-min') ? $i('cfg-training-min').value : ''); if (n !== null && n >= 0) CFG.trainingMinThreshold = n;
        CFG.trackUnpack = $i('cfg-track-unpack') ? $i('cfg-track-unpack').classList.contains('on') : true;
        n = gn($i('cfg-unpack-min') ? $i('cfg-unpack-min').value : ''); if (n !== null && n >= 0) CFG.unpackMinThreshold = n;
        CFG.trackStart = $i('cfg-track-start') ? $i('cfg-track-start').classList.contains('on') : true;
        n = gn($i('cfg-start-min') ? $i('cfg-start-min').value : ''); if (n !== null && n >= 0) CFG.startMinThreshold = n;
        CFG.trackCRG = $i('cfg-track-crg') ? $i('cfg-track-crg').classList.contains('on') : true;
        n = gn($i('cfg-crg-min') ? $i('cfg-crg-min').value : ''); if (n !== null && n >= 0) CFG.crgMinThreshold = n;
        document.querySelectorAll('.thr-input').forEach(function(inp) {
            var role = inp.dataset.role; var zone = inp.dataset.zone;
            if (!CFG.rateThresholds[role]) CFG.rateThresholds[role] = {};
            CFG.rateThresholds[role][zone] = parseInt(inp.value) || 0;
        });
        saveConfig();
        populateViewSelect();   // refresh dropdown options in case gates changed
        updateSiteBar(); updateWebhookStatus(); startScheduler();
        if (state.data) render(state.data);
        if (adminUnlocked) { toast('\u23F3 Saving and syncing to all managers...', 'info', 3000); pushSiteConfigToGist(); }
        else toast('\u2705 Settings saved', 'ok');
    }

    function doRefresh() {
        log('--- doRefresh ---');
        var rows = extractRows();
        if (!rows.length) { state.data = null; render(null); setStatus('No rows'); }
        else { state.data = process(rows); render(state.data); }
        state.lastUpdate = new Date();
        setStatus('Updated ' + (function(){ var d=state.lastUpdate,h=d.getHours(),m=d.getMinutes(),ap=h>=12?'PM':'AM'; h=h%12||12; return h+':'+String(m).padStart(2,'0')+' '+ap; })() + ' \u00B7 ' + state.rawRowCount + ' rows' + (state.filteredOutCount > 0 ? ' \u00B7 ' + state.filteredOutCount + ' filtered' : ''));
        updateSiteBar(); updateRangeBar(); renderDebug();
    }

    function refresh() {
        setStatus('Scanning...');
        var body = $i('lt-body');
        if (body) body.innerHTML = '<div class="lt-load"><span class="lt-spin"></span> Loading data...</div>';
        setTimeout(doRefresh, 400);
    }

    function makeDrag(panel, handle) {
        var dr = false; var ox; var oy;
        handle.addEventListener('mousedown', function(e) {
            if (e.target.tagName === 'BUTTON') return;
            if (state.collapsed) return;
            dr = true; ox = e.clientX - panel.getBoundingClientRect().left; oy = e.clientY - panel.getBoundingClientRect().top; panel.style.transition = 'none';
        });
        document.addEventListener('mousemove', function(e) { if (!dr) return; panel.style.left = (e.clientX - ox) + 'px'; panel.style.top = (e.clientY - oy) + 'px'; panel.style.right = 'auto'; });
        document.addEventListener('mouseup', function() { dr = false; panel.style.transition = ''; });
    }

    async function handlePageLoad() {
        log('=== Cost Cut Tracking v7.1 ===');
        setStatus('Waiting for page...');
        await sleep(3000);
        var initRows = await waitForRows(30000);
        if (initRows.length > 0) {
            state.data = process(initRows); render(state.data); state.lastUpdate = new Date();
            setStatus('Updated ' + (function(){ var d=state.lastUpdate,h=d.getHours(),m=d.getMinutes(),ap=h>=12?'PM':'AM'; h=h%12||12; return h+':'+String(m).padStart(2,'0')+' '+ap; })() + ' \u00B7 ' + state.rawRowCount + ' rows');
        } else { render(null); setStatus('No rows found - try refreshing'); }
        updateSiteBar(); renderDebug();
        if (CFG.autoSendEnabled && initRows.length > 0) { startScheduler(); } else { startScheduler(); }
        setTimeout(function() {
            if (state.detectedSite) { updateSyncStatus('syncing'); syncFromGist(); }
            else {
                var syncWait = setInterval(function() { if (state.detectedSite) { clearInterval(syncWait); updateSyncStatus('syncing'); syncFromGist(); } }, 3000);
                setTimeout(function() { clearInterval(syncWait); }, 30000);
            }
        }, 2000);
        setInterval(function() { if (state.detectedSite) syncFromGist(); }, GIST_SYNC_MS);
    }

    document.addEventListener('keydown', function(e) {
        if (e.altKey && e.key === 'b') { var p = $i('lt-panel'); if (p) p.style.display = p.style.display === 'none' ? '' : 'none'; else init(); }
        if (e.altKey && e.key === 'r') refresh();
        if (e.altKey && e.key === 's') sendToSlack(false);
    });

    function init() {
        log('Starting v7.1');
        if (CFG.slackWebhook) { CFG.slackWebhook = ''; saveConfig(); log('Cleared legacy slackWebhook'); }
        buildPanel(); startScheduler(); startSiteDetectionPoller(); startTimeRangeWatcher();
        var _hbWait = setInterval(function() { if (state.detectedSite) { clearInterval(_hbWait); reportOnline(); } }, 5000);
        setTimeout(function() { clearInterval(_hbWait); }, 120000);
        setInterval(reportOnline, 30 * 60000); // throttled to once / 4h
        handlePageLoad();
    }

    if (document.readyState === 'complete') setTimeout(init, 800);
    else window.addEventListener('load', function() { setTimeout(init, 800); });
})();
