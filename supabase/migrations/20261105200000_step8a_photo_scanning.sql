-- Step 8A: photo scanning (the database side of the vision service).
-- A lender asks for a check with request_scan. The database queues it and calls the
-- scan-listing Edge Function (pg_net, Vault shared secret, like send-push). scan-listing sends the
-- listing's public photo URLs to the vision service on Cloud Run and writes the result back
-- through the vision_* functions below, which only the server can call. While the
-- vision_required flag is off (it starts off), nothing is blocked.

create extension if not exists vector with schema extensions;

-- 1. Feature flags. Readable by everyone; only migrations change them.
create table public.app_settings (
  key text not null,
  enabled boolean default false not null,
  description text not null,
  updated_at timestamp with time zone default pg_catalog.now() not null,
  constraint app_settings_pkey primary key (key),
  constraint app_settings_key_format check (key ~ '^[a-z][a-z0-9_]{1,62}$')
);
insert into public.app_settings (key, enabled, description) values
  ('vision_required', false, 'A listing can be published only when its latest photo check covers its current photos and was allowed (or approved by an admin).'),
  ('verification_required', false, 'Lenders verify their ID once before listing (V2.0).'),
  ('payments_enabled', false, 'In-app payments. Off: renters and lenders arrange payment themselves.');

-- 2. The item policy as data: what can and can't be listed, and what isn't clothing at all.
-- The same rows as services/vision/app/policy.json (services/vision/tests/test_policy_sync.py
-- checks they match). Allowed rows map to the listing's own category, item type, garment type
-- and style values; the others carry the reason a lender is shown.
create table public.policy_item_types (
  key text not null,
  label text not null,
  kind text not null,
  allowed boolean not null,
  category text,
  item_type text,
  garment_type text,
  style text,
  policy_group text,
  noun text not null,
  looks_like text not null,
  reason text,
  prompts text[] not null,
  position integer not null,
  constraint policy_item_types_pkey primary key (key),
  constraint policy_item_types_key_format check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  constraint policy_item_types_kind_check check (kind in ('garment', 'accessory', 'other')),
  constraint policy_item_types_category_check check (category is null or category in (
    'Career & Professional', 'Occasion & Party', 'Cultural & Traditional', 'Everyday', 'Outerwear', 'Accessories')),
  constraint policy_item_types_item_type_check check (item_type is null or item_type in (
    'Sunglasses', 'Handbag', 'Tie', 'Watch (non-smart)', 'Belt buckle', 'Costume jewelry')),
  constraint policy_item_types_garment_type_check check (garment_type is null or garment_type in (
    'top', 'trousers', 'suit', 'dress', 'skirt', 'saree', 'one_size')),
  constraint policy_item_types_style_check check (style is null or style in (
    'South Asian', 'East Asian', 'Southeast Asian', 'Middle Eastern', 'African',
    'Mexican & Latin American', 'Country & Western', 'Western formal', 'Western casual')),
  constraint policy_item_types_prompts_check check (pg_catalog.cardinality(prompts) between 1 and 10),
  constraint policy_item_types_shape_check check (
    (allowed and kind <> 'other' and category is not null and garment_type is not null
       and reason is null and policy_group is null
       and (kind = 'accessory') = (item_type is not null))
    or (not allowed and category is null and item_type is null and garment_type is null and style is null
       and reason is not null and policy_group is not null)
  )
);
insert into public.policy_item_types
  (key, label, kind, allowed, category, item_type, garment_type, style, policy_group, noun, looks_like,
   reason, prompts, position)
