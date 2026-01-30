from fastapi import FastAPI, APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import httpx
import csv
import io
from passlib.context import CryptContext

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Google Places API key
GOOGLE_PLACES_API_KEY = os.environ.get('GOOGLE_PLACES_API_KEY', '')

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Category to Google Place Types mapping
CATEGORY_TYPES = {
    "thrill_seeking": ["amusement_park", "bowling_alley", "tourist_attraction"],
    "super_chill": ["spa", "park", "zoo", "aquarium", "tourist_attraction"],
    "creative": ["museum", "art_gallery", "tourist_attraction"],
    "pure_entertainment": ["movie_theater", "night_club", "stadium", "performing_arts_theater"],
    "foodie": ["restaurant", "cafe", "bar", "meal_takeaway"]
}

# Category search keywords for text search - comprehensive and specific
CATEGORY_KEYWORDS = {
    "thrill_seeking": "axe throwing OR go kart OR karting OR escape room OR rock climbing gym OR bouldering OR zipline OR aerial adventure park OR ropes course OR paintball OR airsoft OR skydiving OR indoor skydiving OR water park OR theme park OR surf lessons OR ski resort OR jet ski rental OR whitewater rafting OR ATV tours OR trampoline park OR laser tag",
    "super_chill": "spa OR massage OR yoga studio OR pilates OR meditation center OR botanical garden OR hiking trail OR nature preserve OR mini golf OR bike trail OR bike rental OR pier OR boardwalk OR fishing charter OR city tour OR walking tour OR arcade OR barcade OR aquarium OR zoo OR scenic cruise OR harbor cruise OR golf course OR driving range",
    "creative": "paint and sip OR pottery class OR ceramics studio OR paint your own pottery OR candle making OR rug tufting OR tufting studio OR DIY workshop OR maker space OR art workshop OR woodworking class OR glassblowing class OR jewelry making OR flower bar OR immersive art OR interactive art exhibit OR selfie museum OR photo experience OR art museum OR art gallery",
    "pure_entertainment": "IMAX OR movie theater OR live music venue OR concert venue OR comedy club OR comedy show OR performing arts center OR theater OR playhouse OR arena OR stadium OR sports venue OR event venue OR symphony OR opera",
    "foodie": "restaurant OR rooftop bar OR rooftop lounge OR brunch OR speakeasy OR cocktail bar OR wine bar OR winery OR vineyard OR brewery OR taproom OR distillery OR food tour OR tasting tour OR cooking class OR culinary school OR food hall OR public market OR dinner cruise OR dessert bar OR afternoon tea"
}


# Models
class Photo(BaseModel):
    url: str
    height: int = 400
    width: int = 400


class PlaceResult(BaseModel):
    id: str
    name: str
    address: str
    latitude: float
    longitude: float
    website: Optional[str] = None
    instagram: Optional[str] = None
    description: Optional[str] = None
    photos: List[Photo] = []
    rating: Optional[float] = None
    category: str = ""


class SearchRequest(BaseModel):
    category: str
    location: str = ""  # City, area, or zip code
    region: str = ""  # Optional region filter
    location_names: List[str] = []  # Optional specific location names (up to 10)
    page: int = 1
    per_page: int = 20


# US Regions mapping
US_REGIONS = {
    "northeast": {
        "name": "Northeast Region",
        "states": ["Connecticut", "Maine", "Massachusetts", "New Hampshire", "Rhode Island", "Vermont", "New Jersey", "New York", "Pennsylvania"]
    },
    "southeast": {
        "name": "Southeast Region", 
        "states": ["Alabama", "Florida", "Georgia", "Kentucky", "Mississippi", "North Carolina", "South Carolina", "Tennessee", "Virginia", "West Virginia", "Maryland", "Delaware", "District of Columbia"]
    },
    "midwest": {
        "name": "Midwest Region",
        "states": ["Illinois", "Indiana", "Michigan", "Ohio", "Wisconsin", "Iowa", "Kansas", "Minnesota", "Missouri", "Nebraska", "North Dakota", "South Dakota"]
    },
    "southwest": {
        "name": "Southwest Region",
        "states": ["Arizona", "Arkansas", "Louisiana", "New Mexico", "Oklahoma", "Texas"]
    },
    "west_coast": {
        "name": "West Coast Region",
        "states": ["California", "Oregon", "Washington", "Nevada", "Idaho", "Montana", "Utah", "Wyoming", "Colorado", "Alaska", "Hawaii"]
    }
}


class SearchResponse(BaseModel):
    success: bool
    places: List[PlaceResult]
    total: int
    page: int
    per_page: int
    total_pages: int


class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StatusCheckCreate(BaseModel):
    client_name: str


# Helper function to extract Instagram from website or editorial summary
def extract_instagram(place_data: dict) -> Optional[str]:
    """Try to extract Instagram handle from place data"""
    website = place_data.get("websiteUri", "")
    if website and "instagram.com" in website.lower():
        return website
    return None


@api_router.get("/")
async def root():
    return {"message": "Google Maps Location Scraper API"}


