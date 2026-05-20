"""
Backend API Tests for Google Maps Location Scraper
Tests: Categories, Regions, Search, CSV Export with Instagram handle, History, Config
"""
import pytest
import requests
import os
import re

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestBasicEndpoints:
    """Test basic API endpoints"""
    
    def test_root_endpoint(self):
        """Test root API endpoint"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"✓ Root endpoint: {data['message']}")
    
    def test_categories_endpoint(self):
        """Test categories endpoint returns all 5 categories"""
        response = requests.get(f"{BASE_URL}/api/categories")
        assert response.status_code == 200
        data = response.json()
        assert "categories" in data
        assert len(data["categories"]) == 5
        category_ids = [c["id"] for c in data["categories"]]
        expected_ids = ["thrill_seeking", "super_chill", "creative", "pure_entertainment", "foodie"]
        for expected_id in expected_ids:
            assert expected_id in category_ids, f"Missing category: {expected_id}"
        print(f"✓ Categories endpoint: {len(data['categories'])} categories returned")
    
    def test_regions_endpoint(self):
        """Test regions endpoint returns all 5 US regions"""
        response = requests.get(f"{BASE_URL}/api/regions")
        assert response.status_code == 200
        data = response.json()
        assert "regions" in data
        assert len(data["regions"]) == 5
        region_ids = [r["id"] for r in data["regions"]]
        expected_regions = ["northeast", "southeast", "midwest", "southwest", "west_coast"]
        for expected_region in expected_regions:
            assert expected_region in region_ids, f"Missing region: {expected_region}"
        print(f"✓ Regions endpoint: {len(data['regions'])} regions returned")
    
    def test_config_endpoint(self):
        """Test config endpoint returns proper configuration"""
        response = requests.get(f"{BASE_URL}/api/config")
        assert response.status_code == 200
        data = response.json()
        assert "app_version" in data
        assert "api_version" in data
        assert "tech_stack" in data
        assert "categories" in data
        print(f"✓ Config endpoint: App version {data['app_version']}")


class TestSearchAPI:
    """Test search API with Google Places integration"""
    
    def test_search_requires_category(self):
        """Test search fails without category"""
        response = requests.post(f"{BASE_URL}/api/places/search", json={
            "category": "",
            "location": "New York, NY"
        })
        assert response.status_code in [400, 422]
        print("✓ Search validation: category required")
    
    def test_search_requires_location(self):
        """Test search fails without location parameters"""
        response = requests.post(f"{BASE_URL}/api/places/search", json={
            "category": "foodie"
        })
        assert response.status_code == 400
        print("✓ Search validation: location required")
    
    def test_search_invalid_category(self):
        """Test search fails with invalid category"""
        response = requests.post(f"{BASE_URL}/api/places/search", json={
            "category": "invalid_category",
            "location": "New York, NY"
        })
        assert response.status_code == 400
        print("✓ Search validation: invalid category rejected")
    
    def test_search_foodie_nyc(self):
        """Test search with Foodie category in NYC - should return results with descriptions and Instagram"""
        response = requests.post(f"{BASE_URL}/api/places/search", json={
            "category": "foodie",
            "location": "New York, NY",
            "page": 1,
            "per_page": 20
        }, timeout=60)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] 
        assert data["total"] > 0
        assert len(data["places"]) > 0
        
        # Validate place structure
        place = data["places"][0]
        assert "id" in place
        assert "name" in place
        assert "address" in place
        assert "website" in place
        assert "latitude" in place
        assert "longitude" in place
        assert "photos" in place
        assert "category" in place
        assert place["category"] == "foodie"
        
        # Check if some places have Instagram (after scraping)
        places_with_instagram = [p for p in data["places"] if p.get("instagram")]
        print(f"✓ Search Foodie NYC: {data['total']} total, {len(data['places'])} returned, {len(places_with_instagram)} with Instagram")
        
        # Check for places with and without descriptions (for yellow border testing)
        places_with_desc = [p for p in data["places"] if p.get("description")]
        places_without_desc = [p for p in data["places"] if not p.get("description")]
        print(f"  - {len(places_with_desc)} with description, {len(places_without_desc)} without description")
        
        return data["places"]


class TestCSVExport:
    """Test CSV export functionality including Instagram handle format"""
    
    def test_csv_export_empty(self):
        """Test CSV export with empty list"""
        response = requests.post(f"{BASE_URL}/api/places/export-csv", json=[])
        assert response.status_code == 200
        content = response.text
        # Should have header row
        assert "Experience Type" in content
        assert "Instagram" in content
        print("✓ CSV export empty list: headers present")
    
    def test_csv_export_with_instagram_handle(self):
        """Test CSV export extracts just the Instagram handle (not full URL or @)"""
        test_places = [
            {
                "id": "test1",
                "name": "Test Restaurant",
                "address": "123 Test St, NYC",
                "latitude": 40.7128,
                "longitude": -74.0060,
                "website": "https://testrestaurant.com",
                "instagram": "https://instagram.com/testrestaurant",
                "description": "A test restaurant",
                "rating": 4.5,
                "category": "foodie",
                "photos": []
            },
            {
                "id": "test2",
                "name": "Test Cafe",
                "address": "456 Test Ave, NYC",
                "latitude": 40.7129,
                "longitude": -74.0061,
                "website": "https://testcafe.com",
                "instagram": "https://www.instagram.com/testcafe/",
                "description": None,
                "rating": 4.0,
                "category": "foodie",
                "photos": []
            },
            {
                "id": "test3",
                "name": "No Instagram Place",
                "address": "789 Test Blvd, NYC",
                "latitude": 40.7130,
                "longitude": -74.0062,
                "website": "https://noinstagram.com",
                "instagram": None,
                "description": "A place without Instagram",
                "rating": 3.5,
                "category": "foodie",
                "photos": []
            }
        ]
        
        response = requests.post(f"{BASE_URL}/api/places/export-csv", json=test_places)
        assert response.status_code == 200
        content = response.text
        
        # Parse CSV content
        lines = content.strip().split('\n')
        assert len(lines) == 4  # Header + 3 data rows
        
        # Check header has Instagram column
        header = lines[0]
        assert "Instagram" in header
        
        # Find Instagram column index
        columns = header.split(',')
        ig_index = columns.index('Instagram')
        
        # Check Instagram values in data rows
        for i, line in enumerate(lines[1:], 1):
            # Parse CSV properly (handle commas in quoted fields)
            import csv
            import io
            reader = csv.reader(io.StringIO(line))
            row = list(reader)[0]
            ig_value = row[ig_index]
            
            if i == 1:  # test1 with instagram URL
                assert ig_value == "testrestaurant", f"Expected 'testrestaurant', got '{ig_value}'"
            elif i == 2:  # test2 with trailing slash in URL
                assert ig_value == "testcafe", f"Expected 'testcafe', got '{ig_value}'"
            elif i == 3:  # test3 without instagram
                assert ig_value == "", f"Expected empty string, got '{ig_value}'"
        
        print("✓ CSV export Instagram: handles extracted correctly (no @ prefix, no full URL)")
    
    def test_csv_export_experience_type(self):
        """Test CSV export includes Experience Type column with proper names"""
        test_places = [
            {
                "id": "test1",
                "name": "Thrill Place",
                "address": "Test",
                "latitude": 40.0,
                "longitude": -74.0,
                "category": "thrill_seeking",
                "photos": []
            },
            {
                "id": "test2",
                "name": "Chill Place",
                "address": "Test",
                "latitude": 40.0,
                "longitude": -74.0,
                "category": "super_chill",
                "photos": []
            }
        ]
        
        response = requests.post(f"{BASE_URL}/api/places/export-csv", json=test_places)
        assert response.status_code == 200
        content = response.text
        
        # Check Experience Type values
        assert "Thrill Seeking" in content
        assert "Super Chill" in content
        print("✓ CSV export Experience Type: proper display names used")


class TestHistoryAPI:
    """Test search history API endpoints"""
    
    def test_get_history(self):
        """Test getting search history"""
        response = requests.get(f"{BASE_URL}/api/history?limit=10")
        assert response.status_code == 200
        data = response.json()
        assert "history" in data
        print(f"✓ History endpoint: {len(data['history'])} entries")
    
    def test_history_entry_structure(self):
        """Test history entry has proper structure"""
        response = requests.get(f"{BASE_URL}/api/history?limit=1")
        assert response.status_code == 200
        data = response.json()
        if data["history"]:
            entry = data["history"][0]
            assert "id" in entry
            assert "category" in entry
            assert "timestamp" in entry
            assert "results_count" in entry
            print(f"✓ History entry structure: valid ({entry['category']} - {entry['results_count']} results)")
        else:
            print("✓ History entry structure: no entries to validate")


class TestInstagramScraping:
    """Test Instagram scraping functionality"""
    
    def test_search_returns_instagram_urls(self):
        """Test that search enriches places with Instagram URLs from website scraping"""
        response = requests.post(f"{BASE_URL}/api/places/search", json={
            "category": "foodie",
            "location": "New York, NY",
            "page": 1,
            "per_page": 20
        }, timeout=60)
        assert response.status_code == 200
        data = response.json()
        
        # Check structure of Instagram URLs
        for place in data["places"]:
            if place.get("instagram"):
                ig_url = place["instagram"]
                # Should be a full URL format
                assert "instagram.com/" in ig_url.lower(), f"Invalid Instagram URL: {ig_url}"
                # Extract handle from URL
                match = re.search(r'instagram\.com/([a-zA-Z0-9_.]+)', ig_url, re.IGNORECASE)
                assert match, f"Could not extract handle from {ig_url}"
                handle = match.group(1)
                assert len(handle) <= 30, f"Handle too long: {handle}"
                print(f"  - Found IG: {handle}")
        
        places_with_ig = [p for p in data["places"] if p.get("instagram")]
        print(f"✓ Instagram scraping: {len(places_with_ig)}/{len(data['places'])} places have Instagram")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
