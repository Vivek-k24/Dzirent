"""Every Wikidata item the pipeline starts from, given by its English label and a few words of
its description, never by a QID typed from memory.

fetch_wikidata.py resolves each spec with wbsearchentities (label search) and then
wbgetentities, and stops with an error unless exactly one result has one of `labels` as its
English label, every word of `desc` in its English description and none of `desc_not`. Where a
QID is given (by the coordinator, or for a launch type the one this list settled on), the
resolved item must be that QID.

Launch types keep D1's concepts and mapping. `d1_qid` marks a launch QID D1 chose that fails
its own concept's check; fetch_wikidata.py re-checks it on every run and records the result in
taxonomy/roots.json.
"""

LANGUAGES = ["hi", "ur", "bn", "ta", "te", "es", "pt", "fr", "ar", "zh", "ja", "ko", "yo", "sw", "tl"]

# Expanded up to MAX_DEPTH levels of "subclass of" (P279), or the root's own "depth".
MAX_DEPTH = 4
POSITIVE_ROOTS = [
    {"key": "clothing", "labels": ["clothing"], "desc": ["worn", "body"], "qid": "Q11460"},
    {"key": "handbag", "labels": ["handbag"], "desc": ["bag"]},
    {"key": "sunglasses", "labels": ["sunglasses"], "desc": ["eyewear"]},
    {"key": "necktie", "labels": ["necktie"], "desc": ["clothing", "worn"]},
    {"key": "wristwatch", "labels": ["wristwatch"], "desc": ["worn", "wrist"]},
    {"key": "belt", "labels": ["belt"], "desc": ["worn", "waist"]},
    # Two items are labelled "jewelry": the craft ("creation of objects ...") and the objects.
    {"key": "jewellery", "labels": ["jewelry", "jewellery"], "search": "jewellery",
     "desc": ["objects", "adornment"], "desc_not": ["creation"]},
    {"key": "costume_jewellery", "labels": ["costume jewelry", "costume jewellery"], "search": "costume jewelry",
     "desc": ["jewelry", "inexpensive"]},
    {"key": "scarf", "labels": ["scarf"], "desc": ["worn", "neck"]},
    {"key": "shawl", "labels": ["shawl"], "desc": ["worn", "shoulders"]},
    # D2: plain watches (pocket, analog, mechanical, digital) aren't under wristwatch, and cut B
    # dropped them. Smartwatches stay not allowed: smartwatch is a banned root, which wins.
    {"key": "watch", "labels": ["watch"], "desc": ["time indicator", "accessory"]},
    # D2b, owner policy: costumes rent (Halloween, dress-up, theatre), space suits too, as costume.
    # "costume": every type these roots reach is listed as a costume (Occasion & Party, garment
    # type costume, allowed). The costume item is the one cut A excluded (D1c); Q9053464, also
    # labelled "costume", is "wardrobe and dress in general".
    {"key": "costume", "labels": ["costume"], "desc": ["performers", "character"], "qid": "Q1410477",
     "depth": 2, "costume": True},
    {"key": "space_suit", "labels": ["space suit"], "desc": ["astronauts", "vacuum"], "depth": 1, "costume": True},
]
# D2b: a type the costume root reaches is still dropped when it is also under one of these
# exclusion roots: masks, uniforms, protective gear and sportswear never rent. (What the space
# suit root reaches is protective clothing in Wikidata by definition; that root's reach saves a
# type the way the other positive roots' reach does.)
COSTUME_EXCLUSION_WINS = ["mask", "uniform", "protective_clothing", "sportswear"]

# D2c: these roots keep only themselves. The types below space suit are particular suits (Apollo/
# Skylab A7L, Sokol, Orlan, Mars suit, ...), flight hardware rather than something people rent; as
# a costume, "space suit" covers them. They are dropped; a launch or keep-list type below the root
# stays (the keep list's Advanced Crew Escape Suit).
ONLY_ITSELF_ROOTS = ["space_suit"]

