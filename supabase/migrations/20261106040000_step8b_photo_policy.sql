-- Step 8B: photo policy changes and automatic re-checks.
-- - Owner decisions: hoodies and sweatshirts are not allowed (everyday basics); lingerie,
--   underwear and swimwear stay not allowed; costume jewelry stays allowed (with the accessory
--   declaration); a copied photo of a banned item stays rejected.
-- - Changing the photos of an active listing queues a new photo check (the same path as
--   request_scan). The listing stays active while it runs. If vision_required is on and the
--   result isn't allowed, the listing is paused with a plain reason in auto_paused_reason,
--   cleared when the owner republishes. While the flag is off, photos are re-checked only.
-- - request_scan returns the latest check when it already covers the current photos.
-- - listing_scans is published for Realtime (owners watch their scans in the editor).

-- 1. The item policy: the same rows as services/vision/app/policy.json
-- (services/vision/tests/test_policy_sync.py checks the newest migration that seeds them).
with rows as (
  select e.item->>'key' as key, e.item->>'label' as label, e.item->>'kind' as kind,
         (e.item->>'allowed')::boolean as allowed, e.item->>'category' as category,
         e.item->>'item_type' as item_type, e.item->>'garment_type' as garment_type, e.item->>'style' as style,
         e.item->>'policy_group' as policy_group, e.item->>'noun' as noun, e.item->>'looks_like' as looks_like,
         e.item->>'reason' as reason, array(select pg_catalog.jsonb_array_elements_text(e.item->'prompts')) as prompts,
         e.n::integer as position
  from pg_catalog.jsonb_array_elements($policy$
[
{"key": "blazer", "label": "Blazer", "kind": "garment", "allowed": true, "category": "Career & Professional", "item_type": null, "garment_type": "suit", "style": "Western formal", "policy_group": null, "noun": "blazer", "looks_like": "a blazer", "reason": null, "prompts": ["a blazer", "a tailored blazer jacket", "a women's blazer", "a men's sport coat"]},
{"key": "suit", "label": "Suit", "kind": "garment", "allowed": true, "category": "Career & Professional", "item_type": null, "garment_type": "suit", "style": "Western formal", "policy_group": null, "noun": "suit", "looks_like": "a suit", "reason": null, "prompts": ["a suit", "a two-piece suit", "a matching suit jacket and trousers", "a business suit"]},
{"key": "waistcoat", "label": "Waistcoat", "kind": "garment", "allowed": true, "category": "Career & Professional", "item_type": null, "garment_type": "suit", "style": "Western formal", "policy_group": null, "noun": "waistcoat", "looks_like": "a waistcoat", "reason": null, "prompts": ["a waistcoat", "a suit vest", "a tailored waistcoat with buttons"]},
{"key": "dress_shirt", "label": "Dress shirt", "kind": "garment", "allowed": true, "category": "Career & Professional", "item_type": null, "garment_type": "top", "style": "Western formal", "policy_group": null, "noun": "shirt", "looks_like": "a dress shirt", "reason": null, "prompts": ["a dress shirt", "a formal button-down shirt", "a collared work shirt", "a silk button-up shirt"]},
{"key": "trousers", "label": "Trousers", "kind": "garment", "allowed": true, "category": "Career & Professional", "item_type": null, "garment_type": "trousers", "style": "Western formal", "policy_group": null, "noun": "trousers", "looks_like": "trousers", "reason": null, "prompts": ["trousers", "tailored trousers", "dress pants", "wide-leg trousers", "pleated trousers"]},
{"key": "chinos", "label": "Chinos", "kind": "garment", "allowed": true, "category": "Career & Professional", "item_type": null, "garment_type": "trousers", "style": "Western casual", "policy_group": null, "noun": "chinos", "looks_like": "chinos", "reason": null, "prompts": ["chinos", "khaki chino pants", "cotton chino trousers"]},
{"key": "cocktail_dress", "label": "Cocktail dress", "kind": "garment", "allowed": true, "category": "Occasion & Party", "item_type": null, "garment_type": "dress", "style": null, "policy_group": null, "noun": "cocktail dress", "looks_like": "a cocktail dress", "reason": null, "prompts": ["a cocktail dress", "a short party dress", "a knee-length cocktail dress"]},
{"key": "gown", "label": "Gown", "kind": "garment", "allowed": true, "category": "Occasion & Party", "item_type": null, "garment_type": "dress", "style": null, "policy_group": null, "noun": "gown", "looks_like": "a gown", "reason": null, "prompts": ["an evening gown", "a floor-length gown", "a ball gown", "a formal long gown"]},
{"key": "maxi_dress", "label": "Maxi dress", "kind": "garment", "allowed": true, "category": "Occasion & Party", "item_type": null, "garment_type": "dress", "style": null, "policy_group": null, "noun": "maxi dress", "looks_like": "a maxi dress", "reason": null, "prompts": ["a maxi dress", "a long flowing dress", "an ankle-length dress"]},
{"key": "slip_dress", "label": "Slip dress", "kind": "garment", "allowed": true, "category": "Occasion & Party", "item_type": null, "garment_type": "dress", "style": null, "policy_group": null, "noun": "slip dress", "looks_like": "a slip dress", "reason": null, "prompts": ["a slip dress", "a satin slip dress", "a silky dress with thin straps"]},
{"key": "jumpsuit", "label": "Jumpsuit", "kind": "garment", "allowed": true, "category": "Occasion & Party", "item_type": null, "garment_type": "dress", "style": null, "policy_group": null, "noun": "jumpsuit", "looks_like": "a jumpsuit", "reason": null, "prompts": ["a jumpsuit", "a one-piece jumpsuit", "a wide-leg jumpsuit", "a denim jumpsuit"]},
{"key": "tuxedo", "label": "Tuxedo", "kind": "garment", "allowed": true, "category": "Occasion & Party", "item_type": null, "garment_type": "suit", "style": "Western formal", "policy_group": null, "noun": "tuxedo", "looks_like": "a tuxedo", "reason": null, "prompts": ["a tuxedo", "a black tie tuxedo", "a dinner jacket"]},
{"key": "day_dress", "label": "Day dress", "kind": "garment", "allowed": true, "category": "Everyday", "item_type": null, "garment_type": "dress", "style": "Western casual", "policy_group": null, "noun": "dress", "looks_like": "a dress", "reason": null, "prompts": ["a sundress", "a casual summer dress", "a day dress", "a linen dress"]},
{"key": "skirt", "label": "Skirt", "kind": "garment", "allowed": true, "category": "Everyday", "item_type": null, "garment_type": "skirt", "style": "Western casual", "policy_group": null, "noun": "skirt", "looks_like": "a skirt", "reason": null, "prompts": ["a skirt", "a midi skirt", "a pleated skirt", "a mini skirt"]},
{"key": "blouse", "label": "Blouse", "kind": "garment", "allowed": true, "category": "Everyday", "item_type": null, "garment_type": "top", "style": "Western casual", "policy_group": null, "noun": "blouse", "looks_like": "a blouse", "reason": null, "prompts": ["a blouse", "a women's blouse", "a silk blouse", "a ruffled blouse"]},
{"key": "shirt", "label": "Shirt", "kind": "garment", "allowed": true, "category": "Everyday", "item_type": null, "garment_type": "top", "style": "Western casual", "policy_group": null, "noun": "shirt", "looks_like": "a shirt", "reason": null, "prompts": ["a button-up shirt", "a casual collared shirt", "a linen shirt", "a flannel shirt"]},
{"key": "western_shirt", "label": "Western shirt", "kind": "garment", "allowed": true, "category": "Everyday", "item_type": null, "garment_type": "top", "style": "Country & Western", "policy_group": null, "noun": "western shirt", "looks_like": "a western shirt", "reason": null, "prompts": ["a western shirt", "a cowboy shirt with pearl snaps", "a western snap shirt"]},
{"key": "sweater", "label": "Sweater", "kind": "garment", "allowed": true, "category": "Everyday", "item_type": null, "garment_type": "top", "style": "Western casual", "policy_group": null, "noun": "sweater", "looks_like": "a sweater", "reason": null, "prompts": ["a sweater", "a knit sweater", "a cardigan", "a wool jumper"]},
{"key": "denim_jacket", "label": "Denim jacket", "kind": "garment", "allowed": true, "category": "Outerwear", "item_type": null, "garment_type": "top", "style": "Western casual", "policy_group": null, "noun": "denim jacket", "looks_like": "a denim jacket", "reason": null, "prompts": ["a denim jacket", "a jean jacket", "a trucker jacket"]},
{"key": "bomber_jacket", "label": "Bomber jacket", "kind": "garment", "allowed": true, "category": "Outerwear", "item_type": null, "garment_type": "top", "style": "Western casual", "policy_group": null, "noun": "bomber jacket", "looks_like": "a bomber jacket", "reason": null, "prompts": ["a bomber jacket", "a satin bomber jacket", "a flight jacket"]},
{"key": "leather_jacket", "label": "Leather jacket", "kind": "garment", "allowed": true, "category": "Outerwear", "item_type": null, "garment_type": "top", "style": "Western casual", "policy_group": null, "noun": "leather jacket", "looks_like": "a leather jacket", "reason": null, "prompts": ["a leather jacket", "a biker jacket", "a moto jacket"]},
{"key": "puffer_jacket", "label": "Puffer jacket", "kind": "garment", "allowed": true, "category": "Outerwear", "item_type": null, "garment_type": "top", "style": "Western casual", "policy_group": null, "noun": "puffer jacket", "looks_like": "a puffer jacket", "reason": null, "prompts": ["a puffer jacket", "a quilted down jacket", "a padded winter jacket"]},
{"key": "coat", "label": "Coat", "kind": "garment", "allowed": true, "category": "Outerwear", "item_type": null, "garment_type": "top", "style": null, "policy_group": null, "noun": "coat", "looks_like": "a coat", "reason": null, "prompts": ["a wool coat", "an overcoat", "a long winter coat", "a tailored coat"]},
{"key": "trench_coat", "label": "Trench coat", "kind": "garment", "allowed": true, "category": "Outerwear", "item_type": null, "garment_type": "top", "style": null, "policy_group": null, "noun": "trench coat", "looks_like": "a trench coat", "reason": null, "prompts": ["a trench coat", "a belted trench coat", "a classic beige trench coat"]},
{"key": "saree", "label": "Saree", "kind": "garment", "allowed": true, "category": "Cultural & Traditional", "item_type": null, "garment_type": "saree", "style": "South Asian", "policy_group": null, "noun": "saree", "looks_like": "a saree", "reason": null, "prompts": ["a saree", "a sari", "a silk saree", "an indian saree with a border"]},
{"key": "lehenga", "label": "Lehenga", "kind": "garment", "allowed": true, "category": "Cultural & Traditional", "item_type": null, "garment_type": "saree", "style": "South Asian", "policy_group": null, "noun": "lehenga", "looks_like": "a lehenga", "reason": null, "prompts": ["a lehenga", "a lehenga choli", "an embroidered lehenga skirt", "an indian bridal lehenga"]},
{"key": "anarkali", "label": "Anarkali", "kind": "garment", "allowed": true, "category": "Cultural & Traditional", "item_type": null, "garment_type": "dress", "style": "South Asian", "policy_group": null, "noun": "anarkali", "looks_like": "an anarkali", "reason": null, "prompts": ["an anarkali dress", "an anarkali suit", "a long flared indian anarkali"]},
{"key": "salwar_kameez", "label": "Salwar kameez", "kind": "garment", "allowed": true, "category": "Cultural & Traditional", "item_type": null, "garment_type": "dress", "style": "South Asian", "policy_group": null, "noun": "salwar kameez", "looks_like": "a salwar kameez", "reason": null, "prompts": ["a salwar kameez", "a shalwar kameez set", "a punjabi suit"]},
{"key": "kurta", "label": "Kurta", "kind": "garment", "allowed": true, "category": "Cultural & Traditional", "item_type": null, "garment_type": "top", "style": "South Asian", "policy_group": null, "noun": "kurta", "looks_like": "a kurta", "reason": null, "prompts": ["a kurta", "an indian kurta", "a kurti tunic"]},
{"key": "sherwani", "label": "Sherwani", "kind": "garment", "allowed": true, "category": "Cultural & Traditional", "item_type": null, "garment_type": "suit", "style": "South Asian", "policy_group": null, "noun": "sherwani", "looks_like": "a sherwani", "reason": null, "prompts": ["a sherwani", "an indian sherwani for men", "a groom's sherwani"]},
{"key": "dupatta", "label": "Dupatta", "kind": "garment", "allowed": true, "category": "Cultural & Traditional", "item_type": null, "garment_type": "one_size", "style": "South Asian", "policy_group": null, "noun": "dupatta", "looks_like": "a dupatta", "reason": null, "prompts": ["a dupatta", "an embroidered dupatta scarf", "an indian chunni"]},
{"key": "qipao", "label": "Qipao", "kind": "garment", "allowed": true, "category": "Cultural & Traditional", "item_type": null, "garment_type": "dress", "style": "East Asian", "policy_group": null, "noun": "qipao", "looks_like": "a qipao", "reason": null, "prompts": ["a qipao", "a cheongsam", "a chinese qipao dress", "a silk dress with a mandarin collar"]},
{"key": "kimono", "label": "Kimono", "kind": "garment", "allowed": true, "category": "Cultural & Traditional", "item_type": null, "garment_type": "dress", "style": "East Asian", "policy_group": null, "noun": "kimono", "looks_like": "a kimono", "reason": null, "prompts": ["a kimono", "a japanese kimono", "a silk kimono with an obi"]},
{"key": "hanbok", "label": "Hanbok", "kind": "garment", "allowed": true, "category": "Cultural & Traditional", "item_type": null, "garment_type": "dress", "style": "East Asian", "policy_group": null, "noun": "hanbok", "looks_like": "a hanbok", "reason": null, "prompts": ["a hanbok", "a korean hanbok", "a traditional korean dress"]},
{"key": "ao_dai", "label": "Ao dai", "kind": "garment", "allowed": true, "category": "Cultural & Traditional", "item_type": null, "garment_type": "dress", "style": "Southeast Asian", "policy_group": null, "noun": "ao dai", "looks_like": "an ao dai", "reason": null, "prompts": ["an ao dai", "a vietnamese ao dai", "a long vietnamese tunic over trousers"]},
{"key": "kebaya", "label": "Kebaya", "kind": "garment", "allowed": true, "category": "Cultural & Traditional", "item_type": null, "garment_type": "top", "style": "Southeast Asian", "policy_group": null, "noun": "kebaya", "looks_like": "a kebaya", "reason": null, "prompts": ["a kebaya", "a lace kebaya blouse", "an indonesian kebaya"]},
{"key": "barong", "label": "Barong", "kind": "garment", "allowed": true, "category": "Cultural & Traditional", "item_type": null, "garment_type": "top", "style": "Southeast Asian", "policy_group": null, "noun": "barong", "looks_like": "a barong", "reason": null, "prompts": ["a barong tagalog", "a filipino barong shirt", "a sheer embroidered barong"]},
{"key": "kaftan", "label": "Kaftan", "kind": "garment", "allowed": true, "category": "Cultural & Traditional", "item_type": null, "garment_type": "dress", "style": "Middle Eastern", "policy_group": null, "noun": "kaftan", "looks_like": "a kaftan", "reason": null, "prompts": ["a kaftan", "an embroidered kaftan dress", "a caftan"]},
{"key": "abaya", "label": "Abaya", "kind": "garment", "allowed": true, "category": "Cultural & Traditional", "item_type": null, "garment_type": "dress", "style": "Middle Eastern", "policy_group": null, "noun": "abaya", "looks_like": "an abaya", "reason": null, "prompts": ["an abaya", "a long black abaya", "a modest abaya robe"]},
{"key": "african_print_dress", "label": "African print dress", "kind": "garment", "allowed": true, "category": "Cultural & Traditional", "item_type": null, "garment_type": "dress", "style": "African", "policy_group": null, "noun": "African print dress", "looks_like": "an African print dress", "reason": null, "prompts": ["an african print dress", "an ankara wax print dress", "a kente cloth dress"]},
{"key": "dashiki", "label": "Dashiki", "kind": "garment", "allowed": true, "category": "Cultural & Traditional", "item_type": null, "garment_type": "top", "style": "African", "policy_group": null, "noun": "dashiki", "looks_like": "a dashiki", "reason": null, "prompts": ["a dashiki", "a dashiki shirt", "an african dashiki tunic"]},
{"key": "huipil", "label": "Huipil", "kind": "garment", "allowed": true, "category": "Cultural & Traditional", "item_type": null, "garment_type": "top", "style": "Mexican & Latin American", "policy_group": null, "noun": "huipil", "looks_like": "a huipil", "reason": null, "prompts": ["a huipil", "a mexican embroidered huipil blouse", "an oaxacan huipil"]},
{"key": "folklorico_dress", "label": "Folklórico dress", "kind": "garment", "allowed": true, "category": "Cultural & Traditional", "item_type": null, "garment_type": "dress", "style": "Mexican & Latin American", "policy_group": null, "noun": "folklórico dress", "looks_like": "a folklórico dress", "reason": null, "prompts": ["a folklorico dress", "a mexican folklorico dress with ribbons", "a traditional mexican dance dress"]},
{"key": "tie", "label": "Tie", "kind": "accessory", "allowed": true, "category": "Accessories", "item_type": "Tie", "garment_type": "one_size", "style": "Western formal", "policy_group": null, "noun": "tie", "looks_like": "a tie", "reason": null, "prompts": ["a necktie", "a silk tie", "a bow tie"]},
{"key": "handbag", "label": "Handbag", "kind": "accessory", "allowed": true, "category": "Accessories", "item_type": "Handbag", "garment_type": "one_size", "style": null, "policy_group": null, "noun": "handbag", "looks_like": "a handbag", "reason": null, "prompts": ["a handbag", "a leather purse", "a tote bag", "a shoulder bag"]},
{"key": "clutch", "label": "Clutch", "kind": "accessory", "allowed": true, "category": "Accessories", "item_type": "Handbag", "garment_type": "one_size", "style": null, "policy_group": null, "noun": "clutch", "looks_like": "a clutch", "reason": null, "prompts": ["a clutch bag", "an evening clutch purse", "a beaded clutch"]},
{"key": "crossbody_bag", "label": "Crossbody bag", "kind": "accessory", "allowed": true, "category": "Accessories", "item_type": "Handbag", "garment_type": "one_size", "style": null, "policy_group": null, "noun": "crossbody bag", "looks_like": "a crossbody bag", "reason": null, "prompts": ["a crossbody bag", "a small crossbody purse with a strap"]},
{"key": "potli_bag", "label": "Potli bag", "kind": "accessory", "allowed": true, "category": "Accessories", "item_type": "Handbag", "garment_type": "one_size", "style": "South Asian", "policy_group": null, "noun": "potli bag", "looks_like": "a potli bag", "reason": null, "prompts": ["a potli bag", "an embroidered drawstring potli purse"]},
{"key": "sunglasses", "label": "Sunglasses", "kind": "accessory", "allowed": true, "category": "Accessories", "item_type": "Sunglasses", "garment_type": "one_size", "style": null, "policy_group": null, "noun": "sunglasses", "looks_like": "sunglasses", "reason": null, "prompts": ["sunglasses", "a pair of sunglasses", "designer sunglasses"]},
{"key": "watch", "label": "Watch", "kind": "accessory", "allowed": true, "category": "Accessories", "item_type": "Watch (non-smart)", "garment_type": "one_size", "style": null, "policy_group": null, "noun": "watch", "looks_like": "a watch", "reason": null, "prompts": ["a wristwatch", "an analog watch", "a classic watch with hands"]},
{"key": "belt_buckle", "label": "Belt buckle", "kind": "accessory", "allowed": true, "category": "Accessories", "item_type": "Belt buckle", "garment_type": "one_size", "style": "Country & Western", "policy_group": null, "noun": "belt buckle", "looks_like": "a belt buckle", "reason": null, "prompts": ["a belt buckle", "a western belt buckle", "a leather belt with a buckle"]},
{"key": "necklace", "label": "Necklace", "kind": "accessory", "allowed": true, "category": "Accessories", "item_type": "Costume jewelry", "garment_type": "one_size", "style": null, "policy_group": null, "noun": "necklace", "looks_like": "a necklace", "reason": null, "prompts": ["a necklace", "a statement necklace", "a pendant necklace"]},
{"key": "earrings", "label": "Earrings", "kind": "accessory", "allowed": true, "category": "Accessories", "item_type": "Costume jewelry", "garment_type": "one_size", "style": null, "policy_group": null, "noun": "earrings", "looks_like": "earrings", "reason": null, "prompts": ["earrings", "a pair of earrings", "drop earrings"]},
{"key": "bracelet", "label": "Bracelet", "kind": "accessory", "allowed": true, "category": "Accessories", "item_type": "Costume jewelry", "garment_type": "one_size", "style": null, "policy_group": null, "noun": "bracelet", "looks_like": "a bracelet", "reason": null, "prompts": ["a bracelet", "a bangle bracelet", "bangles"]},
{"key": "ring", "label": "Ring", "kind": "accessory", "allowed": true, "category": "Accessories", "item_type": "Costume jewelry", "garment_type": "one_size", "style": null, "policy_group": null, "noun": "ring", "looks_like": "a ring", "reason": null, "prompts": ["a ring", "a cocktail ring", "a finger ring"]},
{"key": "brooch", "label": "Brooch", "kind": "accessory", "allowed": true, "category": "Accessories", "item_type": "Costume jewelry", "garment_type": "one_size", "style": null, "policy_group": null, "noun": "brooch", "looks_like": "a brooch", "reason": null, "prompts": ["a brooch", "a decorative brooch pin"]},
{"key": "tshirt", "label": "T-shirt", "kind": "garment", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "T-shirts and tank tops", "noun": "T-shirt", "looks_like": "a T-shirt", "reason": "This looks like a T-shirt. Dzirent doesn't list everyday basics like T-shirts.", "prompts": ["a t-shirt", "a plain cotton t-shirt", "a crew neck tee", "a graphic print t-shirt"]},
{"key": "sleeveless_tee", "label": "Sleeveless tee", "kind": "garment", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "T-shirts and tank tops", "noun": "sleeveless tee", "looks_like": "a sleeveless tee", "reason": "This looks like a sleeveless tee. Dzirent doesn't list everyday basics like T-shirts.", "prompts": ["a sleeveless t-shirt", "a muscle tee", "a sleeveless cotton tee"]},
{"key": "sport_tee", "label": "Sport tee", "kind": "garment", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "T-shirts and tank tops", "noun": "sport tee", "looks_like": "a sport tee", "reason": "This looks like a sport tee. Dzirent doesn't list everyday basics like T-shirts.", "prompts": ["a sports t-shirt", "an athletic workout tee", "a training shirt", "a sports jersey"]},
{"key": "tank_top", "label": "Tank top", "kind": "garment", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "T-shirts and tank tops", "noun": "tank top", "looks_like": "a tank top", "reason": "This looks like a tank top. Dzirent doesn't list everyday basics like tank tops.", "prompts": ["a tank top", "a ribbed tank top", "a sleeveless cotton tank", "an athletic tank top"]},
{"key": "track_pants", "label": "Track pants", "kind": "garment", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "track pants, sweatpants and joggers", "noun": "track pants", "looks_like": "track pants", "reason": "This looks like track pants. Dzirent doesn't list everyday basics like track pants.", "prompts": ["track pants", "athletic track pants with side stripes", "nylon track pants"]},
{"key": "sweatpants", "label": "Sweatpants", "kind": "garment", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "track pants, sweatpants and joggers", "noun": "sweatpants", "looks_like": "sweatpants", "reason": "This looks like sweatpants. Dzirent doesn't list everyday basics like sweatpants.", "prompts": ["sweatpants", "grey fleece sweatpants", "lounge sweatpants"]},
{"key": "joggers", "label": "Joggers", "kind": "garment", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "track pants, sweatpants and joggers", "noun": "joggers", "looks_like": "joggers", "reason": "This looks like joggers. Dzirent doesn't list everyday basics like joggers.", "prompts": ["joggers", "jogger pants with elastic cuffs", "cotton joggers"]},
{"key": "shorts", "label": "Shorts", "kind": "garment", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "shorts", "noun": "shorts", "looks_like": "shorts", "reason": "This looks like shorts. Dzirent doesn't list everyday basics like shorts.", "prompts": ["shorts", "casual shorts", "athletic shorts", "cargo shorts"]},
{"key": "jean_shorts", "label": "Jean shorts", "kind": "garment", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "shorts", "noun": "jean shorts", "looks_like": "jean shorts", "reason": "This looks like jean shorts. Dzirent doesn't list everyday basics like jean shorts.", "prompts": ["jean shorts", "denim shorts", "cutoff denim shorts"]},
{"key": "jeans", "label": "Jeans", "kind": "garment", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "jeans", "noun": "jeans", "looks_like": "plain jeans", "reason": "This looks like plain jeans. Dzirent doesn't list everyday basics like jeans.", "prompts": ["jeans", "blue denim jeans", "a pair of skinny jeans", "straight leg jeans"]},
{"key": "hoodie", "label": "Hoodie", "kind": "garment", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "hoodies and sweatshirts", "noun": "hoodie", "looks_like": "a hoodie", "reason": "This looks like a hoodie. Dzirent doesn't list everyday basics like hoodies and sweatshirts.", "prompts": ["a hoodie", "a hooded sweatshirt", "a zip-up hoodie"]},
{"key": "sweatshirt", "label": "Sweatshirt", "kind": "garment", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "hoodies and sweatshirts", "noun": "sweatshirt", "looks_like": "a sweatshirt", "reason": "This looks like a sweatshirt. Dzirent doesn't list everyday basics like hoodies and sweatshirts.", "prompts": ["a sweatshirt", "a crewneck sweatshirt", "a fleece pullover"]},
{"key": "sneakers", "label": "Sneakers", "kind": "accessory", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "shoes", "noun": "sneakers", "looks_like": "sneakers", "reason": "This looks like sneakers. Dzirent doesn't allow shoes.", "prompts": ["sneakers", "a pair of sneakers", "running shoes", "athletic shoes"]},
{"key": "heels", "label": "Heels", "kind": "accessory", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "shoes", "noun": "heels", "looks_like": "heels", "reason": "This looks like heels. Dzirent doesn't allow shoes.", "prompts": ["high heels", "a pair of high heel shoes", "stiletto pumps"]},
{"key": "sandals", "label": "Sandals", "kind": "accessory", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "shoes", "noun": "sandals", "looks_like": "sandals", "reason": "This looks like sandals. Dzirent doesn't allow shoes.", "prompts": ["sandals", "a pair of sandals", "flip flops", "slides"]},
{"key": "boots", "label": "Boots", "kind": "accessory", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "shoes", "noun": "boots", "looks_like": "boots", "reason": "This looks like boots. Dzirent doesn't allow shoes or boots.", "prompts": ["boots", "a pair of leather boots", "ankle boots", "cowboy boots"]},
{"key": "dress_shoes", "label": "Dress shoes", "kind": "accessory", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "shoes", "noun": "dress shoes", "looks_like": "dress shoes", "reason": "This looks like dress shoes. Dzirent doesn't allow shoes.", "prompts": ["dress shoes", "leather oxford shoes", "loafers", "ballet flats"]},
{"key": "socks", "label": "Socks", "kind": "accessory", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "socks", "noun": "socks", "looks_like": "socks", "reason": "This looks like socks. Dzirent doesn't allow socks.", "prompts": ["socks", "a pair of socks", "ankle socks", "knee-high socks"]},
{"key": "pantyhose", "label": "Pantyhose", "kind": "accessory", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "pantyhose", "noun": "pantyhose", "looks_like": "pantyhose", "reason": "This looks like pantyhose. Dzirent doesn't allow pantyhose or tights.", "prompts": ["pantyhose", "sheer tights", "nylon stockings"]},
{"key": "cap", "label": "Cap", "kind": "accessory", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "hats and caps", "noun": "cap", "looks_like": "a cap", "reason": "This looks like a cap. Dzirent doesn't allow caps or hats.", "prompts": ["a baseball cap", "a cap", "a snapback cap", "a trucker hat"]},
{"key": "hat", "label": "Hat", "kind": "accessory", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "hats and caps", "noun": "hat", "looks_like": "a hat", "reason": "This looks like a hat. Dzirent doesn't allow hats or caps.", "prompts": ["a hat", "a sun hat", "a fedora", "a beanie", "a straw hat"]},
{"key": "cowboy_hat", "label": "Cowboy hat", "kind": "accessory", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "hats and caps", "noun": "cowboy hat", "looks_like": "a cowboy hat", "reason": "This looks like a cowboy hat. Dzirent doesn't allow hats or caps.", "prompts": ["a cowboy hat", "a western felt hat"]},
{"key": "smartwatch", "label": "Smartwatch", "kind": "accessory", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "smartwatches", "noun": "smartwatch", "looks_like": "a smartwatch", "reason": "This looks like a smartwatch. Dzirent doesn't allow smartwatches.", "prompts": ["a smartwatch", "a smart watch with a touch screen", "a fitness tracker watch", "an apple watch"]},
{"key": "lingerie", "label": "Lingerie", "kind": "garment", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "lingerie", "noun": "lingerie", "looks_like": "lingerie", "reason": "This looks like lingerie. Dzirent doesn't allow lingerie.", "prompts": ["lingerie", "a lace bra and panty set", "a bra", "a lingerie bodysuit"]},
{"key": "underwear", "label": "Underwear", "kind": "garment", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "underwear", "noun": "underwear", "looks_like": "underwear", "reason": "This looks like underwear. Dzirent doesn't allow underwear.", "prompts": ["underwear", "boxer briefs", "panties", "men's briefs"]},
{"key": "swimwear", "label": "Swimwear", "kind": "garment", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "swimwear", "noun": "swimwear", "looks_like": "swimwear", "reason": "This looks like swimwear. Dzirent doesn't allow swimwear.", "prompts": ["a swimsuit", "a bikini", "swim trunks", "a one-piece bathing suit"]},
{"key": "phone", "label": "Phone", "kind": "other", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "not clothing", "noun": "phone", "looks_like": "a phone", "reason": "This doesn't look like clothing or an accessory we list.", "prompts": ["a smartphone", "a mobile phone", "a cell phone"]},
{"key": "laptop", "label": "Laptop", "kind": "other", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "not clothing", "noun": "laptop", "looks_like": "a laptop", "reason": "This doesn't look like clothing or an accessory we list.", "prompts": ["a laptop computer", "a laptop on a desk", "a notebook computer"]},
{"key": "computer", "label": "Computer", "kind": "other", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "not clothing", "noun": "computer", "looks_like": "a computer", "reason": "This doesn't look like clothing or an accessory we list.", "prompts": ["a desktop computer and monitor", "a computer keyboard and mouse", "a tablet computer"]},
{"key": "television", "label": "Television", "kind": "other", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "not clothing", "noun": "television", "looks_like": "a television", "reason": "This doesn't look like clothing or an accessory we list.", "prompts": ["a television", "a flat screen tv"]},
{"key": "headphones", "label": "Headphones", "kind": "other", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "not clothing", "noun": "headphones", "looks_like": "headphones", "reason": "This doesn't look like clothing or an accessory we list.", "prompts": ["headphones", "wireless earbuds", "a bluetooth speaker"]},
{"key": "camera", "label": "Camera", "kind": "other", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "not clothing", "noun": "camera", "looks_like": "a camera", "reason": "This doesn't look like clothing or an accessory we list.", "prompts": ["a camera", "a digital camera with a lens"]},
{"key": "game_console", "label": "Game console", "kind": "other", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "not clothing", "noun": "game console", "looks_like": "a game console", "reason": "This doesn't look like clothing or an accessory we list.", "prompts": ["a video game console", "a game controller"]},
{"key": "power_tool", "label": "Power tool", "kind": "other", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "not clothing", "noun": "power tool", "looks_like": "a power tool", "reason": "This doesn't look like clothing or an accessory we list.", "prompts": ["a power drill", "a cordless power tool", "a chainsaw"]},
{"key": "hand_tools", "label": "Tools", "kind": "other", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "not clothing", "noun": "tools", "looks_like": "tools", "reason": "This doesn't look like clothing or an accessory we list.", "prompts": ["hand tools", "a hammer and a screwdriver", "a wrench", "a toolbox"]},
{"key": "lawn_mower", "label": "Lawn mower", "kind": "other", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "not clothing", "noun": "lawn mower", "looks_like": "a lawn mower", "reason": "This doesn't look like clothing or an accessory we list.", "prompts": ["a lawn mower", "garden equipment"]},
{"key": "kitchen_appliance", "label": "Kitchen appliance", "kind": "other", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "not clothing", "noun": "kitchen appliance", "looks_like": "a kitchen appliance", "reason": "This doesn't look like clothing or an accessory we list.", "prompts": ["a kitchen appliance", "a blender", "a microwave oven", "a coffee maker"]},
{"key": "cookware", "label": "Cookware", "kind": "other", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "not clothing", "noun": "cookware", "looks_like": "cookware", "reason": "This doesn't look like clothing or an accessory we list.", "prompts": ["pots and pans", "kitchen cookware", "plates and dishes"]},
{"key": "household_object", "label": "Household object", "kind": "other", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "not clothing", "noun": "household object", "looks_like": "a household object", "reason": "This doesn't look like clothing or an accessory we list.", "prompts": ["a lamp", "a vase", "a houseplant in a pot", "a household object"]},
{"key": "books", "label": "Books", "kind": "other", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "not clothing", "noun": "books", "looks_like": "books", "reason": "This doesn't look like clothing or an accessory we list.", "prompts": ["books", "a stack of books", "a magazine"]},
{"key": "document", "label": "Document", "kind": "other", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "not clothing", "noun": "document", "looks_like": "a document", "reason": "This doesn't look like clothing or an accessory we list.", "prompts": ["a document", "a sheet of paper with text", "a screenshot", "an id card"]},
{"key": "food", "label": "Food", "kind": "other", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "not clothing", "noun": "food", "looks_like": "food", "reason": "This doesn't look like clothing or an accessory we list.", "prompts": ["food on a plate", "a pizza", "a sandwich", "fresh fruit"]},
{"key": "drink", "label": "Drink", "kind": "other", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "not clothing", "noun": "drink", "looks_like": "a drink", "reason": "This doesn't look like clothing or an accessory we list.", "prompts": ["a cup of coffee", "a bottle of soda", "a glass of wine"]},
{"key": "room", "label": "Room", "kind": "other", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "not clothing", "noun": "room", "looks_like": "a room", "reason": "This doesn't look like clothing or an accessory we list.", "prompts": ["an empty room", "a living room interior", "a bedroom interior", "a kitchen interior"]},
{"key": "sofa", "label": "Sofa", "kind": "other", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "not clothing", "noun": "sofa", "looks_like": "a sofa", "reason": "This doesn't look like clothing or an accessory we list.", "prompts": ["a sofa", "a couch"]},
{"key": "chair", "label": "Chair", "kind": "other", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "not clothing", "noun": "chair", "looks_like": "a chair", "reason": "This doesn't look like clothing or an accessory we list.", "prompts": ["a chair", "an armchair", "an office chair"]},
{"key": "table", "label": "Table", "kind": "other", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "not clothing", "noun": "table", "looks_like": "a table", "reason": "This doesn't look like clothing or an accessory we list.", "prompts": ["a table", "a desk", "a wooden dining table"]},
{"key": "bed", "label": "Bed", "kind": "other", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "not clothing", "noun": "bed", "looks_like": "a bed", "reason": "This doesn't look like clothing or an accessory we list.", "prompts": ["a bed with pillows", "a mattress"]},
{"key": "car", "label": "Car", "kind": "other", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "not clothing", "noun": "car", "looks_like": "a car", "reason": "This doesn't look like clothing or an accessory we list.", "prompts": ["a car", "a car parked on the street", "a truck"]},
{"key": "bicycle", "label": "Bicycle", "kind": "other", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "not clothing", "noun": "bicycle", "looks_like": "a bike", "reason": "This doesn't look like clothing or an accessory we list.", "prompts": ["a bicycle", "a bike"]},
{"key": "motorcycle", "label": "Motorcycle", "kind": "other", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "not clothing", "noun": "motorcycle", "looks_like": "a motorcycle", "reason": "This doesn't look like clothing or an accessory we list.", "prompts": ["a motorcycle", "a scooter"]},
{"key": "dog", "label": "Dog", "kind": "other", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "not clothing", "noun": "dog", "looks_like": "a dog", "reason": "This doesn't look like clothing or an accessory we list.", "prompts": ["a dog", "a puppy"]},
{"key": "cat", "label": "Cat", "kind": "other", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "not clothing", "noun": "cat", "looks_like": "a cat", "reason": "This doesn't look like clothing or an accessory we list.", "prompts": ["a cat", "a kitten"]},
{"key": "pet", "label": "Pet", "kind": "other", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "not clothing", "noun": "pet", "looks_like": "a pet", "reason": "This doesn't look like clothing or an accessory we list.", "prompts": ["a pet bird", "a pet rabbit", "a hamster", "a fish in an aquarium"]},
{"key": "selfie", "label": "Selfie", "kind": "other", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "not clothing", "noun": "selfie", "looks_like": "a selfie", "reason": "This doesn't look like clothing or an accessory we list.", "prompts": ["a selfie", "a close-up selfie of a person's face", "a portrait photo of a face"]},
{"key": "outdoor_scene", "label": "Outdoor scene", "kind": "other", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "not clothing", "noun": "outdoor scene", "looks_like": "an outdoor scene", "reason": "This doesn't look like clothing or an accessory we list.", "prompts": ["a landscape", "a city street", "a beach", "a garden"]},
{"key": "sports_gear", "label": "Sports gear", "kind": "other", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "not clothing", "noun": "sports gear", "looks_like": "sports gear", "reason": "This doesn't look like clothing or an accessory we list.", "prompts": ["a tent", "a kayak", "skis", "a basketball", "a yoga mat"]},
{"key": "toy", "label": "Toy", "kind": "other", "allowed": false, "category": null, "item_type": null, "garment_type": null, "style": null, "policy_group": "not clothing", "noun": "toy", "looks_like": "a toy", "reason": "This doesn't look like clothing or an accessory we list.", "prompts": ["a toy", "a stuffed animal", "toy building blocks"]}
]
$policy$::jsonb) with ordinality as e(item, n)
), gone as (
  delete from public.policy_item_types p where not exists (select 1 from rows r where r.key = p.key)
)
insert into public.policy_item_types
  (key, label, kind, allowed, category, item_type, garment_type, style, policy_group, noun, looks_like,
   reason, prompts, position)
