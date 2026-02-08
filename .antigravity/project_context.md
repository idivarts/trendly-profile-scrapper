# Trendly Profile Scraper — Project Context

## Project Overview
A Chrome Extension (Manifest V3) for scraping influencer data from Instagram and Modash.

## Core Components

### 1. Instagram Scraper
- **Logic**: `popup.js` / `scrapeInstagramProfileOnPage`
- **Target**: `instagram.com/<username>/reels/`
- **Data**: Profile info, stats, and Reels performance.
- **Validation**: 1k-500k followers; Lead Quality Score.
- **Deduplication**: Backend API check (`be.trendly.now`).

### 2. Manual Enrichment
- **Logic**: `renderManualFieldsForm` / `manualDraft` storage.
- **Fields**: Gender, Niche, Location, Aesthetics (0-100).
- **Persistence**: Saved in `chrome.storage.local`.

### 3. Modash Scraper
- **Logic**: `modash.js` / `scrapeModashPage`
- **Target**: `marketer.modash.io`
- **Data**: Handle, name, followers, engagement.
- **Export**: CSV/JSON.

## Technical Details
- **Permissions**: `activeTab`, `scripting`, `storage`, `sidePanel`.
- **Primary Files**: `manifest.json`, `popup.html`, `popup.js`, `modash.js`, `tab.js`, `constant.js`, `content.js`.
- **Backend**: `https://be.trendly.now/discovery/extension`
