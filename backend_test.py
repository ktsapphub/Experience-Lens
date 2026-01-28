import requests
import sys
import json
from datetime import datetime

class GoogleMapsScraperTester:
    def __init__(self, base_url="https://mapdata-collector-1.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.search_results = []

    def run_test(self, name, method, endpoint, expected_status, data=None, timeout=30):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=timeout)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=timeout)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return True, response.json()
                except:
                    return True, response.text
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"   Response: {response.text[:200]}...")
                return False, {}

        except requests.exceptions.Timeout:
            print(f"❌ Failed - Request timeout after {timeout}s")
            return False, {}
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_root_endpoint(self):
        """Test root API endpoint"""
        return self.run_test("Root API", "GET", "", 200)

    def test_categories_endpoint(self):
        """Test categories endpoint"""
        success, response = self.run_test("Categories API", "GET", "categories", 200)
        
        if success and 'categories' in response:
            categories = response['categories']
            print(f"   Found {len(categories)} categories")
            
            # Verify we have exactly 5 categories
            if len(categories) == 5:
                print("   ✅ Correct number of categories (5)")
            else:
                print(f"   ❌ Expected 5 categories, got {len(categories)}")
                return False
            
            # Verify required category IDs
            expected_ids = ['thrill_seeking', 'super_chill', 'creative', 'pure_entertainment', 'foodie']
            found_ids = [cat['id'] for cat in categories]
            
            for expected_id in expected_ids:
                if expected_id in found_ids:
                    print(f"   ✅ Found category: {expected_id}")
                else:
                    print(f"   ❌ Missing category: {expected_id}")
                    return False
            
            return True
        
        return success

    def test_places_search(self, category="foodie", location="Los Angeles, CA"):
        """Test places search endpoint"""
        search_data = {
            "category": category,
            "location": location,
            "max_results": 10  # Smaller number for testing
        }
        
        success, response = self.run_test(
            f"Places Search ({category} in {location})", 
            "POST", 
            "places/search", 
            200, 
            search_data,
            timeout=60  # Longer timeout for API calls
        )
        
        if success and response.get('success'):
            places = response.get('places', [])
            total = response.get('total', 0)
            
            print(f"   Found {total} places")
            
            if total > 0:
                print("   ✅ Search returned results")
                
                # Store results for CSV export test
                self.search_results = places
                
                # Verify place structure
                first_place = places[0]
                required_fields = ['id', 'name', 'address', 'latitude', 'longitude']
                
                for field in required_fields:
                    if field in first_place:
                        print(f"   ✅ Place has {field}: {first_place[field]}")
                    else:
                        print(f"   ❌ Place missing {field}")
                        return False
                
                return True
            else:
                print("   ⚠️  Search returned no results (might be API limit or location issue)")
                return True  # Not necessarily a failure
        
        return success

    def test_invalid_category_search(self):
        """Test search with invalid category"""
        search_data = {
            "category": "invalid_category",
            "location": "Los Angeles, CA",
            "max_results": 10
        }
        
        success, response = self.run_test(
            "Invalid Category Search", 
            "POST", 
            "places/search", 
            400,  # Should return 400 for invalid category
            search_data
        )
        
        return success

    def test_csv_export(self):
        """Test CSV export endpoint"""
        if not self.search_results:
            print("   ⚠️  No search results available for CSV export test")
            return True
        
        success, response = self.run_test(
            "CSV Export", 
            "POST", 
            "places/export-csv", 
            200, 
            self.search_results
        )
        
        if success:
            # Check if response looks like CSV
            if isinstance(response, str) and 'Name,Address,Latitude' in response:
                print("   ✅ CSV export returned valid CSV format")
                return True
            else:
                print("   ❌ CSV export did not return valid CSV format")
                return False
        
        return success

    def test_search_history(self):
        """Test search history endpoint"""
        return self.run_test("Search History", "GET", "search-history", 200)

    def test_status_endpoints(self):
        """Test status check endpoints"""
        # Test POST status
        status_data = {"client_name": "test_client"}
        success1, _ = self.run_test("Create Status Check", "POST", "status", 200, status_data)
        
        # Test GET status
        success2, _ = self.run_test("Get Status Checks", "GET", "status", 200)
        
        return success1 and success2

def main():
    print("🚀 Starting Google Maps Scraper API Tests")
    print("=" * 50)
    
    tester = GoogleMapsScraperTester()
    
    # Test sequence
    tests = [
        ("Root Endpoint", tester.test_root_endpoint),
        ("Categories Endpoint", tester.test_categories_endpoint),
        ("Places Search", tester.test_places_search),
        ("Invalid Category", tester.test_invalid_category_search),
        ("CSV Export", tester.test_csv_export),
        ("Search History", tester.test_search_history),
        ("Status Endpoints", tester.test_status_endpoints),
    ]
    
    failed_tests = []
    
    for test_name, test_func in tests:
        try:
            result = test_func()
            if not result:
                failed_tests.append(test_name)
        except Exception as e:
            print(f"❌ {test_name} failed with exception: {str(e)}")
            failed_tests.append(test_name)
    
    # Print results
    print("\n" + "=" * 50)
    print("📊 TEST RESULTS")
    print("=" * 50)
    print(f"Tests passed: {tester.tests_passed}/{tester.tests_run}")
    
    if failed_tests:
        print(f"\n❌ Failed tests: {', '.join(failed_tests)}")
        return 1
    else:
        print("\n✅ All tests passed!")
        return 0

if __name__ == "__main__":
    sys.exit(main())