select key, label, kind, allowed, category, item_type, garment_type, style, policy_group, noun, looks_like,
       reason, prompts, position
from rows
on conflict (key) do update set
  label = excluded.label, kind = excluded.kind, allowed = excluded.allowed, category = excluded.category,
  item_type = excluded.item_type, garment_type = excluded.garment_type, style = excluded.style,
  policy_group = excluded.policy_group, noun = excluded.noun, looks_like = excluded.looks_like,
  reason = excluded.reason, prompts = excluded.prompts, position = excluded.position;

-- 2. Flag wording.
update public.app_settings
  set description = 'Renters and lenders verify their ID once, before their first message or first listing.',
      updated_at = pg_catalog.now()
  where key = 'verification_required';

-- 3. Why the server paused a listing. Written only by the server; owners read it with the row.
alter table public.listings add column auto_paused_reason text;
alter table public.listings add constraint listings_auto_paused_reason_length
  check (auto_paused_reason is null or pg_catalog.char_length(auto_paused_reason) <= 300);

-- 4. Owners watch their scans live in the editor (RLS still applies to every change sent).
alter publication supabase_realtime add table public.listing_scans;

-- 5. Helpers.
create or replace function app_private.vision_required()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((select s.enabled from public.app_settings s where s.key = 'vision_required'), false);
$function$;

