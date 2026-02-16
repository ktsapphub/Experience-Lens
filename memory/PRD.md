# MapData Collector - Product Requirements Document

## Original Problem Statement
Build a Google Maps information scraper that pulls location data (Name, Address, Lat/Lng, Website, Phone, Instagram, Description, Images, Rating) with category-based and specific location searches. Includes an Import page for cross-checking and enriching existing location data from CSV/Excel files.

## Tech Stack
- Frontend: React + Tailwind CSS + shadcn/ui + react-router-dom
- Backend: FastAPI + Motor (async MongoDB)
- Database: MongoDB
- External APIs: Google Places API (New), Google Gemini (via Emergent LLM key)

## Pages
1. **Search** — Category/location-based search with results grid, pagination, export
2. **Import** — CSV/Excel upload, gallery-style cards, experience type assignment, cross-check vs Google, discrepancy resolution, AI description generation, export
3. **History** — Past search records with expandable results
4. **Config** — System info and experience type keyword management

## What's Been Implemented

### Import Page Features
- CSV/Excel upload with drag-and-drop
- Gallery-style cards matching search results (main image + thumbnail strip)
- Image count badge, "No images" placeholder when empty
- Experience Type column: reads from import, editable dropdown per card, carries to export
- Cross-check against Google Places (auto-fills missing data, never overwrites valid data)
- Discrepancy resolution (side-by-side original vs Google, including images)
- AI description generation (Gemini, max 500 chars)
- All fields visible: images, name, type, address, description, coordinates, website, phone, Instagram, rating
- Export All / Export Selected with consistent CSV format

## Completed Features (All Tested)
- [x] Google Places API integration & search
- [x] Instagram scraping from business websites
- [x] Yellow border for missing descriptions
- [x] Broken image handling
- [x] Search progress indicator
- [x] Specific Places search without category
- [x] Phone number in results and exports
- [x] Import page with gallery-style cards matching search results
- [x] Cross-check fills gaps without overwriting valid info
- [x] Experience Type field (editable dropdown, carries to export)
- [x] Navigation across all pages (Search, Import, History, Config)

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
