from fastapi import FastAPI, APIRouter, HTTPException, Query, UploadFile, File
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
import re
import asyncio
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

# App Configuration
APP_VERSION = "1.0.0"
API_VERSION = "Google Places API (New) v1"
BUILD_DATE = "2026-01-30"

# Default Category to Google Place Types mapping
DEFAULT_CATEGORY_TYPES = {
    "thrill_seeking": ["amusement_park", "bowling_alley", "tourist_attraction"],
    "super_chill": ["spa", "park", "zoo", "aquarium", "tourist_attraction"],
    "creative": ["museum", "art_gallery", "tourist_attraction"],
    "pure_entertainment": ["movie_theater", "night_club", "stadium", "performing_arts_theater"],
    "foodie": ["restaurant", "cafe", "bar", "meal_takeaway"]
}

# Default Category search keywords
DEFAULT_CATEGORY_KEYWORDS = {
    "thrill_seeking": "axe throwing OR go kart OR karting OR escape room OR rock climbing gym OR bouldering OR zipline OR aerial adventure park OR ropes course OR paintball OR airsoft OR skydiving OR indoor skydiving OR water park OR theme park OR surf lessons OR ski resort OR jet ski rental OR whitewater rafting OR ATV tours OR trampoline park OR laser tag",
    "super_chill": "spa OR massage OR yoga studio OR pilates OR meditation center OR botanical garden OR hiking trail OR nature preserve OR mini golf OR bike trail OR bike rental OR pier OR boardwalk OR fishing charter OR city tour OR walking tour OR arcade OR barcade OR aquarium OR zoo OR scenic cruise OR harbor cruise OR golf course OR driving range",
    "creative": "paint and sip OR pottery class OR ceramics studio OR paint your own pottery OR candle making OR rug tufting OR tufting studio OR DIY workshop OR maker space OR art workshop OR woodworking class OR glassblowing class OR jewelry making OR flower bar OR immersive art OR interactive art exhibit OR selfie museum OR photo experience OR art museum OR art gallery",
    "pure_entertainment": "IMAX OR movie theater OR live music venue OR concert venue OR comedy club OR comedy show OR performing arts center OR theater OR playhouse OR arena OR stadium OR sports venue OR event venue OR symphony OR opera",
    "foodie": "restaurant OR rooftop bar OR rooftop lounge OR brunch OR speakeasy OR cocktail bar OR wine bar OR winery OR vineyard OR brewery OR taproom OR distillery OR food tour OR tasting tour OR cooking class OR culinary school OR food hall OR public market OR dinner cruise OR dessert bar OR afternoon tea"
}

# Runtime config (can be modified via API)
CATEGORY_TYPES = DEFAULT_CATEGORY_TYPES.copy()
CATEGORY_KEYWORDS = DEFAULT_CATEGORY_KEYWORDS.copy()


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
    phone: Optional[str] = None
    instagram: Optional[str] = None
    description: Optional[str] = None
    photos: List[Photo] = []
    rating: Optional[float] = None
    category: str = ""


class SearchRequest(BaseModel):
    category: str = ""  # Optional for specific location searches
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


# User Models
class UserCreate(BaseModel):
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: str
    email: str
    created_at: str


# Configuration Models
class CategoryConfig(BaseModel):
    category_id: str
    place_types: List[str]
    keywords: str


class ConfigUpdate(BaseModel):
    category_id: str
    place_types: Optional[List[str]] = None
    keywords: Optional[str] = None


class SearchHistoryResult(BaseModel):
    name: str
    address: str
    website: Optional[str] = None


class SearchHistoryEntry(BaseModel):
    id: str
    timestamp: str
    category: str
    search_method: str
    location: str
    region: str
    location_names: List[str]
    results_count: int
    results: List[SearchHistoryResult]


# Helper function to extract Instagram from website or editorial summary
def extract_instagram(place_data: dict) -> Optional[str]:
    """Try to extract Instagram handle from place data"""
    website = place_data.get("websiteUri", "")
    if website and "instagram.com" in website.lower():
        return website
    return None