# Banned examples: BANNED_DEPTH levels only, and at most BANNED_KEEP items per root. `rule` is
# the policy group in services/vision/app/policy.json.
BANNED_DEPTH = 2
BANNED_KEEP = 15
BANNED_ROOTS = [
    {"key": "t_shirt", "labels": ["t-shirt"], "search": "T-shirt", "desc": ["sleeves"], "rule": "T-shirts and tank tops"},
    # No item is called "sportswear top"; the sports jersey is the sportswear shirt.
    {"key": "sportswear_top", "labels": ["sports jersey"], "desc": ["shirt", "sports"], "rule": "T-shirts and tank tops"},
    {"key": "tracksuit_bottoms", "labels": ["tracksuit bottoms"], "desc": ["trousers", "athletic"],
     "rule": "track pants, sweatpants and joggers"},
    {"key": "shorts", "labels": ["shorts"], "desc": ["knee"], "rule": "shorts"},
    {"key": "jeans", "labels": ["jeans"], "desc": ["denim"], "rule": "jeans"},
    {"key": "hoodie", "labels": ["hoodie"], "desc": ["hood"], "rule": "hoodies and sweatshirts"},
    {"key": "sweatshirt", "labels": ["sweatshirt"], "desc": ["pullover"], "rule": "hoodies and sweatshirts"},
    {"key": "footwear", "labels": ["footwear"], "desc": ["worn", "feet"], "rule": "shoes"},
    {"key": "headgear", "labels": ["headgear"], "desc": ["covering", "head"], "rule": "hats and caps"},
    {"key": "smartwatch", "labels": ["smartwatch"], "desc": ["wristwatch"], "rule": "smartwatches"},
    {"key": "swimwear", "labels": ["swimsuit", "swimwear"], "search": "swimwear", "desc": ["swimming"], "rule": "swimwear"},
    {"key": "lingerie", "labels": ["lingerie"], "desc": ["woman"], "rule": "lingerie"},
    {"key": "undergarment", "labels": ["undergarment"], "desc": ["worn under"], "rule": "underwear"},
    {"key": "sock", "labels": ["sock"], "desc": ["foot"], "rule": "socks"},
    {"key": "hosiery", "labels": ["hosiery"], "desc": ["leg"], "rule": "pantyhose"},
]

# An item that is a subclass (P279*) or an instance (P31/P279*) of any of these is dropped.
EXCLUDE_ROOTS = [
    {"key": "title", "labels": ["title"], "desc": ["rank", "role"], "qid": "Q216353"},
    {"key": "award", "labels": ["award"], "desc": ["recognize", "merit"], "qid": "Q618779"},
    {"key": "occupation", "labels": ["occupation"], "desc": ["activity"], "qid": "Q12737077"},
    {"key": "academic_degree", "labels": ["academic degree"], "desc": ["academic program"], "qid": "Q189533"},
    {"key": "position", "labels": ["position"], "desc": ["role", "organization"], "qid": "Q4164871"},
    {"key": "human", "labels": ["human"], "desc": ["homo sapiens"], "qid": "Q5"},
    {"key": "organization", "labels": ["organization"], "desc": ["social entity"], "qid": "Q43229"},
    {"key": "military_unit", "labels": ["military unit"], "desc": ["armed force"]},
    # The coordinator's Q20793164 now redirects here; Q50414523, also "armor", is armoured forces and vehicles.
    {"key": "armour", "labels": ["armor", "armour"], "search": "armor", "desc": ["protective", "persons"], "qid": "Q11886611"},
    # Cut A (D1c): branches of clothing that aren't rentable outfits. "scope": "clothing" means they
    # drop only what the clothing root brings in: launch types, a banned root's examples (a sports
    # jersey is sportswear, and still a not-allowed example) and types under one of the other
    # positive roots (sunglasses are protective clothing in Wikidata) stay.
    # D2b: costume (Q1410477) left this list; it is a positive root now (above).
    {"key": "uniform", "labels": ["uniform"], "desc": ["similar clothing", "group"], "qid": "Q7434", "scope": "clothing"},
    {"key": "mask", "labels": ["mask"], "desc": ["face covering"], "qid": "Q161524", "scope": "clothing"},
    {"key": "protective_clothing", "labels": ["protective clothing"], "desc": ["protection"], "qid": "Q14524031",
     "scope": "clothing"},
    {"key": "religious_clothing", "labels": ["religious clothing"], "desc": ["faith"], "qid": "Q2490224", "scope": "clothing"},
    {"key": "liturgical_vestments", "labels": ["liturgical vestments and insignia", "liturgical vestments"],
     "search": "liturgical vestments", "desc": ["clergy"], "qid": "Q6501052", "scope": "clothing"},
    {"key": "academic_dress", "labels": ["academic dress"], "desc": ["schools", "universities"], "qid": "Q1349227",
     "scope": "clothing"},
    # Q7580001, also "sportswear", is the fashion category of relaxed day clothes (a subclass of this one).
    {"key": "sportswear", "labels": ["sportswear"], "desc": ["sport", "exercise"], "qid": "Q645292", "scope": "clothing"},
    {"key": "professional_wear", "labels": ["professional wear"], "desc": ["profession"], "qid": "Q29000407",
     "scope": "clothing"},
]

