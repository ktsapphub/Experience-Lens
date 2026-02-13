# MapData Collector - Product Requirements Document

## Original Problem Statement
Build a Google Maps information scraper that pulls:
- Location Name, Address, Longitude/Latitude, Website, Instagram, Short Description, Images (up to 3)

Select from 5 predefined categories:
1. Thrill Seeking  2. Super Chill  3. Creative  4. Pure Entertainment  5. Foodie

## Tech Stack
- Frontend: React + Tailwind CSS + shadcn/ui + react-router-dom
- Backend: FastAPI + Motor (async MongoDB)
- Database: MongoDB
- External API: Google Places API (New)

## What's Been Implemented

### Backend (server.py)
- POST /api/places/search - Search by category+location OR specific places (category optional)
- POST /api/places/export-csv - CSV export with Experience Type & IG handle
- GET /api/categories, /api/regions, /api/history, /api/config
- PUT /api/config/category, POST /api/config/reset
- POST /api/auth/register, /api/auth/login
- Instagram scraping from business websites (concurrent async)
- Result deduplication by Place ID + Name/Address

### Frontend (App.js + pages)
- Multi-step search UI with category selection (optional for Specific Places)
- Info tooltip on Step 1 explaining category is optional for Specific Places
- Three search methods: City/Zip, US Region, Specific Places with state codes
- Location cards with images, Instagram links, descriptions, ratings
- Yellow border + "No Description" badge for missing descriptions
- Broken image handling (excludes from CSV)
- New/Seen badges, Remove button, Selection checkboxes
- Pagination, Export All / Export Selected
- Search progress indicator (3 phases: Google Places > IG scraping > Finalizing)
- History page, Configuration page, Basic auth

## Completed Features (All Tested)
- [x] Google Places API integration & category-based search
- [x] Results display with images, pagination, CSV export
- [x] Instagram scraping from business websites
- [x] Yellow border for missing descriptions
- [x] Broken image handling
- [x] Search progress indicator
- [x] Specific Places search without category requirement
- [x] Info tooltip on category step

## Prioritized Backlog
### P1 (High Priority)
- [ ] Saved Searches - Save/load search configurations
- [ ] Map View - Toggle to display results on a map
- [ ] Rating Filter - Filter by minimum star rating
- [ ] Secure Routes - Token-based session management

### P2 (Medium Priority)
- [ ] Add Notes to Locations
- [ ] Filter by "New" results only
- [ ] Combine Multiple Categories
- [ ] App.js refactoring into smaller components

## Key Credentials
- Email: joseph@centurion-pm.com
- Password: #Test1234
