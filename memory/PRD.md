# MapData Collector - Product Requirements Document

## Original Problem Statement
Build a Google Maps information scraper that pulls:
- Location Name
- Location Address
- Location Longitude/Latitude
- Location Website
- Location Social Account (Instagram if available)
- Location Short Description
- Location Images (up to 3 if available)

Select from 5 predefined categories:
1. Thrill Seeking - adventurous outings
2. Super Chill - relaxing activities
3. Creative - arts and workshops
4. Pure Entertainment - theaters and venues
5. Foodie - restaurants and dining

## User Personas
- **Location Researchers**: People collecting data about places for marketing, travel planning, or business research
- **Event Planners**: Users discovering venues and activities for events
- **Content Creators**: Bloggers/influencers researching locations

## Core Requirements
- Category-based search (5 categories)
- Location/city input, US Region, or Specific Places (up to 10 with state codes)
- Up to 60 results per search
- CSV export with Experience Type column
- Display up to 3 images per location
- Instagram scraping from business websites
- Yellow border/badge for locations missing description
- Broken image handling (exclude from UI and CSV)
- New/Seen badges, Remove button, Selection checkboxes
- History and Configuration pages
- Search progress indicator with phase labels

## Tech Stack
- Frontend: React + Tailwind CSS + shadcn/ui + react-router-dom
- Backend: FastAPI + Motor (async MongoDB)
- Database: MongoDB
- External API: Google Places API (New)

## What's Been Implemented

### Backend (server.py)
- FastAPI server with Google Places API (New) integration
- POST /api/places/search - Search locations by category and area
- POST /api/places/export-csv - Export results to CSV (Experience Type first column, IG handle only)
- GET /api/categories - List available categories
- GET /api/regions - List US regions
- GET /api/history - Retrieve search history
- GET /api/history/{id} - Single history entry
- DELETE /api/history/{id} - Delete history entry
- GET /api/config - Application configuration
- PUT /api/config/category - Update category config
- POST /api/config/reset - Reset config to defaults
- POST /api/auth/register - User registration
- POST /api/auth/login - User login
- Instagram scraping from business websites (concurrent, async)
- Result deduplication by Place ID + Name/Address

### Frontend (App.js + pages)
- Swiss minimalist design (IBM Plex Sans, Inter fonts)
- Multi-step search UI (category -> location method -> search)
- Category tooltips with keyword examples
- Three search methods: City/Zip, US Region, Specific Places with state codes
- Grid-based results with bordered cards
- Location cards: images, name, address, rating, description, coordinates, website + Instagram links
- Yellow border + "No Description" badge for missing descriptions
- Broken image error handling (ImageOff fallback, excludes from CSV)
- New/Seen badges, Remove button, Selection checkboxes
- Pagination (20 per page)
- Export All / Export Selected to CSV
- Search progress indicator with 3 phases (Google Places -> Instagram scraping -> Finalizing)
- History page with expandable search records
- Configuration page with System Info and Experience Types tabs
- Basic auth (register/login)

## Prioritized Backlog

### P0 (Critical) - ALL DONE
- [x] Google Places API integration
- [x] Category-based search
- [x] Results display with images
- [x] CSV export with Experience Type column
- [x] Pagination (20 per page)
- [x] Filter out items without address, website, or images
- [x] Yellow border for missing descriptions
- [x] Broken image handling
- [x] Instagram scraping from business websites
- [x] Instagram handle in CSV (no @ or full URL)
- [x] Search progress indicator with phase labels

### P1 (High Priority)
- [ ] Saved Searches - Save/load search configurations
- [ ] Map View - Toggle to display results on a map
- [ ] Rating Filter - Filter by minimum star rating
- [ ] Secure Routes - Token-based session management, protect History/Config

### P2 (Medium Priority)
- [ ] Add Notes to Locations
- [ ] Filter by "New" results only
- [ ] Combine Multiple Categories in one search
- [ ] App.js refactoring into smaller components

## Key Credentials
- Email: joseph@centurion-pm.com
- Password: #Test1234