select e.item->>'key', e.item->>'label', e.item->>'kind', (e.item->>'allowed')::boolean, e.item->>'category',
       e.item->>'item_type', e.item->>'garment_type', e.item->>'style', e.item->>'policy_group', e.item->>'noun',
       e.item->>'looks_like', e.item->>'reason',
       array(select pg_catalog.jsonb_array_elements_text(e.item->'prompts')), e.n::integer
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
{"key": "hoodie", "label": "Hoodie", "kind": "garment", "allowed": true, "category": "Everyday", "item_type": null, "garment_type": "top", "style": "Western casual", "policy_group": null, "noun": "hoodie", "looks_like": "a hoodie", "reason": null, "prompts": ["a hoodie", "a hooded sweatshirt", "a zip-up hoodie"]},
{"key": "sweatshirt", "label": "Sweatshirt", "kind": "garment", "allowed": true, "category": "Everyday", "item_type": null, "garment_type": "top", "style": "Western casual", "policy_group": null, "noun": "sweatshirt", "looks_like": "a sweatshirt", "reason": null, "prompts": ["a sweatshirt", "a crewneck sweatshirt", "a fleece pullover"]},
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
$policy$::jsonb) with ordinality as e(item, n);

-- 3. Scans. One listing_scans row per check; one photo_scans row per photo it scanned.
create table public.listing_scans (
  id uuid default pg_catalog.gen_random_uuid() not null,
  listing_id uuid not null,
  status text default 'queued' not null,
  verdict text,
  reason text,
  suggestions jsonb,
  photo_set_hash text,
  admin_decision text,
  error text,
  created_at timestamp with time zone default pg_catalog.now() not null,
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  admin_decided_at timestamp with time zone,
  constraint listing_scans_pkey primary key (id),
  constraint listing_scans_listing_id_fkey foreign key (listing_id)
    references public.listings(id) on delete cascade,
  constraint listing_scans_status_check check (status in ('queued', 'running', 'done', 'failed')),
  constraint listing_scans_verdict_check check (verdict is null or verdict in ('allowed', 'rejected', 'review')),
  constraint listing_scans_finished_has_verdict check (status in ('queued', 'running') or verdict is not null),
  constraint listing_scans_admin_decision_check check (admin_decision is null or admin_decision in ('approved', 'rejected')),
  constraint listing_scans_hash_format check (photo_set_hash is null or photo_set_hash ~ '^[0-9a-f]{64}$')
);
create index listing_scans_listing_created_idx on public.listing_scans using btree (listing_id, created_at desc);
-- One scan at a time per listing.
create unique index listing_scans_one_in_progress on public.listing_scans using btree (listing_id)
  where status in ('queued', 'running');

create table public.photo_scans (
  id uuid default pg_catalog.gen_random_uuid() not null,
  scan_id uuid not null,
  listing_id uuid not null,
  photo_id uuid not null,
  storage_path text not null,
  slot text,
  blur_score real,
  brightness_score real,
  framing_score real,
  worn_probability real,
  fingerprint extensions.vector(768) not null,
  labels jsonb not null,
  warnings text[] default '{}'::text[] not null,
  decision text not null,
  scanned_at timestamp with time zone default pg_catalog.now() not null,
  constraint photo_scans_pkey primary key (id),
  constraint photo_scans_scan_id_fkey foreign key (scan_id) references public.listing_scans(id) on delete cascade,
  constraint photo_scans_listing_id_fkey foreign key (listing_id) references public.listings(id) on delete cascade,
  constraint photo_scans_photo_id_fkey foreign key (photo_id) references public.listing_photos(id) on delete cascade,
  constraint photo_scans_decision_check check (decision in ('allowed', 'not_allowed', 'not_clothing', 'detail', 'unsure'))
);
create index photo_scans_scan_id_idx on public.photo_scans using btree (scan_id);
create index photo_scans_listing_id_idx on public.photo_scans using btree (listing_id);
create index photo_scans_photo_id_idx on public.photo_scans using btree (photo_id);

-- 4. Access. New tables get no Data API grants by default, so every grant is explicit.
alter table public.app_settings enable row level security;
alter table public.policy_item_types enable row level security;
alter table public.listing_scans enable row level security;
alter table public.photo_scans enable row level security;
revoke all on public.app_settings, public.policy_item_types, public.listing_scans, public.photo_scans
  from public, anon, authenticated, service_role;