@api_router.get("/categories")
async def get_categories():
    """Return list of available categories"""
    categories = [
        {"id": "thrill_seeking", "name": "Thrill Seeking", "description": "Adventurous outings like rock climbing, theme parks, paintball"},
        {"id": "super_chill", "name": "Super Chill", "description": "Relaxing items like spas, yoga, hiking trails, golf"},
        {"id": "creative", "name": "Creative", "description": "Arts like museums, DIY arts and crafts locations, workshops"},
        {"id": "pure_entertainment", "name": "Pure Entertainment", "description": "Venues for performing arts, theaters, concert venues"},
        {"id": "foodie", "name": "Foodie", "description": "Restaurants, wineries, breweries, cooking classes"}
    ]
    return {"categories": categories}


@api_router.get("/regions")
async def get_regions():
    """Return list of US regions with their states"""
    regions = []
    for region_id, region_data in US_REGIONS.items():
        regions.append({
            "id": region_id,
            "name": region_data["name"],
            "states": region_data["states"]
        })
    return {"regions": regions}


@api_router.post("/places/search", response_model=SearchResponse)
async def search_places(request: SearchRequest):
    """Search for places based on category and location"""
    
    if not GOOGLE_PLACES_API_KEY:
        logger.error("Google Places API key not configured")
        raise HTTPException(
            status_code=500,
            detail="Google Places API is not configured. Please add GOOGLE_PLACES_API_KEY to backend/.env"
        )
    
    if request.category not in CATEGORY_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category. Valid categories: {list(CATEGORY_TYPES.keys())}"
        )
    
    # Validate at least one location method is provided
    if not request.location and not request.region and not request.location_names:
        raise HTTPException(
            status_code=400,
            detail="Please provide a location (city/zip), region, or specific location names"
        )
    
    # Limit location names to 10
    location_names = request.location_names[:10] if request.location_names else []
    
    # Build list of locations to search
    search_locations = []
    
    # If specific location names provided, use those
    if location_names:
        for loc_name in location_names:
            if loc_name.strip():
                search_locations.append(loc_name.strip())
    
    # If region is selected, use states from that region
    if request.region and request.region in US_REGIONS:
        region_states = US_REGIONS[request.region]["states"]
        # Pick representative cities/states for broader coverage
        for state in region_states[:5]:  # Limit to first 5 states for performance
            search_locations.append(state)
    
    # If single location/zip provided
    if request.location:
        search_locations.append(request.location.strip())
    
    # Default to first location if multiple provided
    if not search_locations:
        raise HTTPException(
            status_code=400,
            detail="No valid search location provided"
        )
    
    try:
        all_places = []
        seen_ids = set()  # Track unique place IDs to prevent duplicates
        seen_names_addresses = set()  # Track name+address combos for additional dedup
        
        # Get keywords for this category
        keywords = CATEGORY_KEYWORDS.get(request.category, "")
        
        headers = {
            "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
            "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.websiteUri,places.rating,places.photos,places.editorialSummary,places.types"
        }
        
        async with httpx.AsyncClient(timeout=30.0) as http_client:
            # Search across all provided locations
            for search_location in search_locations:
                if len(all_places) >= 60:  # Cap total results
                    break
                
                # Use Text Search API (New) for better results
                search_payload = {
                    "textQuery": f"{keywords} in {search_location}",
                    "maxResultCount": 20
                }
                
                response = await http_client.post(
                    "https://places.googleapis.com/v1/places:searchText",
                    json=search_payload,
                    headers=headers
                )
                
                if response.status_code != 200:
                    logger.warning(f"Google API error for {search_location}: {response.status_code}")
                    continue
                
                data = response.json()
                
                for place in data.get("places", []):
                    # Skip places without photos
                    photos_data = place.get("photos", [])
                    if not photos_data:
                        continue
                    
                    # Skip places without website
                    website = place.get("websiteUri")
                    if not website:
                        continue
                    
                    # Skip places without proper address
                    address = place.get("formattedAddress", "")
                    if not address or address == "Address not available":
                        continue
                    
                    # Build photo URLs (up to 3)
                    photos = []
                    for photo in photos_data[:3]:
                        photo_name = photo.get("name", "")
                        if photo_name:
                            photo_url = f"https://places.googleapis.com/v1/{photo_name}/media?maxHeightPx=400&maxWidthPx=600&key={GOOGLE_PLACES_API_KEY}"
                            photos.append(Photo(url=photo_url, height=400, width=600))
                    
                    # Get location coordinates
                    location = place.get("location", {})
                    
                    # Get description from editorial summary
                    editorial = place.get("editorialSummary", {})
                    description = editorial.get("text", "") if editorial else ""
                    
                    place_result = PlaceResult(
                        id=place.get("id", str(uuid.uuid4())),
                        name=place.get("displayName", {}).get("text", "Unknown"),
                        address=address,
                        latitude=location.get("latitude", 0),
                        longitude=location.get("longitude", 0),
                        website=website,
                        instagram=extract_instagram(place),
                        description=description,
                        photos=photos,
                        rating=place.get("rating"),
                        category=request.category
                    )
                    
                    # Deduplication check by ID and name+address
                    place_id = place.get("id")
                    name_addr_key = f"{place_result.name}|{place_result.address}".lower()
                    
                    if place_id in seen_ids or name_addr_key in seen_names_addresses:
                        continue
                    
                    seen_ids.add(place_id)
                    seen_names_addresses.add(name_addr_key)
                    all_places.append(place_result)
            
            # Make additional searches with specific place types to get more results
            place_types = CATEGORY_TYPES.get(request.category, [])
            
            for place_type in place_types[:2]:
                if len(all_places) >= 60:  # Cap at 60 total results
                    break
                
                # Use first search location for additional searches
                additional_location = search_locations[0] if search_locations else ""
                if not additional_location:
                    break
                    
                search_payload = {
                    "textQuery": f"{place_type} in {additional_location}",
                    "maxResultCount": 20
                }
                
                response = await http_client.post(
                    "https://places.googleapis.com/v1/places:searchText",
                    json=search_payload,
                    headers=headers
                )
                
                if response.status_code == 200:
                    data = response.json()
                    for place in data.get("places", []):
                        # Skip places without photos
                        photos_data = place.get("photos", [])
                        if not photos_data:
                            continue
                        
                        # Skip places without website
                        website = place.get("websiteUri")
                        if not website:
                            continue
                        
                        # Skip places without proper address
                        address = place.get("formattedAddress", "")
                        if not address or address == "Address not available":
                            continue
                        
                        photos = []
                        for photo in photos_data[:3]:
                            photo_name = photo.get("name", "")
                            if photo_name:
                                photo_url = f"https://places.googleapis.com/v1/{photo_name}/media?maxHeightPx=400&maxWidthPx=600&key={GOOGLE_PLACES_API_KEY}"
                                photos.append(Photo(url=photo_url, height=400, width=600))
                        
                        location = place.get("location", {})
                        editorial = place.get("editorialSummary", {})
                        description = editorial.get("text", "") if editorial else ""
                        
                        place_result = PlaceResult(
                            id=place.get("id", str(uuid.uuid4())),
                            name=place.get("displayName", {}).get("text", "Unknown"),
                            address=address,
                            latitude=location.get("latitude", 0),
                            longitude=location.get("longitude", 0),
                            website=website,
                            instagram=extract_instagram(place),
                            description=description,
                            photos=photos,
                            rating=place.get("rating"),
                            category=request.category
                        )
                        
                        # Deduplication check by ID and name+address
                        place_id = place.get("id")
                        name_addr_key = f"{place_result.name}|{place_result.address}".lower()
                        
                        if place_id in seen_ids or name_addr_key in seen_names_addresses:
                            continue
                        
                        seen_ids.add(place_id)
                        seen_names_addresses.add(name_addr_key)
                        all_places.append(place_result)
        
        # Store search in history
        search_history = {
            "id": str(uuid.uuid4()),
            "category": request.category,
            "location": request.location,
            "region": request.region,
            "location_names": location_names,
            "results_count": len(all_places),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        await db.search_history.insert_one(search_history)
        
        # Pagination
        total = len(all_places)
        per_page = request.per_page
        total_pages = (total + per_page - 1) // per_page if total > 0 else 1
        page = max(1, min(request.page, total_pages))
        
        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        paginated_places = all_places[start_idx:end_idx]
        
        return SearchResponse(
            success=True,
            places=paginated_places,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=total_pages
        )
    
    except httpx.RequestError as e:
        logger.error(f"Request error: {str(e)}")
        raise HTTPException(
            status_code=502,
            detail="Failed to connect to Google Places API"
        )
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )


@api_router.post("/places/export-csv")
async def export_places_to_csv(places: List[PlaceResult]):
    """Export places to CSV file"""
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header
    writer.writerow([
        "Name",
        "Address",
        "Latitude",
        "Longitude",
        "Website",
        "Instagram",
        "Description",
        "Rating",
        "Image 1",
        "Image 2",
        "Image 3"
    ])
    
    # Write data
    for place in places:
        photos = place.photos if place.photos else []
        writer.writerow([
            place.name,
            place.address,
            place.latitude,
            place.longitude,
            place.website or "",
            place.instagram or "",
            place.description or "",
            place.rating or "",
            photos[0].url if len(photos) > 0 else "",
            photos[1].url if len(photos) > 1 else "",
            photos[2].url if len(photos) > 2 else ""
        ])
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=locations.csv"}
    )


@api_router.get("/search-history")
async def get_search_history(limit: int = Query(default=10, le=100)):
    """Get recent search history"""
    history = await db.search_history.find(
        {},
        {"_id": 0, "id": 1, "category": 1, "location": 1, "results_count": 1, "timestamp": 1}
    ).sort("timestamp", -1).limit(limit).to_list(length=limit)
    return {"history": history}


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    _ = await db.status_checks.insert_one(doc)
    return status_obj


@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks(limit: int = Query(default=100, le=1000)):
    status_checks = await db.status_checks.find(
        {}, 
        {"_id": 0, "id": 1, "client_name": 1, "timestamp": 1}
    ).sort("timestamp", -1).limit(limit).to_list(length=limit)
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    return status_checks


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