# D2: an item that is an instance of one of these classes (P31, or P31 of a subclass: P31/P279*)
# names one made thing, not a type of garment: a brand, a product line, a fictional prop, an
# archaeological find. It is dropped, whatever its name says.
EXCLUDE_INSTANCE_OF = [
    {"key": "fictional_object", "labels": ["fictional object"], "desc": ["fictional stories"]},
    # No item is labelled "fictional item of clothing"; this one is "clothing that only exists in
    # works of fiction".
    {"key": "fictional_clothing", "labels": ["fictional clothing"], "desc": ["works of fiction"]},
    {"key": "brand", "labels": ["brand"], "desc": ["identification", "good or service"]},
    {"key": "trademark", "labels": ["trademark"], "desc": ["trade identifier"]},
    {"key": "product_model", "labels": ["product model"], "desc": ["manufactured objects"]},
    # "product line" is an English alias of "model series".
    {"key": "product_line", "labels": ["model series"], "search": "product line", "desc": ["series of product models"]},
    # No item is labelled "archaeological artefact type"; this one is the artefact class, "something
    # made or modified by humans and of archaeological interest".
    {"key": "archaeological_artefact", "labels": ["archaeological artefact", "archaeological artifact"],
     "search": "archaeological artefact", "desc": ["archaeological interest"]},
]
# D2b: real styles Wikidata files as a trademark or a brand. The instance-of rule doesn't drop
# them; every other rule still applies, and they are classified as usual. Checked by QID and
# English label on every fetch (roots.json, "instance_of_exceptions"). QIDs from excluded.json.
EXCLUDE_INSTANCE_OF_EXCEPTIONS = [
    {"qid": "Q134632", "label": "Perfecto"},  # the motorcycle jacket
    {"qid": "Q1586189", "label": "Harrington jacket"},
    {"qid": "Q6371145", "label": "Kariyushi shirt"},
]
EXCEPTION_QIDS = {entry["qid"] for entry in EXCLUDE_INSTANCE_OF_EXCEPTIONS}

# D2b: one brand's watch models that no instance-of class reaches (no P31, or only "watch" or
# "smartwatch"). They stay in taxonomy.json with keep = no (allowed unchanged), so they leave
# vocabulary.json and get no photos. Checked like the exceptions (roots.json, "drop").
DROP_LIST = [
    {"qid": "Q382707", "label": "Rolex GMT Master II"},
    {"qid": "Q7144403", "label": "Patek Philippe Calibre 89"},
    {"qid": "Q25325320", "label": "The Vacheron Constantin Reference 57260"},
    {"qid": "Q56291735", "label": "Microbrand watches"},
    {"qid": "Q27890205", "label": "Samsung Gear S3"},
    {"qid": "Q7380451", "label": "Ruputer"},
    {"qid": "Q11682766", "label": "I'm Watch"},
]
DROP_QIDS = {entry["qid"] for entry in DROP_LIST}

# D2: entries that name no type of their own, matched on the whole English label (never a
# substring): the clothing root itself ("clothing", with the aliases "garment" and "apparel") and
# the two items labelled only "gown". A launch type is never dropped by this.
GENERIC_LEAF_LABELS = ["clothing", "garment", "gown"]

# D2: types cut A removed that come back. Each is checked by QID and English label on every
# fetch (roots.json, "keep"), comes back past cut A only, is classified by the normal rules, and
# gets needs_owner = yes in review.csv. Every other drop rule still applies to them.
# D2b, owner policy: everyday, work, weather, cultural and costume items stay; protective,
# industrial, military and sportswear items left (KEEP_LIST_REMOVED). A keep-list type under the
# costume or space suit root is a costume (Occasion & Party, garment type costume).
# "not_allowed": comes back as a not-allowed example (the rule named), not as a rentable type.
KEEP_LIST = [
    {"qid": "Q15013", "label": "Advanced Crew Escape Suit"},
    {"qid": "Q118463", "label": "Mao suit"},
    {"qid": "Q182064", "label": "djellaba"},
    {"qid": "Q297424", "label": "oilskin"},
    {"qid": "Q305718", "label": "abaya"},
    {"qid": "Q932999", "label": "duster"},
    {"qid": "Q1000777", "label": "fatsuit"},
    {"qid": "Q1663649", "label": "rain cape"},
    {"qid": "Q2018769", "label": "raincoat"},
    {"qid": "Q2576557", "label": "Mackintosh"},
    {"qid": "Q2637777", "label": "simar"},
    {"qid": "Q2899124", "label": "priestly tunic"},
    {"qid": "Q2933073", "label": "cagoule"},
    {"qid": "Q2998209", "label": "mantle"},
    {"qid": "Q3247116", "label": "pinafore"},
    {"qid": "Q3979915", "label": "tabard"},
    {"qid": "Q5523301", "label": "Garibaldi shirt"},
    {"qid": "Q5586484", "label": "gorilla suit"},
    {"qid": "Q11626363", "label": "ikan"},
    {"qid": "Q16522478", "label": "posing trunks", "not_allowed": "sportswear", "garment_type": "none_fits"},
    {"qid": "Q16671745", "label": "qamis"},
    {"qid": "Q29572363", "label": "walking suit"},
    {"qid": "Q29655703", "label": "track suit top", "not_allowed": "sportswear", "garment_type": "top"},
    {"qid": "Q29749328", "label": "communion clothing"},
    {"qid": "Q44222414", "label": "beach dress"},
    {"qid": "Q48767474", "label": "cat suit"},
    {"qid": "Q48810759", "label": "dinosaur suit"},
    {"qid": "Q48843371", "label": "Teba jacket"},
    {"qid": "Q48995588", "label": "bear suit"},
    {"qid": "Q51099841", "label": "jingle dress"},
    {"qid": "Q97618878", "label": "informal dress (changfu)"},
    {"qid": "Q105200672", "label": "shaluka"},
    {"qid": "Q131283709", "label": "Farwah"},
]
KEEP_QIDS = {entry["qid"] for entry in KEEP_LIST}
KEEP_BY_QID = {entry["qid"]: entry for entry in KEEP_LIST}
# D2b: off the keep list, with the reason; cut A drops them again. (Wikidata's burka, Q1016353,
# is a felt cloak, "rough raincoat"; the owner's call.)
KEEP_LIST_REMOVED = [
    {"qid": "Q758069", "label": "attila", "reason": "military: its parents are military uniform and dress uniform"},
    {"qid": "Q1016353", "label": "burka", "reason": "owner: remove"},
    {"qid": "Q1934317", "label": "waders", "reason": "protective: waterproof work wear for fishing"},
    {"qid": "Q1988132", "label": "Tunic (military)", "reason": "military"},
    {"qid": "Q3658926", "label": "environmental suit", "reason": "protective: a suit for a hostile environment"},
    {"qid": "Q4795383", "label": "skin suit", "reason": "sportswear: speed skating"},
    {"qid": "Q7233286", "label": "Positive pressure personnel suit", "reason": "industrial protective suit (biocontainment)"},
    {"qid": "Q11400500", "label": "racing silks", "reason": "sportswear: jockeys"},
    {"qid": "Q16889336", "label": "zephyr", "reason": "sportswear: competition rowing shirt"},
    {"qid": "Q26877520", "label": "cold-protection suit", "reason": "protective"},
    {"qid": "Q125628759", "label": "Speed skating suits", "reason": "sportswear: speed skating"},
    {"qid": "Q138839719", "label": "Al-Azhar attire",
     "reason": "uniform of one institution (its parents include uniform); uniforms stay excluded"},
]

