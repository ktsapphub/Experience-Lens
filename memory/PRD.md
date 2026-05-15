# MapData Collector - Product Requirements Document

## Original Problem Statement
Build a Google Maps information scraper with category-based and specific location searches. Features URL shortening via short.io for custom domain links.

## Tech Stack
- Frontend: React + Tailwind CSS + shadcn/ui + react-router-dom
- Backend: FastAPI + Motor (async MongoDB)
- Database: MongoDB
- External APIs: Google Places API (New), short.io (link.mydatejar.com)

## Pages
1. **Search** — Multi-category search, results grid, URL shortening, CSV export
2. **History** — Past search records
3. **Config** — System info and keyword management

## Completed Features
- [x] Multi-category selection (toggle any combination of 5 categories)
- [x] Google Places API integration & search
- [x] Instagram scraping from business websites
- [x] Phone, Price Range ($/$$/$$) from Google Places
- [x] Yellow border for missing descriptions, broken image handling
- [x] Search progress indicator (3 phases)
- [x] Specific Places search without category
- [x] short.io integration — bulk/individual URL shortening to link.mydatejar.com
- [x] Short link status indicators (pending/success/error) per card
- [x] CSV export uses short URLs when available
- [x] Image count badges, broken image exclusion from CSV
- [x] New/Seen badges, Remove, Selection checkboxes, Pagination

## Prioritized Backlog
### P1
- [ ] Saved Searches
- [ ] Map View
- [ ] Rating Filter
- [ ] Secure Routes

### P2
- [ ] Notes, Filter by "New", Refactor App.js

## Key Credentials
- Email: joseph@centurion-pm.com / #Test1234
- short.io domain: link.mydatejar.com
