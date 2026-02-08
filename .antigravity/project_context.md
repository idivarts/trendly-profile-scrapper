# Trendly Profile Scraper — Project Context (URL-Based)

## Project Overview
A Chrome Extension (Manifest V3) for capturing Instagram usernames directly from the tab URL and collecting manual enrichment data.

## Core Components

### 1. Instagram "Scraper" (URL-Based)
- **Logic**: `popup.js`
- **Mechanism**: Extracts the `username` from `chrome.tabs.url` using a regex (`/^https:\/\/www\.instagram\.com\/([^/]+)/`).
- **Benefits**: Zero dependency on Instagram's DOM structure. It will not break if Instagram changes its HTML.
- **Validation**: Ensures the extracted username is not a reserved Instagram path like `reels`, `explore`, etc.

### 2. Manual Enrichment
- **Logic**: `renderManualFieldsForm`
- **Fields**: Gender, Niche, Location, Aesthetics Score.
- **Persistence**: Auto-saves drafts to `chrome.storage.local`.

### 3. Modash Scraper
- **Logic**: `modash.js`
- **Function**: Scrapes lists of handles from Modash discovery.

## Data Structure
```json
{
  "username": "string",
  "manual": {
    "gender": "string",
    "niches": "string[]",
    "location": "string",
    "aestheticsScore": "number"
  }
}
```

## Technical Details
- **Primary Files**: `manifest.json`, `popup.html`, `popup.js`, `modash.js`, `tab.js`, `constant.js`.
- **Backend API**: `https://be.trendly.now/discovery/extension`