-- Flags and policy: anyone can read, nobody can write through the API.
grant select on public.app_settings, public.policy_item_types to anon, authenticated, service_role;
create policy app_settings_read on public.app_settings for select to anon, authenticated using (true);
create policy policy_item_types_read on public.policy_item_types for select to anon, authenticated using (true);
-- Scans: the listing's owner reads them; only the server (the vision_* functions) writes them.
grant select on public.listing_scans, public.photo_scans to authenticated;
grant select, insert, update, delete on public.listing_scans, public.photo_scans to service_role;
create policy listing_scans_owner_read on public.listing_scans
  for select to authenticated
  using (exists (
    select 1 from public.listings l
    where l.id = listing_scans.listing_id and l.lender_id = (select auth.uid())
  ));
create policy photo_scans_owner_read on public.photo_scans
  for select to authenticated
  using (exists (
    select 1 from public.listings l
    where l.id = photo_scans.listing_id and l.lender_id = (select auth.uid())
  ));

-- 5. The photo set a scan covers: sha256 of the sorted "storage_path:slot" lines. scan-listing
-- computes the same hash over the photos it sent. Runs as the caller (RLS applies).
create or replace function app_private.photo_set_hash(p_listing_id uuid)
returns text
language sql
stable
set search_path = ''
as $function$
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce(
    pg_catalog.string_agg(p.storage_path || ':' || coalesce(p.slot, ''), E'\n'
      order by (p.storage_path || ':' || coalesce(p.slot, '')) collate "C"), ''), 'UTF8')), 'hex')
  from public.listing_photos p
  where p.listing_id = p_listing_id;
$function$;

-- 6. request_scan: the owner asks for a photo check. Queues it and calls scan-listing.
create or replace function public.request_scan(p_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_url text;
  v_secret text;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.listings l where l.id = p_listing_id and l.lender_id = v_uid) then
    raise exception 'Not your listing' using errcode = '42501';
  end if;
  -- Calls for one listing run one after another, so two can't both start a scan.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_listing_id::text, 8));
  if not exists (select 1 from public.listing_photos p where p.listing_id = p_listing_id) then
    raise exception 'Add a photo first' using errcode = '22023';
  end if;

  -- A scan that never finished (scan-listing stopped) stops blocking after 10 minutes.
  update public.listing_scans
    set status = 'failed', verdict = 'review', error = 'timed_out', finished_at = pg_catalog.now(),
        reason = 'The photo check didn''t finish. Try again.'
    where listing_id = p_listing_id and status in ('queued', 'running')
      and created_at < pg_catalog.now() - interval '10 minutes';
  -- One scan at a time: asking again while one is waiting or running returns that one.
  select s.id into v_id from public.listing_scans s
    where s.listing_id = p_listing_id and s.status in ('queued', 'running');
  if found then
    return v_id;
  end if;

  -- Cost guard: each lender gets at most 20 checks an hour.
  if (select pg_catalog.count(*) from public.listing_scans s
        join public.listings l on l.id = s.listing_id
        where l.lender_id = v_uid and s.created_at > pg_catalog.now() - interval '1 hour') >= 20 then
    raise exception 'Too many photo checks. Try again in an hour.' using errcode = 'P0001';
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

-- 7. Server-only steps of a scan, called by scan-listing with the secret key.

-- Marks a queued scan running and returns its listing's current photos, or null when the scan
-- isn't queued (already handled).
create or replace function public.vision_start_scan(p_scan_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_listing uuid;
begin
  update public.listing_scans s
    set status = 'running', started_at = pg_catalog.now()
    where s.id = p_scan_id and s.status = 'queued'
    returning s.listing_id into v_listing;
  if not found then
    return null;
  end if;
  return pg_catalog.jsonb_build_object(
    'scan_id', p_scan_id,
    'listing_id', v_listing,
    'photos', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'photo_id', p.id, 'storage_path', p.storage_path, 'slot', p.slot)
             order by p.position, p.id)
      from public.listing_photos p
      where p.listing_id = v_listing
    ), '[]'::jsonb)
  );
