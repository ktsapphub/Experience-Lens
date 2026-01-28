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
- Location/city input
- Up to 50 results per search
- CSV export functionality
- Display up to 3 images per location
- Minimal UI with great contrast

## What's Been Implemented (January 2026)
### Backend
- FastAPI server with Google Places API (New) integration
- POST /api/places/search - Search locations by category and area
- POST /api/places/export-csv - Export results to CSV
- GET /api/categories - List available categories
- GET /api/search-history - View past searches
- MongoDB for search history storage

### Frontend
- Swiss minimalist design (IBM Plex Sans, Inter fonts)
- Category dropdown with 5 options + icons
- Location input with search functionality
- Grid-based results display with bordered cards
- Location cards showing:
  - Up to 3 images
  - Name, address, rating
  - Coordinates (monospace)
  - Website and Instagram links
- Floating CSV export button
- Loading skeletons and empty states
- Staggered fade-in animations

## Prioritized Backlog
### P0 (Critical) - DONE ✓
- [x] Google Places API integration
- [x] Category-based search
- [x] Results display with images
- [x] CSV export
- [x] Pagination (20 results per page)
- [x] Filter out items without address, website, or images

### P1 (High Priority)
- [ ] Pagination for large result sets
- [ ] Save favorite locations
- [ ] Filter by rating

### P2 (Medium Priority)
- [ ] Map view of results
- [ ] Share search results via link
- [ ] Dark mode toggle

## Tech Stack
- Frontend: React + Tailwind CSS + shadcn/ui
- Backend: FastAPI + Motor (async MongoDB)
- Database: MongoDB
- External API: Google Places API (New)