# Regex patterns to find Instagram links in HTML
INSTAGRAM_PATTERNS = [
    re.compile(r'href=["\'](?:https?://)?(?:www\.)?instagram\.com/([a-zA-Z0-9_.]+)/?["\']', re.IGNORECASE),
    re.compile(r'(?:https?://)?(?:www\.)?instagram\.com/([a-zA-Z0-9_.]+)/?', re.IGNORECASE),
]

# Handles to skip (not real user profiles)
INSTAGRAM_SKIP = {'explore', 'p', 'reel', 'reels', 'stories', 'accounts', 'direct', 'about', 'developer', 'legal', 'privacy', 'terms', 'api', 'press', ''}


def parse_instagram_handle(html: str) -> Optional[str]:
    """Extract Instagram handle from HTML content."""
    # First try href-based pattern (more reliable, from actual links)
    for pattern in INSTAGRAM_PATTERNS:
        matches = pattern.findall(html)
        for match in matches:
            handle = match.strip().rstrip('/').lower()
            if handle and handle not in INSTAGRAM_SKIP and len(handle) <= 30:
                return handle
    return None


async def scrape_instagram_from_website(http_client: httpx.AsyncClient, website_url: str) -> Optional[str]:
    """Fetch a business website and extract Instagram handle from its HTML."""
    if not website_url:
        return None
    try:
        response = await http_client.get(
            website_url,
            follow_redirects=True,
            timeout=5.0,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        )
        if response.status_code == 200:
            # Only parse first 200KB to avoid huge pages
            html = response.text[:200000]
            return parse_instagram_handle(html)
    except Exception:
        pass
    return None


async def enrich_places_with_instagram(places: list, http_client: httpx.AsyncClient) -> list:
    """Concurrently scrape Instagram handles for all places that don't have one."""
    tasks = []
    indices = []
    for i, place in enumerate(places):
        if not place.instagram and place.website:
            tasks.append(scrape_instagram_from_website(http_client, place.website))
            indices.append(i)

    if not tasks:
        return places

    results = await asyncio.gather(*tasks, return_exceptions=True)
    for idx, result in zip(indices, results):
        if isinstance(result, str) and result:
            handle = result
            places[idx].instagram = f"https://instagram.com/{handle}"
    return places


@api_router.get("/")
async def root():
    return {"message": "Google Maps Location Scraper API"}


