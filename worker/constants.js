// Constants ported verbatim from backend/server.py.
export const DEFAULT_CATEGORY_TYPES = {
  "thrill_seeking": [
    "amusement_park",
    "bowling_alley",
    "tourist_attraction"
  ],
  "super_chill": [
    "spa",
    "park",
    "zoo",
    "aquarium",
    "tourist_attraction"
  ],
  "creative": [
    "museum",
    "art_gallery",
    "tourist_attraction"
  ],
  "pure_entertainment": [
    "movie_theater",
    "night_club",
    "stadium",
    "performing_arts_theater"
  ],
  "foodie": [
    "restaurant",
    "cafe",
    "bar",
    "meal_takeaway"
  ]
};

export const DEFAULT_CATEGORY_KEYWORDS = {
  "thrill_seeking": "axe throwing OR go kart OR karting OR escape room OR rock climbing gym OR bouldering OR zipline OR aerial adventure park OR ropes course OR paintball OR airsoft OR skydiving OR indoor skydiving OR water park OR theme park OR surf lessons OR ski resort OR jet ski rental OR whitewater rafting OR ATV tours OR trampoline park OR laser tag",
  "super_chill": "spa OR massage OR yoga studio OR pilates OR meditation center OR botanical garden OR hiking trail OR nature preserve OR mini golf OR bike trail OR bike rental OR pier OR boardwalk OR fishing charter OR city tour OR walking tour OR arcade OR barcade OR aquarium OR zoo OR scenic cruise OR harbor cruise OR golf course OR driving range",
  "creative": "paint and sip OR pottery class OR ceramics studio OR paint your own pottery OR candle making OR rug tufting OR tufting studio OR DIY workshop OR maker space OR art workshop OR woodworking class OR glassblowing class OR jewelry making OR flower bar OR immersive art OR interactive art exhibit OR selfie museum OR photo experience OR art museum OR art gallery",
  "pure_entertainment": "IMAX OR movie theater OR live music venue OR concert venue OR comedy club OR comedy show OR performing arts center OR theater OR playhouse OR arena OR stadium OR sports venue OR event venue OR symphony OR opera",
  "foodie": "restaurant OR rooftop bar OR rooftop lounge OR brunch OR speakeasy OR cocktail bar OR wine bar OR winery OR vineyard OR brewery OR taproom OR distillery OR food tour OR tasting tour OR cooking class OR culinary school OR food hall OR public market OR dinner cruise OR dessert bar OR afternoon tea"
};

export const US_REGIONS = {
  "northeast": {
    "name": "Northeast Region",
    "states": [
      "Connecticut",
      "Maine",
      "Massachusetts",
      "New Hampshire",
      "Rhode Island",
      "Vermont",
      "New Jersey",
      "New York",
      "Pennsylvania"
    ]
  },
  "southeast": {
    "name": "Southeast Region",
    "states": [
      "Alabama",
      "Florida",
      "Georgia",
      "Kentucky",
      "Mississippi",
      "North Carolina",
      "South Carolina",
      "Tennessee",
      "Virginia",
      "West Virginia",
      "Maryland",
      "Delaware",
      "District of Columbia"
    ]
  },
  "midwest": {
    "name": "Midwest Region",
    "states": [
      "Illinois",
      "Indiana",
      "Michigan",
      "Ohio",
      "Wisconsin",
      "Iowa",
      "Kansas",
      "Minnesota",
      "Missouri",
      "Nebraska",
      "North Dakota",
      "South Dakota"
    ]
  },
  "southwest": {
    "name": "Southwest Region",
    "states": [
      "Arizona",
      "Arkansas",
      "Louisiana",
      "New Mexico",
      "Oklahoma",
      "Texas"
    ]
  },
  "west_coast": {
    "name": "West Coast Region",
    "states": [
      "California",
      "Oregon",
      "Washington",
      "Nevada",
      "Idaho",
      "Montana",
      "Utah",
      "Wyoming",
      "Colorado",
      "Alaska",
      "Hawaii"
    ]
  }
};