-- The check for a listing's current photos: the one already waiting or running, else the latest
-- finished check if it covers the current photo set, else a new one (calls scan-listing after
-- this transaction commits). Null when the lender reached the 20-an-hour cost guard.
create or replace function app_private.queue_scan(p_listing_id uuid, p_lender uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_status text;
  v_hash text;
  v_url text;
  v_secret text;
begin
  -- Calls for one listing run one after another, so two can't both start a scan.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_listing_id::text, 8));

  -- A scan that never finished (scan-listing stopped) stops blocking after 10 minutes.
  update public.listing_scans
    set status = 'failed', verdict = 'review', error = 'timed_out', finished_at = pg_catalog.now(),
        reason = 'The photo check didn''t finish. Try again.'
    where listing_id = p_listing_id and status in ('queued', 'running')
      and created_at < pg_catalog.now() - interval '10 minutes';

  select s.id into v_id from public.listing_scans s
    where s.listing_id = p_listing_id and s.status in ('queued', 'running');
  if found then
    return v_id;
  end if;

  select s.id, s.status, s.photo_set_hash into v_id, v_status, v_hash
    from public.listing_scans s
    where s.listing_id = p_listing_id
    order by s.created_at desc
    limit 1;
  if found and v_status = 'done' and v_hash = app_private.photo_set_hash(p_listing_id) then
    return v_id;
  end if;

  -- Cost guard: each lender gets at most 20 new checks an hour.
  if (select pg_catalog.count(*) from public.listing_scans s
        join public.listings l on l.id = s.listing_id
        where l.lender_id = p_lender and s.created_at > pg_catalog.now() - interval '1 hour') >= 20 then
    return null;
  end if;

  select ds.decrypted_secret into v_url from vault.decrypted_secrets ds where ds.name = 'scan_listing_url';
  select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.name = 'scan_listing_secret';
  if v_url is null or v_secret is null then
    raise exception 'Photo checks are not set up' using errcode = 'P0001';
  end if;

  insert into public.listing_scans (listing_id) values (p_listing_id) returning id into v_id;
  -- Sent after this transaction commits. scan-listing answers at once and works in the background.
  perform net.http_post(
    url := v_url,
    body := pg_catalog.jsonb_build_object('scan_id', v_id),
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'x-scan-listing-secret', v_secret
    ),
    timeout_milliseconds := 10000
  );
  return v_id;