# User Authentication Endpoints
@api_router.post("/auth/register", response_model=UserResponse)
async def register_user(user: UserCreate):
    """Register a new user"""
    # Check if user already exists
    existing_user = await db.users.find_one({"email": user.email.lower()})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Hash password and create user
    hashed_password = pwd_context.hash(user.password)
    user_doc = {
        "id": str(uuid.uuid4()),
        "email": user.email.lower(),
        "password": hashed_password,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(user_doc)
    
    return UserResponse(
        id=user_doc["id"],
        email=user_doc["email"],
        created_at=user_doc["created_at"]
    )


@api_router.post("/auth/login")
async def login_user(user: UserLogin):
    """Login user"""
    db_user = await db.users.find_one({"email": user.email.lower()})
    
    if not db_user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not pwd_context.verify(user.password, db_user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    return {
        "success": True,
        "message": "Login successful",
        "user": {
            "id": db_user["id"],
            "email": db_user["email"]
        }
    }


@api_router.get("/users", response_model=List[UserResponse])
async def get_users():
    """Get all users"""
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(100)
    return [UserResponse(id=u["id"], email=u["email"], created_at=u["created_at"]) for u in users]


# Configuration Endpoints
@api_router.get("/config")
async def get_config():
    """Get application configuration"""
    return {
        "app_version": APP_VERSION,
        "api_version": API_VERSION,
        "build_date": BUILD_DATE,
        "tech_stack": {
            "frontend": "React 18 + Tailwind CSS + shadcn/ui",
            "backend": "FastAPI + Motor (async MongoDB)",
            "database": "MongoDB",
            "external_api": "Google Places API (New)"
        },
        "protocol": {
            "search_method": "Text Search API with category-specific keywords",
            "deduplication": "Place ID + Name/Address combination",
            "filtering": "Requires address, website, and photos",
            "pagination": "20 results per page, max 60 total per search"
        },
        "categories": {
            category_id: {
                "place_types": CATEGORY_TYPES.get(category_id, []),
                "keywords": CATEGORY_KEYWORDS.get(category_id, "")
            }
            for category_id in CATEGORY_TYPES.keys()
        }
    }


@api_router.put("/config/category")
async def update_category_config(config: ConfigUpdate):
    """Update category configuration"""
    global CATEGORY_TYPES, CATEGORY_KEYWORDS
    
    if config.category_id not in DEFAULT_CATEGORY_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid category: {config.category_id}")
    
    if config.place_types is not None:
        CATEGORY_TYPES[config.category_id] = config.place_types
    
    if config.keywords is not None:
        CATEGORY_KEYWORDS[config.category_id] = config.keywords
    
    # Store in database for persistence
    await db.config.update_one(
        {"category_id": config.category_id},
        {"$set": {
            "category_id": config.category_id,
            "place_types": CATEGORY_TYPES[config.category_id],
            "keywords": CATEGORY_KEYWORDS[config.category_id],
            "updated_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    
    return {
        "success": True,
        "message": f"Configuration updated for {config.category_id}",
        "config": {
            "place_types": CATEGORY_TYPES[config.category_id],
            "keywords": CATEGORY_KEYWORDS[config.category_id]
        }
    }


@api_router.post("/config/reset")
async def reset_config():
    """Reset configuration to defaults"""
    global CATEGORY_TYPES, CATEGORY_KEYWORDS
    CATEGORY_TYPES = DEFAULT_CATEGORY_TYPES.copy()
    CATEGORY_KEYWORDS = DEFAULT_CATEGORY_KEYWORDS.copy()
    await db.config.delete_many({})
    return {"success": True, "message": "Configuration reset to defaults"}


# Enhanced Search History Endpoints
@api_router.get("/history")
async def get_search_history(limit: int = Query(default=50, le=200)):
    """Get detailed search history"""
    history = await db.search_history.find(
        {},
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(length=limit)
    return {"history": history}


@api_router.get("/history/{history_id}")
async def get_history_entry(history_id: str):
    """Get single history entry with full results"""
    entry = await db.search_history.find_one(
        {"id": history_id},
        {"_id": 0}
    )
    if not entry:
        raise HTTPException(status_code=404, detail="History entry not found")
    return entry


@api_router.delete("/history/{history_id}")
async def delete_history_entry(history_id: str):
    """Delete a history entry"""
    result = await db.search_history.delete_one({"id": history_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="History entry not found")
    return {"success": True, "message": "History entry deleted"}


@api_router.delete("/history")
async def clear_history():
    """Clear all search history"""
    await db.search_history.delete_many({})
    return {"success": True, "message": "All history cleared"}


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
    
    if request.category and request.category not in CATEGORY_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category. Valid categories: {list(CATEGORY_TYPES.keys())}"
        )
    
    # Category is required unless searching by specific location names
    if not request.category and not request.location_names:
        raise HTTPException(
            status_code=400,
            detail="Please select a category, or use specific location names to search without one"
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
        
        # Get keywords for this category (empty if no category)
        keywords = CATEGORY_KEYWORDS.get(request.category, "") if request.category else ""
        
        # Determine if this is a direct location name search (no category)
        is_direct_search = not request.category and bool(request.location_names)
        
        headers = {
            "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
            "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.websiteUri,places.internationalPhoneNumber,places.rating,places.photos,places.editorialSummary,places.types"
        }
        
        async with httpx.AsyncClient(timeout=30.0) as http_client:
            # Search across all provided locations
            for search_location in search_locations:
                if len(all_places) >= 60:  # Cap total results
                    break
                
                # Use Text Search API (New) for better results
                # Direct search uses location name as-is; category search prepends keywords
                if is_direct_search:
                    text_query = search_location
                else:
                    text_query = f"{keywords} in {search_location}"
                
                search_payload = {
                    "textQuery": text_query,
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
                        phone=place.get("internationalPhoneNumber"),
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
            
            # Make additional searches with specific place types to get more results (only with category)
            place_types = CATEGORY_TYPES.get(request.category, []) if request.category else []
            
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
                            phone=place.get("internationalPhoneNumber"),
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
        
        # Enrich places with Instagram handles from their websites
        async with httpx.AsyncClient(timeout=10.0) as ig_client:
            all_places = await enrich_places_with_instagram(all_places, ig_client)

        # Store search in history with results
        # Determine search method
        search_method = "location"
        if request.region:
            search_method = "region"
        elif request.location_names and len(request.location_names) > 0:
            search_method = "specific"
        
        # Prepare results for history (text only)
        history_results = [
            {
                "name": p.name,
                "address": p.address,
                "website": p.website
            }
            for p in all_places
        ]
        
        search_history = {
            "id": str(uuid.uuid4()),
            "category": request.category,
            "search_method": search_method,
            "location": request.location,
            "region": request.region,
            "location_names": location_names,
            "results_count": len(all_places),
            "results": history_results,
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
    
    # Experience Type mapping (category_id to display name)
    EXPERIENCE_TYPE_NAMES = {
        "thrill_seeking": "Thrill Seeking",
        "super_chill": "Super Chill",
        "creative": "Creative",
        "pure_entertainment": "Pure Entertainment",
        "foodie": "Foodie"
    }
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header with Experience Type as first column
    writer.writerow([
        "Experience Type",
        "Name",
        "Address",
        "Latitude",
        "Longitude",
        "Website",
        "Phone",
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
        # Get experience type display name, default to empty if not found
        experience_type = EXPERIENCE_TYPE_NAMES.get(place.category, place.category or "")
        # Extract Instagram handle only (no @ or full URL)
        ig_handle = ""
        if place.instagram:
            ig_url = place.instagram.lower().rstrip('/')
            # Extract handle from URL like https://instagram.com/handle
            ig_match = re.search(r'instagram\.com/([a-zA-Z0-9_.]+)', ig_url)
            if ig_match:
                ig_handle = ig_match.group(1)
            else:
                # If it's already just a handle
                ig_handle = place.instagram.lstrip('@')
        writer.writerow([
            experience_type,
            place.name,
            place.address,
            place.latitude,
            place.longitude,
            place.website or "",
            place.phone or "",
            ig_handle,
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


# ======== IMPORT & CROSS-CHECK ENDPOINTS ========

# Gemini LLM key
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

# Column mapping for import (matches export format)
IMPORT_COLUMNS = [
    "Experience Type", "Name", "Address", "Latitude", "Longitude",
    "Website", "Phone", "Instagram", "Description", "Rating",
    "Image 1", "Image 2", "Image 3"
]

# Also support old format without Phone column
IMPORT_COLUMNS_OLD = [
    "Experience Type", "Name", "Address", "Latitude", "Longitude",
    "Website", "Instagram", "Description", "Rating",
    "Image 1", "Image 2", "Image 3"
]


class ImportedLocation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    experience_type: str = ""
    name: str = ""
    address: str = ""
    latitude: float = 0
    longitude: float = 0
    website: str = ""
    phone: str = ""
    instagram: str = ""
    description: str = ""
    rating: Optional[float] = None
    images: List[str] = []


class CrossCheckResult(BaseModel):
    id: str
    original: ImportedLocation
    google: Optional[ImportedLocation] = None
    discrepancies: dict = {}
    matched: bool = False


class DescriptionRequest(BaseModel):
    name: str
    address: str = ""
    category: str = ""
    website: str = ""


def parse_csv_row(row: dict, has_phone: bool) -> ImportedLocation:
    """Parse a single CSV/Excel row into an ImportedLocation."""
    images = []
    for i in range(1, 4):
        img = (row.get(f"Image {i}") or "").strip()
        if img:
            images.append(img)

    rating_str = (row.get("Rating") or "").strip()
    rating = None
    if rating_str:
        try:
            rating = float(rating_str)
        except ValueError:
            pass

    lat_str = (row.get("Latitude") or "0").strip()
    lng_str = (row.get("Longitude") or "0").strip()
    try:
        lat = float(lat_str)
    except ValueError:
        lat = 0
    try:
        lng = float(lng_str)
    except ValueError:
        lng = 0

    ig_raw = (row.get("Instagram") or "").strip()
    # Normalize: if it's just a handle, convert to full URL for consistency
    ig = ""
    if ig_raw:
        if "instagram.com" in ig_raw.lower():
            ig = ig_raw
        else:
            ig = f"https://instagram.com/{ig_raw.lstrip('@')}"

    return ImportedLocation(
        experience_type=(row.get("Experience Type") or "").strip(),
        name=(row.get("Name") or "").strip(),
        address=(row.get("Address") or "").strip(),
        latitude=lat,
        longitude=lng,
        website=(row.get("Website") or "").strip(),
        phone=(row.get("Phone") or "").strip() if has_phone else "",
        instagram=ig,
        description=(row.get("Description") or "").strip(),
        rating=rating,
        images=images,
    )


@api_router.post("/import/upload")
async def upload_import_file(file: UploadFile = File(...)):
    """Parse an uploaded CSV or Excel file and return structured location data."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ("csv", "xlsx", "xls"):
        raise HTTPException(status_code=400, detail="Unsupported file type. Please upload CSV or Excel (.xlsx)")

    content = await file.read()
    locations = []

    try:
        if ext == "csv":
            text = content.decode("utf-8-sig")
            reader = csv.DictReader(io.StringIO(text))
            headers = reader.fieldnames or []
            has_phone = "Phone" in headers
            for row in reader:
                loc = parse_csv_row(row, has_phone)
                if loc.name:
                    locations.append(loc)
        else:
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True)
            ws = wb.active
            rows = list(ws.iter_rows(values_only=True))
            if len(rows) < 2:
                raise HTTPException(status_code=400, detail="File has no data rows")
            headers = [str(h).strip() if h else "" for h in rows[0]]
            has_phone = "Phone" in headers
            for row_values in rows[1:]:
                row_dict = {headers[i]: (str(row_values[i]) if i < len(row_values) and row_values[i] is not None else "") for i in range(len(headers))}
                loc = parse_csv_row(row_dict, has_phone)
                if loc.name:
                    locations.append(loc)
            wb.close()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error parsing import file: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {str(e)}")

    return {"success": True, "locations": [loc.model_dump() for loc in locations], "count": len(locations)}


async def lookup_google_place(http_client: httpx.AsyncClient, name: str, address: str) -> Optional[dict]:
    """Search Google Places for a single location by name and address."""
    query = name
    if address:
        query = f"{name} {address}"

    headers = {
        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.websiteUri,places.internationalPhoneNumber,places.rating,places.photos,places.editorialSummary"
    }
    payload = {"textQuery": query, "maxResultCount": 1}

    try:
        resp = await http_client.post(
            "https://places.googleapis.com/v1/places:searchText",
            json=payload,
            headers=headers,
            timeout=15.0
        )
        if resp.status_code == 200:
            places = resp.json().get("places", [])
            if places:
                return places[0]
    except Exception as e:
        logger.warning(f"Google lookup failed for '{name}': {e}")
    return None


def google_place_to_imported(place: dict) -> ImportedLocation:
    """Convert a Google Places API result to ImportedLocation."""
    photos_data = place.get("photos", [])
    images = []
    for photo in photos_data[:3]:
        photo_name = photo.get("name", "")
        if photo_name:
            images.append(f"https://places.googleapis.com/v1/{photo_name}/media?maxHeightPx=400&maxWidthPx=600&key={GOOGLE_PLACES_API_KEY}")

    editorial = place.get("editorialSummary", {})
    description = editorial.get("text", "") if editorial else ""
    location = place.get("location", {})

    website = place.get("websiteUri", "")
    ig = ""
    if website and "instagram.com" in website.lower():
        ig = website

    return ImportedLocation(
        name=place.get("displayName", {}).get("text", ""),
        address=place.get("formattedAddress", ""),
        latitude=location.get("latitude", 0),
        longitude=location.get("longitude", 0),
        website=website if "instagram.com" not in (website or "").lower() else "",
        phone=place.get("internationalPhoneNumber", ""),
        instagram=ig,
        description=description,
        rating=place.get("rating"),
        images=images,
    )


def find_discrepancies(original: ImportedLocation, google: ImportedLocation) -> dict:
    """Compare original and Google data, return dict of field discrepancies."""
    discrepancies = {}
    fields_to_check = [
        ("address", "Address"),
        ("website", "Website"),
        ("phone", "Phone"),
        ("description", "Description"),
        ("rating", "Rating"),
    ]
    for field, label in fields_to_check:
        orig_val = getattr(original, field)
        goog_val = getattr(google, field)
        # Normalize for comparison
        orig_str = str(orig_val).strip().lower() if orig_val else ""
        goog_str = str(goog_val).strip().lower() if goog_val else ""
        # Only flag if BOTH have data and they differ
        if orig_str and goog_str and orig_str != goog_str:
            discrepancies[field] = {
                "original": str(orig_val).strip() if orig_val else "",
                "google": str(goog_val).strip() if goog_val else "",
                "label": label
            }

    # Check images - only if Google has images and original doesn't (or has fewer)
    if len(google.images) > len(original.images) and len(original.images) == 0:
        discrepancies["images"] = {
            "original": f"{len(original.images)} images",
            "google": f"{len(google.images)} images",
            "label": "Images"
        }

    return discrepancies


@api_router.post("/import/cross-check")
async def cross_check_locations(locations: List[ImportedLocation]):
    """Cross-check imported locations against Google Places API."""
    if not GOOGLE_PLACES_API_KEY:
        raise HTTPException(status_code=500, detail="Google Places API key not configured")

    results = []

    async with httpx.AsyncClient(timeout=30.0) as http_client:
        # Process in batches of 5 for concurrency
        for i in range(0, len(locations), 5):
            batch = locations[i:i+5]
            tasks = [lookup_google_place(http_client, loc.name, loc.address) for loc in batch]
            google_results = await asyncio.gather(*tasks, return_exceptions=True)

            for loc, gresult in zip(batch, google_results):
                if isinstance(gresult, Exception) or gresult is None:
                    results.append(CrossCheckResult(
                        id=loc.id,
                        original=loc,
                        google=None,
                        discrepancies={},
                        matched=False
                    ))
                    continue

                google_loc = google_place_to_imported(gresult)
                discreps = find_discrepancies(loc, google_loc)

                # Auto-fill missing fields from Google (no discrepancy, just blank originals)
                filled = loc.model_copy()
                if not filled.address and google_loc.address:
                    filled.address = google_loc.address
                if not filled.website and google_loc.website:
                    filled.website = google_loc.website
                if not filled.phone and google_loc.phone:
                    filled.phone = google_loc.phone
                if not filled.description and google_loc.description:
                    filled.description = google_loc.description
                if filled.rating is None and google_loc.rating is not None:
                    filled.rating = google_loc.rating
                if not filled.images and google_loc.images:
                    filled.images = google_loc.images
                if filled.latitude == 0 and google_loc.latitude != 0:
                    filled.latitude = google_loc.latitude
                if filled.longitude == 0 and google_loc.longitude != 0:
                    filled.longitude = google_loc.longitude
                if not filled.instagram and google_loc.instagram:
                    filled.instagram = google_loc.instagram

                results.append(CrossCheckResult(
                    id=loc.id,
                    original=filled,
                    google=google_loc,
                    discrepancies=discreps,
                    matched=True
                ))

        # Enrich with Instagram from websites
        filled_locs = [r.original for r in results if r.matched and not r.original.instagram and r.original.website]
        if filled_locs:
            async with httpx.AsyncClient(timeout=10.0) as ig_client:
                ig_tasks = [scrape_instagram_from_website(ig_client, loc.website) for loc in filled_locs]
                ig_results = await asyncio.gather(*ig_tasks, return_exceptions=True)
                ig_idx = 0
                for r in results:
                    if r.matched and not r.original.instagram and r.original.website:
                        handle = ig_results[ig_idx] if ig_idx < len(ig_results) else None
                        if isinstance(handle, str) and handle:
                            r.original.instagram = f"https://instagram.com/{handle}"
                        ig_idx += 1

    return {"success": True, "results": [r.model_dump() for r in results]}


@api_router.post("/import/generate-description")
async def generate_description(request: DescriptionRequest):
    """Generate a short description for a location using Gemini."""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key not configured")

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"desc-{uuid.uuid4()}",
            system_message="You are a concise location description writer. Write engaging, factual mini-descriptions for businesses and places. Keep descriptions under 500 characters. Do not use quotes around the description. Just output the description text directly."
        ).with_model("gemini", "gemini-2.5-flash")

        prompt = f"Write a short, engaging description (max 500 characters) for this place:\nName: {request.name}"
        if request.address:
            prompt += f"\nAddress: {request.address}"
        if request.category:
            prompt += f"\nCategory: {request.category}"
        if request.website:
            prompt += f"\nWebsite: {request.website}"

        user_message = UserMessage(text=prompt)
        response = await chat.send_message(user_message)
        description = response.strip().strip('"').strip("'")
        # Enforce 500 char limit
        if len(description) > 500:
            description = description[:497] + "..."

        return {"success": True, "description": description}
    except Exception as e:
        logger.error(f"Description generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate description: {str(e)}")


@api_router.post("/import/export-csv")
async def export_import_csv(locations: List[ImportedLocation]):
    """Export cross-checked/enriched locations to CSV."""
    EXPERIENCE_TYPE_NAMES = {
        "thrill_seeking": "Thrill Seeking",
        "super_chill": "Super Chill",
        "creative": "Creative",
        "pure_entertainment": "Pure Entertainment",
        "foodie": "Foodie"
    }

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Experience Type", "Name", "Address", "Latitude", "Longitude",
        "Website", "Phone", "Instagram", "Description", "Rating",
        "Image 1", "Image 2", "Image 3"
    ])

    for loc in locations:
        exp_type = EXPERIENCE_TYPE_NAMES.get(loc.experience_type, loc.experience_type or "")
        # Extract IG handle
        ig_handle = ""
        if loc.instagram:
            ig_match = re.search(r'instagram\.com/([a-zA-Z0-9_.]+)', loc.instagram.lower().rstrip('/'))
            if ig_match:
                ig_handle = ig_match.group(1)
            else:
                ig_handle = loc.instagram.lstrip('@')

        writer.writerow([
            exp_type,
            loc.name,
            loc.address,
            loc.latitude,
            loc.longitude,
            loc.website or "",
            loc.phone or "",
            ig_handle,
            loc.description or "",
            loc.rating or "",
            loc.images[0] if len(loc.images) > 0 else "",
            loc.images[1] if len(loc.images) > 1 else "",
            loc.images[2] if len(loc.images) > 2 else "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=enriched-locations.csv"}
    )


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