end;
$function$;

-- Saves the vision service's result. A photo nearly identical (cosine similarity 0.95 or more)
-- to a photo of another lender's listing sends the listing to review; a rejection stays a
-- rejection.
create or replace function public.vision_finish_scan(p_scan_id uuid, p_photo_set_hash text, p_result jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_listing uuid;
  v_lender uuid;
  v_verdict text := p_result->>'verdict';
  v_reason text := p_result->>'reason';
  v_suggestions jsonb;
  v_duplicate boolean;
begin
  select s.listing_id, l.lender_id into v_listing, v_lender
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
  return pg_catalog.jsonb_build_object('verdict', v_verdict, 'duplicate', v_duplicate);
end;
$function$;

-- Any failure: the scan is failed and the listing goes to review.
create or replace function public.vision_fail_scan(p_scan_id uuid, p_error text)
returns void
language sql
set search_path = ''
as $function$
  update public.listing_scans
    set status = 'failed', verdict = 'review', finished_at = pg_catalog.now(),
        error = pg_catalog.left(coalesce(p_error, 'unknown'), 200),
        reason = 'We couldn''t check the photos right now. Try again later.'
    where id = p_scan_id and status in ('queued', 'running');
$function$;

-- 8. Publish gate. With vision_required on, a listing becomes active only when its latest scan
-- covers its current photos and was allowed, or an admin approved it. Server jobs and migrations
-- aren't stopped, like the accessory declaration check. Runs as the caller.
create or replace function app_private.vision_publish_gate()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_scan record;
begin
  if new.status <> 'active' or (tg_op = 'UPDATE' and old.status = 'active')
     or current_user not in ('authenticated', 'anon')
     or not coalesce((select s.enabled from public.app_settings s where s.key = 'vision_required'), false) then
    return new;
  end if;
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
  if v_scan.admin_decision = 'approved' or (v_scan.admin_decision is null and v_scan.verdict = 'allowed') then
    return new;
  end if;
  raise exception 'This listing can''t be published yet: %', v_scan.reason using errcode = 'P0001';
end;
$function$;

create trigger listings_vision_publish_gate before insert or update of status on public.listings
  for each row execute function app_private.vision_publish_gate();

-- 9. Who can run what.
revoke execute on function public.request_scan(uuid) from public, anon, authenticated;
grant execute on function public.request_scan(uuid) to authenticated, service_role;
revoke execute on function public.vision_start_scan(uuid) from public, anon, authenticated;
grant execute on function public.vision_start_scan(uuid) to service_role;
revoke execute on function public.vision_finish_scan(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.vision_finish_scan(uuid, text, jsonb) to service_role;
revoke execute on function public.vision_fail_scan(uuid, text) from public, anon, authenticated;
grant execute on function public.vision_fail_scan(uuid, text) to service_role;
-- The gate runs as the owner, so they need the hash helper (app_private isn't exposed by the API).
revoke execute on function app_private.photo_set_hash(uuid) from public, anon;
grant execute on function app_private.photo_set_hash(uuid) to authenticated, service_role;
revoke execute on function app_private.vision_publish_gate() from public, anon, authenticated;

-- 10. Vault: where scan-listing lives and the shared secret, generated here (never in this file).
-- The same secret is set as the function's SCAN_LISTING_SECRET.
do $migration$
begin
  if not exists (select 1 from vault.secrets s where s.name = 'scan_listing_secret') then
    perform vault.create_secret(
      pg_catalog.encode(extensions.gen_random_bytes(32), 'hex'),
      'scan_listing_secret',
      'Proves to the scan-listing Edge Function that this database is calling'
    );
  end if;
  if not exists (select 1 from vault.secrets s where s.name = 'scan_listing_url') then
    perform vault.create_secret(
      'https://pwfzkyjeivadbtkfkdxr.supabase.co/functions/v1/scan-listing',
      'scan_listing_url',
      'Address of the scan-listing Edge Function'
    );
  end if;
end;
$migration$;

notify pgrst, 'reload schema';