end;
$function$;

-- Pauses an active listing with [p_reason] while vision_required is on (server side only).
create or replace function app_private.vision_pause(p_listing_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if app_private.vision_required() then
    update public.listings
      set status = 'paused', auto_paused_reason = pg_catalog.left(p_reason, 300)
      where id = p_listing_id and status = 'active';
  end if;
end;
$function$;

-- Re-checks an active listing after its photos changed. When the cost guard stops a new check
-- while vision_required is on, the listing is paused: changed photos never stay live unchecked.
create or replace function app_private.recheck_active_listing(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_lender uuid;
begin
  select l.lender_id into v_lender from public.listings l where l.id = p_listing_id and l.status = 'active';
  if not found or not exists (select 1 from public.listing_photos p where p.listing_id = p_listing_id) then
    return;
  end if;
  if app_private.queue_scan(p_listing_id, v_lender) is null then
    perform app_private.vision_pause(p_listing_id,
      'Paused: the photos changed too often to check right now. Check them again in an hour.');
  end if;
end;
$function$;

-- 6. request_scan: the owner asks for the check of the listing's current photos.
create or replace function public.request_scan(p_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.listings l where l.id = p_listing_id and l.lender_id = v_uid) then
    raise exception 'Not your listing' using errcode = '42501';
  end if;
  if not exists (select 1 from public.listing_photos p where p.listing_id = p_listing_id) then
    raise exception 'Add a photo first' using errcode = '22023';
  end if;
  v_id := app_private.queue_scan(p_listing_id, v_uid);
  if v_id is null then
    raise exception 'Too many photo checks. Try again in an hour.' using errcode = 'P0001';
  end if;
  return v_id;
end;
$function$;

-- 7. Photos of an active listing changed (added, removed, moved slot, replaced): check again.
-- A problem here never stops the photo change itself.
create or replace function app_private.rescan_on_photo_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_listing uuid;
begin
  for v_listing in
    select distinct x from pg_catalog.unnest(array[
      case when tg_op <> 'INSERT' then old.listing_id end,
      case when tg_op <> 'DELETE' then new.listing_id end
    ]) as x where x is not null
  loop
    perform app_private.recheck_active_listing(v_listing);
  end loop;
  return null;
exception when others then
  raise warning 'Photo re-check skipped: %', sqlerrm;
  return null;
end;
$function$;

create trigger listing_photos_rescan_insert_delete after insert or delete on public.listing_photos
  for each row execute function app_private.rescan_on_photo_change();
create trigger listing_photos_rescan_update after update of storage_path, slot, listing_id on public.listing_photos
  for each row
  when (old.storage_path is distinct from new.storage_path or old.slot is distinct from new.slot
        or old.listing_id is distinct from new.listing_id)
  execute function app_private.rescan_on_photo_change();

-- 8. Saving a result. A photo nearly identical (cosine similarity 0.95 or more) to a photo of
-- another lender's listing sends the listing to review; a rejection stays a rejection. Then, for
-- an active listing: if the photos changed while this check ran, check again; otherwise, with
-- vision_required on and a result that isn't allowed, pause it.
create or replace function public.vision_finish_scan(p_scan_id uuid, p_photo_set_hash text, p_result jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_listing uuid;
  v_lender uuid;
  v_status text;
  v_verdict text := p_result->>'verdict';
  v_reason text := p_result->>'reason';
  v_suggestions jsonb;
  v_duplicate boolean;
  v_current boolean;
begin
  select s.listing_id, l.lender_id, l.status into v_listing, v_lender, v_status
    from public.listing_scans s
    join public.listings l on l.id = s.listing_id
    where s.id = p_scan_id and s.status = 'running'
    for update of s;
  if not found then
    raise exception 'Scan is not running' using errcode = 'P0001';
  end if;
  if v_verdict is null or v_verdict not in ('allowed', 'rejected', 'review') or coalesce(v_reason, '') = ''
     or p_photo_set_hash is null or p_photo_set_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Bad scan result' using errcode = '22023';
  end if;

  -- Only photos that are still on this listing.
  insert into public.photo_scans
    (scan_id, listing_id, photo_id, storage_path, slot, blur_score, brightness_score, framing_score,
     worn_probability, fingerprint, labels, warnings, decision)
  select p_scan_id, v_listing, lp.id, lp.storage_path, lp.slot,
         (e->>'blur_score')::real, (e->>'brightness_score')::real, (e->>'framing_score')::real,
         (e->>'worn_by_person')::real,
         ((e->'fingerprint')::text)::extensions.vector,
         case when pg_catalog.jsonb_typeof(e->'labels') = 'object' then e->'labels' else '{}'::jsonb end
           || pg_catalog.jsonb_build_object('checks', e->'checks', 'looks_like', e->'looks_like'),
         array(select pg_catalog.jsonb_array_elements_text(
           case when pg_catalog.jsonb_typeof(e->'warnings') = 'array' then e->'warnings' else '[]'::jsonb end)),
         e->>'decision'
  from pg_catalog.jsonb_array_elements(
         case when pg_catalog.jsonb_typeof(p_result->'photos') = 'array' then p_result->'photos' else '[]'::jsonb end
       ) e
  join public.listing_photos lp on lp.id = (e->>'photo_id')::uuid and lp.listing_id = v_listing
  where (e->>'ok')::boolean;

  select exists (
    select 1
    from public.photo_scans mine
    join public.photo_scans other on other.listing_id <> v_listing
    join public.listings ol on ol.id = other.listing_id and ol.lender_id <> v_lender
    where mine.scan_id = p_scan_id
      and (mine.fingerprint operator(extensions.<=>) other.fingerprint) <= 0.05
  ) into v_duplicate;
  if v_duplicate and v_verdict <> 'rejected' then
    v_verdict := 'review';
    v_reason := 'This photo matches another listing.';
  end if;

  v_suggestions := case when pg_catalog.jsonb_typeof(p_result->'suggestions') = 'object'
                        then p_result->'suggestions' else '{}'::jsonb end
    || pg_catalog.jsonb_build_object(
         'quality', p_result->'quality',
         'item_key', p_result->'item_key',
         'duplicate', v_duplicate,
         'model', p_result->'model'
       );
  update public.listing_scans
    set status = 'done', verdict = v_verdict, reason = v_reason, suggestions = v_suggestions,
        photo_set_hash = p_photo_set_hash, error = null, finished_at = pg_catalog.now()
    where id = p_scan_id;

  if v_status = 'active' then
    v_current := p_photo_set_hash = app_private.photo_set_hash(v_listing);
    if not v_current then
      perform app_private.recheck_active_listing(v_listing);
    elsif v_verdict <> 'allowed' then
      perform app_private.vision_pause(v_listing, case
        when v_verdict = 'rejected' then 'Paused: ' || v_reason
        else 'Paused: the new photos need a check before this listing can go live again.'
      end);
    end if;
  end if;
  return pg_catalog.jsonb_build_object('verdict', v_verdict, 'duplicate', v_duplicate);
end;
$function$;

-- Any failure: the scan is failed, the verdict is review, and an active listing is paused while
-- vision_required is on (unsure is never allowed).
create or replace function public.vision_fail_scan(p_scan_id uuid, p_error text)
returns void
language plpgsql
set search_path = ''
as $function$
declare
  v_listing uuid;
begin
  update public.listing_scans
    set status = 'failed', verdict = 'review', finished_at = pg_catalog.now(),
        error = pg_catalog.left(coalesce(p_error, 'unknown'), 200),
        reason = 'We couldn''t check the photos right now. Try again later.'
    where id = p_scan_id and status in ('queued', 'running')
    returning listing_id into v_listing;
  if found then
    perform app_private.vision_pause(v_listing,
      'Paused: the new photos need a check before this listing can go live again.');
  end if;
end;
$function$;

-- 9. Publish gate, as in Step 8A, and: a client can't set auto_paused_reason, and a successful
-- republish (flag on or off) clears it.
create or replace function app_private.vision_publish_gate()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_scan record;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.auto_paused_reason := null;
  end if;
  if new.status <> 'active' or (tg_op = 'UPDATE' and old.status = 'active') then
    return new;
  end if;
  if coalesce((select s.enabled from public.app_settings s where s.key = 'vision_required'), false) then
    select ls.status, ls.verdict, ls.reason, ls.admin_decision, ls.photo_set_hash into v_scan
      from public.listing_scans ls
      where ls.listing_id = new.id
      order by ls.created_at desc
      limit 1;
    if not found then
      raise exception 'Check the photos before publishing this listing.' using errcode = 'P0001';
    end if;
    if v_scan.status in ('queued', 'running') then
      raise exception 'The photo check is still running. Try again in a minute.' using errcode = 'P0001';
    end if;
    if v_scan.photo_set_hash is distinct from app_private.photo_set_hash(new.id) then
      raise exception 'The photos changed after they were checked. Check them again before publishing.'
        using errcode = 'P0001';
    end if;
    if not (v_scan.admin_decision = 'approved' or (v_scan.admin_decision is null and v_scan.verdict = 'allowed')) then
      raise exception 'This listing can''t be published yet: %', v_scan.reason using errcode = 'P0001';
    end if;
  end if;
  new.auto_paused_reason := null;
  return new;
end;
$function$;

-- 10. Who can run what. request_scan keeps its grants (create or replace).
revoke execute on function app_private.vision_required() from public, anon, authenticated;
revoke execute on function app_private.queue_scan(uuid, uuid) from public, anon, authenticated;
revoke execute on function app_private.vision_pause(uuid, text) from public, anon, authenticated;
revoke execute on function app_private.recheck_active_listing(uuid) from public, anon, authenticated;
revoke execute on function app_private.rescan_on_photo_change() from public, anon, authenticated;
revoke execute on function public.vision_fail_scan(uuid, text) from public, anon, authenticated;
grant execute on function public.vision_fail_scan(uuid, text) to service_role;

notify pgrst, 'reload schema';
