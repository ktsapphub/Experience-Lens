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
2. **Import** — CSV/Excel upload, cross-check vs Google, discrepancy resolution, AI description generation, export
3. **History** — Past search records with expandable results
4. **Config** — System info and experience type keyword management

## What's Been Implemented

### Backend Endpoints
- POST /api/places/search — Search by category+location or specific places (category optional)
- POST /api/places/export-csv — CSV export with Experience Type, Phone, IG handle
- POST /api/import/upload — Parse CSV/Excel file
- POST /api/import/cross-check — Cross-check locations against Google Places
- POST /api/import/generate-description — AI description generation (Gemini)
- POST /api/import/export-csv — Export enriched import data
- GET /api/categories, /api/regions, /api/history, /api/config
- PUT /api/config/category, POST /api/config/reset
- POST /api/auth/register, /api/auth/login
- Instagram scraping from business websites (concurrent async)

### Key Features
- 5 experience categories with tooltips
- 3 search methods: City/Zip, US Region, Specific Places (with optional state codes)
- Category optional for Specific Places search (with info tooltip)
- Search progress indicator (3 phases)
- Results grid with images, Instagram links, phone numbers, ratings
- Yellow border for missing descriptions, broken image handling
- New/Seen badges, Remove, Selection checkboxes
- CSV/Excel import with cross-check and discrepancy resolution
- AI description generation (Gemini, max 500 chars)
- Export All / Export Selected to CSV

## Completed Features (All Tested)
- [x] Google Places API integration & search
- [x] Instagram scraping from business websites
- [x] Yellow border for missing descriptions
- [x] Broken image handling
- [x] Search progress indicator
- [x] Specific Places search without category
- [x] Phone number in results and exports
- [x] Import page: upload, cross-check, discrepancy resolution, AI descriptions, export
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
