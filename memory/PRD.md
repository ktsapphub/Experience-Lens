# MapData Collector - Product Requirements Document

## Original Problem Statement
Build a Google Maps information scraper that pulls location data with category-based and specific location searches. Includes an Import page for cross-checking and enriching existing location data from CSV/Excel files.

## Tech Stack
- Frontend: React + Tailwind CSS + shadcn/ui + react-router-dom
- Backend: FastAPI + Motor (async MongoDB)
- Database: MongoDB
- External APIs: Google Places API (New), Google Gemini (via Emergent LLM key)

## Pages
1. **Search** — Category/location-based search with results grid, pagination, export
2. **Import** — CSV/Excel upload, field selection checklist, cross-check vs Google, discrepancy resolution, AI descriptions, image preview, export
3. **History** — Past search records with expandable results
4. **Config** — System info and experience type keyword management

## Data Fields
Name, Address, Latitude, Longitude, Description, Category (5 types), Price Range ($/$$/$$), Phone, Website, Instagram (handle + URL), Rating, Images (up to 3)

## Completed Features (All Tested)
- [x] Google Places API integration & search
- [x] Instagram scraping from business websites
- [x] Yellow border for missing descriptions
- [x] Broken image handling
- [x] Search progress indicator (3 phases)
- [x] Specific Places search without category
- [x] Phone number in results and exports
- [x] Price Range ($/$$/$$$ from Google priceLevel)
- [x] Import page with full feature set:
  - [x] CSV/Excel upload
  - [x] "What do you want to fix?" field selection checklist (11 fields)
  - [x] Cross-check only selected fields against Google
  - [x] Price Range dropdown on cards
  - [x] Image gallery with green badge + preview modal
  - [x] Instagram @handle display with full URL link
  - [x] Experience Type editable dropdown
  - [x] Discrepancy resolution (side-by-side picker)
  - [x] AI description generation (Gemini, max 500 chars)
  - [x] Export All / Export Selected with all fields

## Prioritized Backlog
### P1 (High Priority)
- [ ] Saved Searches — Save/load search configurations
- [ ] Map View — Toggle to display results on a map
- [ ] Rating Filter — Filter by minimum star rating
- [ ] Secure Routes — Token-based session management

### P2 (Medium Priority)
- [ ] Add Notes to Locations
- [ ] Filter by "New" results only
- [ ] Combine Multiple Categories
- [ ] App.js refactoring into smaller components

## Key Credentials
- Email: joseph@centurion-pm.com
- Password: #Test1234