# Cut B (D1c): accessories only from the accessory roots above. The clothing crawl doesn't pass
# through these classes, so what clothing reaches only through them is dropped unless another
# positive root reaches it.
SKIP_UNDER_CLOTHING = [
    {"key": "fashion_accessory", "labels": ["fashion accessory"], "desc": ["outfit"], "qid": "Q1065579"},
]
# Label words that drop an item, whatever its classes (plurals too: "uniforms of", "orders of").
EXCLUDE_LABEL_WORDS = ["uniform of", "costume of", "insignia", "medal", "order of"]
# Added in D1b, in the same spirit as "uniform of": the dress of one place, people or institution
# ("traditional clothing of <a province>", "academic dress of <a university>") is a topic, not a
# garment type, and its label names the place.
EXCLUDE_LABEL_PATTERN = r"(clothing|clothes|dress|attire|costumes?|uniforms?|regalia|garments?|fashion)\s+(of|in)"

# A country of origin (P495) is kept only when it is an instance of one of these, so that no
# city, state or province name reaches the output.
COUNTRY_CLASSES = [
    {"key": "country", "labels": ["country"], "desc": ["territorial", "political entity"]},
    {"key": "sovereign_state", "labels": ["sovereign state"], "desc": ["highest authority"]},
    {"key": "historical_country", "labels": ["historical country"], "desc": ["once existed"]},
    {"key": "uk_country", "labels": ["constituent country of the United Kingdom"],
     "search": "constituent country of the United Kingdom", "desc": ["england", "scotland"]},
]

# D1's launch list (38 concepts, 57 QIDs) and its mapping. Changes from D1, each noted where it is:
# - sokutai (Q1156828), D1's "sport or athletic tee", is Japanese court dress: replaced by
#   sports jersey;
# - tuxedo and dinner jacket: Occasion & Party, as in policy.json (D1 had Career & Professional);
# - fallback names that were place names (a state's, a city's) are gone.
LAUNCH = [
    # Cultural & Traditional
    {"qid": "Q837879", "labels": ["sherwani"], "desc": ["attire"], "concept": "sherwani or achkan",
     "category": "Cultural & Traditional", "garment_type": "suit", "allowed": "allowed", "region": "South Asian",
     "fallback_names": ["sherwani", "achkan coat", "traditional sherwani"]},
    {"qid": "Q4673806", "labels": ["achkan"], "desc": ["jacket"], "concept": "sherwani or achkan",
     "category": "Cultural & Traditional", "garment_type": "top", "allowed": "allowed", "region": "South Asian",
     "fallback_names": ["achkan", "knee length jacket", "indian achkan"]},
    {"qid": "Q855915", "labels": ["kurta"], "desc": ["tunic"], "concept": "kurta and kurta set",
     "category": "Cultural & Traditional", "garment_type": "top", "allowed": "allowed", "region": "South Asian",
     "fallback_names": ["kurta", "kurti tunic", "kurta set"]},
    {"qid": "Q11339904", "labels": ["nehru jacket"], "desc": ["clothing"], "concept": "bandhgala or Nehru jacket",
     "category": "Cultural & Traditional", "garment_type": "top", "allowed": "allowed", "region": "South Asian",
     "fallback_names": ["Nehru jacket", "bandhgala", "mandarin collar jacket"]},
    {"qid": "Q17050816", "labels": ["lehenga"], "desc": ["skirt"], "concept": "lehenga",
     "category": "Cultural & Traditional", "garment_type": "saree", "allowed": "allowed", "region": "South Asian",
     "fallback_names": ["lehenga", "lehenga choli", "ghagra"]},
    {"qid": "Q172827", "labels": ["sari", "saree"], "search": "sari", "desc": ["draped"], "concept": "saree",
     "category": "Cultural & Traditional", "garment_type": "saree", "allowed": "allowed", "region": "South Asian",
     "fallback_names": ["sari", "saree", "draped sari"]},
    {"qid": "Q17070428", "labels": ["anarkali salwar suit"], "desc": ["dress"], "concept": "anarkali or salwar suit",
     "category": "Cultural & Traditional", "garment_type": "dress", "allowed": "allowed", "region": "South Asian",
     "fallback_names": ["anarkali suit", "anarkali salwar suit", "anarkali dress"]},
    {"qid": "Q12456113", "labels": ["shalwar kameez"], "desc": ["trousers", "tunic"], "concept": "anarkali or salwar suit",
     "category": "Cultural & Traditional", "garment_type": "dress", "allowed": "allowed", "region": "South Asian",
     "fallback_names": ["shalwar kameez", "salwar kameez", "salwar suit"]},
    {"qid": "Q635784", "labels": ["ball gown"], "desc": ["evening dress"], "concept": "quinceañera dress / prom dress",
     "category": "Occasion & Party", "garment_type": "dress", "allowed": "allowed", "region": "Global",
     "notes": "Used as the primary Wikidata item representing full formal gowns including quinceañera and prom ball gowns.",
     "fallback_names": ["ball gown", "formal gown", "quinceanera ball gown"]},
    {"qid": "Q5320192", "labels": ["débutante dress"], "desc": ["gown"], "concept": "quinceañera dress (coming-of-age gown)",
     "category": "Occasion & Party", "garment_type": "dress", "allowed": "allowed", "region": "European",
     "notes": "Formal coming-of-age gown; closest Wikidata item for debutante and quinceañera presentation attire.",
     "fallback_names": ["debutante dress", "presentation gown", "cotillion gown"]},
    {"qid": "Q1552950", "labels": ["guayabera"], "desc": ["shirt"], "concept": "guayabera",
     "category": "Cultural & Traditional", "garment_type": "top", "allowed": "allowed", "region": "Latin American",
     "fallback_names": ["guayabera", "wedding shirt", "guayabera shirt"]},
    {"qid": "Q3269820", "labels": ["huipil"], "desc": ["tunic"], "concept": "embroidered huipil or folklórico dress",
     "category": "Cultural & Traditional", "garment_type": "top", "allowed": "allowed", "region": "Latin American",
     "fallback_names": ["huipil", "embroidered huipil", "embroidered tunic"]},
    {"qid": "Q1073477", "labels": ["china poblana"], "desc": ["dress", "mexico"], "concept": "embroidered huipil or folklórico dress",
     "category": "Cultural & Traditional", "garment_type": "dress", "allowed": "allowed", "region": "Latin American",
     "notes": "Traditional Mexican folklórico dress.",
     "fallback_names": ["China Poblana", "folklorico dress", "mexican traditional dress"]},
    # Wikidata gives boubou the alias "agbada"; the item labelled "Agbada" has no class and no Commons category.
    {"qid": "Q2647929", "labels": ["boubou"], "desc": ["robe"], "concept": "agbada or dashiki set",
     "category": "Cultural & Traditional", "garment_type": "top", "allowed": "allowed", "region": "African",
     "fallback_names": ["agbada", "boubou", "grand boubou"]},
    {"qid": "Q1133675", "labels": ["dashiki"], "desc": ["garment"], "concept": "agbada or dashiki set",
     "category": "Cultural & Traditional", "garment_type": "top", "allowed": "allowed", "region": "African",
     "fallback_names": ["dashiki", "dashiki tunic", "kitenge shirt"]},
    {"qid": "Q836934", "labels": ["cheongsam (qipao)", "qipao", "cheongsam"], "search": "cheongsam (qipao)",
     "desc": ["dress"], "concept": "qipao or cheongsam",
     "category": "Cultural & Traditional", "garment_type": "dress", "allowed": "allowed", "region": "East Asian",
     "fallback_names": ["qipao", "cheongsam", "mandarin gown"]},
    {"qid": "Q701069", "labels": ["hanbok"], "desc": ["korean"], "concept": "hanbok",
     "category": "Cultural & Traditional", "garment_type": "dress", "allowed": "allowed", "region": "East Asian",
     "fallback_names": ["hanbok", "traditional korean dress", "chima jeogori"]},

    # Occasion & Party
    {"qid": "Q2144456", "labels": ["evening dress"], "desc": ["dress", "formal"], "concept": "evening gown",
     "category": "Occasion & Party", "garment_type": "dress", "allowed": "allowed", "region": "Global",
     "fallback_names": ["evening dress", "evening gown", "formal gown"]},
    {"qid": "Q1512004", "labels": ["cocktail dress"], "desc": ["dress", "semi-formal"], "concept": "cocktail dress",
     "category": "Occasion & Party", "garment_type": "dress", "allowed": "allowed", "region": "Global",
     "fallback_names": ["cocktail dress", "party dress", "semi-formal dress"]},
    {"qid": "Q29650222", "labels": ["bridesmaid's dress"], "desc": ["bride"], "concept": "bridesmaid dress",
     "category": "Occasion & Party", "garment_type": "dress", "allowed": "allowed", "region": "Global",
     "fallback_names": ["bridesmaid's dress", "bridal attendant dress", "bridesmaid gown"]},
    {"qid": "Q7140985", "labels": ["party dress"], "desc": ["dress"], "concept": "prom dress / sequin party dress",
     "category": "Occasion & Party", "garment_type": "dress", "allowed": "allowed", "region": "Global",
     "notes": "Best Wikidata match for semi-formal party, prom, and sequin celebration dresses.",
     "fallback_names": ["party dress", "prom dress", "celebration dress"]},
    {"qid": "Q16472452", "labels": ["jumpsuit"], "desc": ["one-piece"], "concept": "formal jumpsuit",
     "category": "Occasion & Party", "garment_type": "dress", "allowed": "allowed", "region": "Global",
     "fallback_names": ["jumpsuit", "formal jumpsuit", "one-piece dress jumpsuit"]},
    # D1: Career & Professional; policy.json files the tuxedo under Occasion & Party.
    {"qid": "Q50386965", "labels": ["dinner jacket"], "desc": ["suit coat"], "concept": "tuxedo",
     "category": "Occasion & Party", "garment_type": "suit", "allowed": "allowed", "region": "European",
     "fallback_names": ["dinner jacket", "black tie jacket", "tuxedo jacket"]},
    # Described as the dress code, but a subclass of suit, formal wear and evening wear.
    {"qid": "Q4668625", "labels": ["tuxedo"], "desc": ["evening"], "concept": "tuxedo",
     "category": "Occasion & Party", "garment_type": "suit", "allowed": "allowed", "region": "North American",
     "fallback_names": ["tuxedo", "formal tuxedo attire", "dinner suit"]},

    # Career & Professional
    {"qid": "Q614806", "labels": ["suit"], "desc": ["jacket", "trousers"], "concept": "two- or three-piece suit",
     "category": "Career & Professional", "garment_type": "suit", "allowed": "allowed", "region": "Global",
     "fallback_names": ["business suit", "tailored suit", "two-piece suit"]},
    {"qid": "Q2998484", "labels": ["three-piece suit"], "desc": ["waistcoat"], "concept": "two- or three-piece suit",
     "category": "Career & Professional", "garment_type": "suit", "allowed": "allowed", "region": "European",
     "fallback_names": ["three-piece suit", "vested suit", "complete suit"]},
    {"qid": "Q883234", "labels": ["blazer"], "desc": ["jacket"], "concept": "blazer",
     "category": "Career & Professional", "garment_type": "suit", "allowed": "allowed", "region": "Global",
     "fallback_names": ["blazer", "sport coat", "tailored blazer"]},
    {"qid": "Q39908", "labels": ["trousers"], "desc": ["legs"], "concept": "dress trousers",
     "category": "Career & Professional", "garment_type": "trousers", "allowed": "allowed", "region": "Global",
     "fallback_names": ["trousers", "dress pants", "tailored slacks"]},
    {"qid": "Q15008044", "labels": ["sheath dress"], "desc": ["dress"], "concept": "sheath or work dress",
     "category": "Career & Professional", "garment_type": "dress", "allowed": "allowed", "region": "Global",
     "fallback_names": ["sheath dress", "work dress", "business dress"]},

    # Everyday
    {"qid": "Q7639866", "labels": ["sundress"], "desc": ["dress"], "concept": "casual dress",
     "category": "Everyday", "garment_type": "dress", "allowed": "allowed", "region": "Global",
     "fallback_names": ["sundress", "casual dress", "summer dress"]},
    {"qid": "Q43297761", "labels": ["day dress"], "desc": ["dress", "daytime"], "concept": "casual dress",
     "category": "Everyday", "garment_type": "dress", "allowed": "allowed", "region": "Global",
     "fallback_names": ["day dress", "casual day dress", "everyday dress"]},
    {"qid": "Q2160801", "labels": ["skirt"], "desc": ["waist"], "concept": "skirt",
     "category": "Everyday", "garment_type": "skirt", "allowed": "allowed", "region": "Global",
     "fallback_names": ["skirt", "midi skirt", "casual skirt"]},
    {"qid": "Q152563", "labels": ["blouse"], "desc": ["upper body"], "concept": "blouse or dressy top",
     "category": "Everyday", "garment_type": "top", "allowed": "allowed", "region": "Global",
     "fallback_names": ["blouse", "dressy top", "buttoned blouse"]},
    {"qid": "Q877140", "labels": ["cardigan"], "desc": ["knitted"], "concept": "knit cardigan",
     "category": "Everyday", "garment_type": "top", "allowed": "allowed", "region": "European",
     "fallback_names": ["cardigan", "knit cardigan", "button sweater"]},

    # Outerwear
    {"qid": "Q337481", "labels": ["overcoat"], "desc": ["coat worn over"], "concept": "wool overcoat or trench coat",
     "category": "Outerwear", "garment_type": "top", "allowed": "allowed", "region": "Global",
     "fallback_names": ["overcoat", "wool coat", "winter overcoat"]},
    {"qid": "Q654290", "labels": ["trench coat"], "desc": ["coat"], "concept": "wool overcoat or trench coat",
     "category": "Outerwear", "garment_type": "top", "allowed": "allowed", "region": "European",
     "fallback_names": ["trench coat", "belted trench coat", "rain trench"]},
    {"qid": "Q1619986", "labels": ["leather jacket"], "desc": ["leather"], "concept": "leather jacket",
     "category": "Outerwear", "garment_type": "top", "allowed": "allowed", "region": "Global",
     "fallback_names": ["leather jacket", "biker jacket", "moto jacket"]},
    {"qid": "Q10477564", "labels": ["down jacket"], "desc": ["jacket"], "concept": "down or puffer jacket",
     "category": "Outerwear", "garment_type": "top", "allowed": "allowed", "region": "Global",
     "fallback_names": ["down jacket", "puffer jacket", "quilted jacket"]},

    # Accessories
    {"qid": "Q467505", "labels": ["handbag"], "desc": ["bag"], "concept": "handbag",
     "category": "Accessories", "garment_type": "one_size", "item_type": "Handbag", "allowed": "allowed", "region": "Global",
     "fallback_names": ["handbag", "purse", "shoulder bag"]},
    {"qid": "Q217541", "labels": ["sunglasses"], "desc": ["eyewear"], "concept": "sunglasses",
     "category": "Accessories", "garment_type": "one_size", "item_type": "Sunglasses", "allowed": "allowed", "region": "Global",
     "fallback_names": ["sunglasses", "shades", "sun glasses"]},
    {"qid": "Q44416", "labels": ["necktie"], "desc": ["clothing", "worn"], "concept": "necktie",
     "category": "Accessories", "garment_type": "one_size", "item_type": "Tie", "allowed": "allowed", "region": "Global",
     "fallback_names": ["necktie", "tie", "silk necktie"]},
    {"qid": "Q26965868", "labels": ["wristwatch"], "desc": ["worn", "wrist"], "concept": "wristwatch (not a smartwatch)",
     "category": "Accessories", "garment_type": "one_size", "item_type": "Watch (non-smart)", "allowed": "allowed", "region": "Global",
     "fallback_names": ["wristwatch", "analog watch", "wrist watch"]},
    {"qid": "Q1536680", "labels": ["costume jewelry"], "desc": ["jewelry", "inexpensive"], "concept": "costume jewelry",
     "category": "Accessories", "garment_type": "one_size", "item_type": "Costume jewelry", "allowed": "allowed", "region": "Global",
     "fallback_names": ["costume jewelry", "fashion jewelry", "statement jewelry"]},

    # Not-allowed examples
    {"qid": "Q131151", "labels": ["t-shirt"], "search": "T-shirt", "desc": ["sleeves"], "concept": "T-shirt",
     "category": "not_applicable", "garment_type": "top", "allowed": "not_allowed", "region": "Global",
     "notes": "Everyday basic; excluded per Dzirent policy.",
     "fallback_names": ["t-shirt", "tee", "crew neck tee"]},
    # D1 had Q1156828, which is sokutai (Japanese imperial court dress).
    {"qid": "Q2623418", "d1_qid": "Q1156828", "labels": ["sports jersey"], "desc": ["shirt", "sports"],
     "concept": "sport or athletic tee",
     "category": "not_applicable", "garment_type": "top", "allowed": "not_allowed", "region": "Global",
     "notes": "Athletic sportswear; excluded per Dzirent policy.",
     "fallback_names": ["sport tee", "athletic shirt", "jersey"]},
    {"qid": "Q2426768", "labels": ["tracksuit bottoms"], "desc": ["trousers", "athletic"], "concept": "track pants",
     "category": "not_applicable", "garment_type": "trousers", "allowed": "not_allowed", "region": "Global",
     "notes": "Athletic sportswear / basics; excluded per Dzirent policy.",
     "fallback_names": ["track pants", "tracksuit bottoms", "sweatpants"]},
    {"qid": "Q223269", "labels": ["shorts"], "desc": ["knee"], "concept": "shorts",
     "category": "not_applicable", "garment_type": "trousers", "allowed": "not_allowed", "region": "Global",
     "notes": "Everyday basics; excluded per Dzirent policy.",
     "fallback_names": ["shorts", "casual shorts", "bermuda shorts"]},
    {"qid": "Q83363", "labels": ["jeans"], "desc": ["denim"], "concept": "jeans",
     "category": "not_applicable", "garment_type": "trousers", "allowed": "not_allowed", "region": "Global",
     "notes": "Plain everyday jeans; excluded per Dzirent policy.",
     "fallback_names": ["jeans", "denim jeans", "blue jeans"]},
    {"qid": "Q920929", "labels": ["hoodie"], "desc": ["hood"], "concept": "hoodie or sweatshirt",
     "category": "not_applicable", "garment_type": "top", "allowed": "not_allowed", "region": "Global",
     "notes": "Everyday basics / hoodies; excluded per Dzirent policy.",
     "fallback_names": ["hoodie", "hooded sweatshirt", "hoody"]},
    {"qid": "Q19968163", "labels": ["sweatshirt"], "desc": ["pullover"], "concept": "hoodie or sweatshirt",
     "category": "not_applicable", "garment_type": "top", "allowed": "not_allowed", "region": "Global",
     "notes": "Everyday basics / sweatshirts; excluded per Dzirent policy.",
     "fallback_names": ["sweatshirt", "crewneck sweatshirt", "fleece pullover"]},
    {"qid": "Q22676", "labels": ["shoe"], "desc": ["footwear"], "concept": "shoes",
     "category": "not_applicable", "garment_type": "none_fits", "allowed": "not_allowed", "region": "Global",
     "notes": "Shoes of any kind are excluded per Dzirent policy. No shoe garment_type in database.",
     "fallback_names": ["shoe", "footwear", "shoes"]},
    {"qid": "Q5362345", "labels": ["smartwatch"], "desc": ["wristwatch"], "concept": "smartwatch",
     "category": "not_applicable", "garment_type": "one_size", "item_type": "none_fits", "allowed": "not_allowed", "region": "Global",
     "notes": "Smartwatches are excluded per Dzirent policy (only non-smart watches allowed).",
     "fallback_names": ["smartwatch", "connected watch", "digital smartwatch"]},
    {"qid": "Q6147804", "labels": ["cap"], "desc": ["head"], "concept": "cap or hat",
     "category": "not_applicable", "garment_type": "none_fits", "allowed": "not_allowed", "region": "Global",
     "notes": "Caps and hats are excluded per Dzirent policy. No headwear garment_type in database.",
     "fallback_names": ["cap", "baseball cap", "visor cap"]},
    {"qid": "Q80151", "labels": ["hat"], "desc": ["head"], "concept": "cap or hat",
     "category": "not_applicable", "garment_type": "none_fits", "allowed": "not_allowed", "region": "Global",
     "notes": "Caps and hats are excluded per Dzirent policy. No headwear garment_type in database.",
     "fallback_names": ["hat", "headwear hat", "brimmed hat"]},
    {"qid": "Q212989", "labels": ["swimsuit"], "desc": ["swimming"], "concept": "swimwear",
     "category": "not_applicable", "garment_type": "dress", "allowed": "not_allowed", "region": "Global",
     "notes": "Swimwear is excluded per Dzirent policy.",
     "fallback_names": ["swimsuit", "bathing suit", "swimwear"]},
    {"qid": "Q855691", "labels": ["lingerie"], "desc": ["woman"], "concept": "lingerie",
     "category": "not_applicable", "garment_type": "none_fits", "allowed": "not_allowed", "region": "Global",
     "notes": "Lingerie is excluded per Dzirent policy. No lingerie garment_type in database.",
     "fallback_names": ["lingerie", "intimate apparel", "undergarments"]},
    {"qid": "Q198763", "labels": ["undergarment"], "desc": ["worn under"], "concept": "lingerie",
     "category": "not_applicable", "garment_type": "none_fits", "allowed": "not_allowed", "region": "Global",
     "notes": "Underwear is excluded per Dzirent policy. No underwear garment_type in database.",
     "fallback_names": ["undergarment", "underwear", "underclothes"]},
]

LAUNCH_BY_QID = {entry["qid"]: entry for entry in LAUNCH}
