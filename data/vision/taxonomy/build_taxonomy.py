#!/usr/bin/env python3
"""
build_taxonomy.py (D1b; D1c added cuts A and B, needs_owner and vocabulary.json; D2 added the
instance-of drop, the generic-entry drop and the keep list; D2b the costume roots, the instance-of
exceptions and the drop list)
Turns taxonomy/raw/fetched.json (written by fetch_wikidata.py) into:
- taxonomy/taxonomy.json (every kept type, with its Wikidata fields)
- taxonomy/review.csv (the owner's review sheet; needs_owner = yes on the launch rows)
- taxonomy/excluded.json (every dropped type, with the reason and the root it came from)
- taxonomy/vocabulary.json (the scanner's extract: allowed and not-allowed types only)

Cut A: the exclusion roots with scope "clothing" (costume, uniform, mask, ...) drop only what the
clothing root brings in. Cut B: the clothing crawl never passes through "fashion accessory", so
accessories come from their own roots.

D2: an item that is an instance of a brand, trademark, product model, product line, fictional
object, fictional clothing or archaeological artefact (P31 or P31/P279*, with the classes resolved
in roots.json) is dropped, and so are the generic entries in specs.GENERIC_LEAF_LABELS. The keep
list (specs.KEEP_LIST) comes back past cut A only and gets needs_owner = yes.

D2b: the costume roots (costume, 2 levels; space suit, 1) list every type they reach as a costume
(Occasion & Party, garment type costume), and so does the clothing root for a type that is an
instance of costume (P31/P279*, as Wikidata files "Halloween costume"). A costume is allowed when
its own name or description gives a garment signal, and review when only its parent classes do;
the allowed ones get needs_owner = yes. A type the costume root reaches that is also under mask,
uniform, protective clothing or sportswear is dropped (the exclusion wins), and a subclass of
costume more than 2 levels below it isn't brought in by the clothing root either. The types in
specs.EXCLUDE_INSTANCE_OF_EXCEPTIONS are exempt from the instance-of drop; specs.DROP_LIST rows get
keep = no. D2c: a root in specs.ONLY_ITSELF_ROOTS (space suit) keeps only itself; the particular
suits below it are dropped, except a launch or keep-list type.

Classification is by the item itself: its English label, aliases, description and parent
labels decide category, garment type and allowed. Which root an item sits under is never
enough on its own; an item under a positive root with no clear signal is "review".

If the sheet would have more than MAX_ROWS or fewer than MIN_ROWS rows, nothing is written:
the script prints what dominated and exits with status 2.

--apply-review reads an owner-edited review.csv back into taxonomy.json and rewrites
vocabulary.json; a type the owner marks keep = no stays in taxonomy.json (marked) and leaves
vocabulary.json.
"""

import argparse
import csv
import io
import json
import logging
import re
import sys
from collections import Counter, defaultdict, deque
from pathlib import Path

import specs

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("build_taxonomy")

TAXONOMY_DIR = Path(__file__).resolve().parent
FETCHED_JSON = TAXONOMY_DIR / "raw" / "fetched.json"
TAXONOMY_JSON = TAXONOMY_DIR / "taxonomy.json"
REVIEW_CSV = TAXONOMY_DIR / "review.csv"
EXCLUDED_JSON = TAXONOMY_DIR / "excluded.json"
VOCABULARY_JSON = TAXONOMY_DIR / "vocabulary.json"

MIN_ROWS, MAX_ROWS = 200, 2000

# The database's own values (supabase/migrations/20261030232726_foundation_schema.sql), plus
# "not_applicable" (the policy's null category for a type that can't be listed) and "none_fits".
CATEGORIES = ["Career & Professional", "Occasion & Party", "Cultural & Traditional", "Everyday",
              "Outerwear", "Accessories", "not_applicable"]
# "costume" (D2b, owner policy) isn't a database value yet: listings_garment_type_check allows the
# first seven only.
GARMENT_TYPES = ["top", "trousers", "suit", "dress", "skirt", "saree", "one_size", "none_fits", "costume"]
ITEM_TYPES = ["Sunglasses", "Handbag", "Tie", "Watch (non-smart)", "Belt buckle", "Costume jewelry", "none_fits"]
ALLOWED = ["allowed", "not_allowed", "review"]
REGIONS = ["South Asian", "East Asian", "Southeast Asian", "Central Asian", "Middle Eastern", "African",
           "Latin American", "European", "North American", "Oceanian", "Global", "Unknown"]
CSV_COLUMNS = ["needs_owner", "keep", "priority", "english_name", "also_called", "region", "dzirent_category",
               "dzirent_garment_type", "allowed", "notes", "qid"]
KEEP_VALUES = ["", "yes", "no"]
# The sheet's five parts, in order: launch types, then the keep list, then the allowed costumes
# (D2b; these three needs_owner = yes), then the types the build left for review, then the rest
# by category. Set by the build; the owner's edits don't move a row.
SHEET_GROUPS = ["launch", "keep", "costume", "review", "other"]
NEEDS_OWNER_GROUPS = ("launch", "keep", "costume")
COSTUME_CLASS = {"category": "Occasion & Party", "garment_type": "costume", "item_type": None, "allowed": "allowed"}
VOCABULARY_FIELDS = ["qid", "english_name", "vocabulary", "dzirent_category", "dzirent_item_type",
                     "dzirent_garment_type", "allowed", "region"]

# ---------------------------------------------------------------------------------------------
# Region words: country names, demonyms and culture names. Used to read a country or culture
# label, a parent class's label, or (last) the item's own text. Longer phrases win, so
# "latin american" is never read as "american". Phrases mapped to None are read and ignored.
# ---------------------------------------------------------------------------------------------
REGION_WORDS = {
    "South Asian": "india indian pakistan pakistani bangladesh bangladeshi bengal bengali sri lanka sri lankan "
                   "sinhalese nepal nepali nepalese bhutan bhutanese maldives maldivian afghanistan afghan pashtun "
                   "punjabi tamil telugu kannada malayali gujarati marathi sindhi kashmiri rajasthani mughal "
                   "hindu sikh|indian subcontinent|south asia|south asian",
    "East Asian": "china chinese manchu manchurian japan japanese korea korean joseon taiwan taiwanese mongolia "
                  "mongolian mongol tibet tibetan ainu ryukyu ryukyuan okinawan hanfu|hong kong|east asia|east asian",
    "Southeast Asian": "vietnam vietnamese thailand thai indonesia indonesian javanese balinese sundanese malay "
                       "malaysia malaysian philippines filipino tagalog visayan myanmar burmese cambodia cambodian "
                       "khmer laos lao laotian brunei timor timorese singapore singaporean|southeast asia|"
                       "southeast asian|south-east asia",
    "Central Asian": "kazakh kazakhstan kyrgyz kyrgyzstan uzbek uzbekistan tajik tajikistan turkmen turkmenistan "
                     "turkic|central asia|central asian",
    "Middle Eastern": "arab arabia arabian arabic saudi iran iranian persia persian iraq iraqi turkey turkish "
                      "ottoman syria syrian jordan jordanian lebanon lebanese israel israeli palestine palestinian "
                      "yemen yemeni oman omani kuwait kuwaiti qatar qatari bahrain bahraini emirati kurd kurdish "
                      "kurdistan bedouin levant levantine assyrian|united arab emirates|middle east|middle eastern",
    "African": "africa african nigeria nigerian yoruba igbo hausa ghana ghanaian ashanti asante akan kenya kenyan "
               "maasai masai swahili ethiopia ethiopian eritrea eritrean somalia somali sudan sudanese egypt "
               "egyptian morocco moroccan algeria algerian tunisia tunisian libya libyan berber amazigh tuareg "
               "senegal senegalese wolof mali malian guinea ivorian cameroon cameroonian congo congolese zulu "
               "xhosa zimbabwe zimbabwean zambia zambian tanzania tanzanian uganda ugandan rwanda rwandan "
               "madagascar malagasy mozambique angola angolan namibia namibian botswana herero benin togo "
               "togolese mauritania mauritanian maghreb|south africa|south african|west africa|west african|"
               "east africa|east african|north africa|north african|côte d'ivoire|burkina faso",
    "Latin American": "mexico mexican maya mayan aztec guatemala guatemalan peru peruvian inca andean quechua "
                      "aymara bolivia bolivian ecuador ecuadorian colombia colombian venezuela venezuelan chile "
                      "chilean argentina argentine argentinian brazil brazilian uruguay uruguayan paraguay "
                      "paraguayan panama panamanian cuba cuban dominican honduras honduran nicaragua nicaraguan "
                      "salvadoran haiti haitian jamaica jamaican caribbean gaucho mapuche|puerto rico|puerto rican|"
                      "costa rica|costa rican|el salvador|latin america|latin american|south america|"
                      "south american|central america|central american|west indies|west indian|trinidad and tobago",
    "European": "europe european britain british england english scotland scottish scots wales welsh ireland irish "
                "france french germany german bavarian austria austrian switzerland swiss italy italian spain "
                "spanish portugal portuguese greece greek netherlands dutch belgium belgian denmark danish norway "
                "norwegian sweden swedish finland finnish iceland icelandic sami poland polish czech slovakia "
                "slovak hungary hungarian romania romanian bulgaria bulgarian serbia serbian croatia croatian "
                "bosnia bosnian slovenia slovenian montenegro albania albanian macedonia macedonian ukraine "
                "ukrainian belarus belarusian russia russian lithuania lithuanian latvia latvian estonia "
                "estonian armenia armenian azerbaijan celtic viking norse roman byzantine victorian edwardian "
                "elizabethan tudor basque|ancient rome|ancient greece|united kingdom|soviet union",
    "North American": "american usa canada canadian inuit cherokee navajo lakota cowboy|united states|"
                      "united states of america|native american|american indian|first nations|north america|"
                      "north american|western wear|african american",
    "Oceanian": "australia australian maori polynesia polynesian hawaii hawaiian samoa samoan tonga tongan fiji "
                "fijian papua melanesia melanesian micronesia micronesian tahiti tahitian oceania oceanian|"
                "new zealand|aboriginal australian|pacific islands",
    None: "roman catholic|catholic|french cuff|english wikipedia",
}


def _region_regex() -> tuple[re.Pattern, dict]:
    lookup = {}
    for region, words in REGION_WORDS.items():
        parts = words.split("|")
        phrases = parts[0].split() + parts[1:] if " " in parts[0] or len(parts) > 1 else parts[0].split()
        for p in phrases:
            if p.strip():
                lookup[p.strip()] = region
    alternation = "|".join(re.escape(p) for p in sorted(lookup, key=len, reverse=True))
    return re.compile(rf"(?<![\w-])({alternation})(?![\w-])"), lookup


REGION_RE, REGION_LOOKUP = _region_regex()


def region_from_text(text: str) -> str | None:
    for m in REGION_RE.finditer(text.lower()):
        region = REGION_LOOKUP[m.group(1)]
        if region:
            return region
    return None


# ---------------------------------------------------------------------------------------------
# Item signals. A pattern is tried against the end of a name (an English compound's head is its
# last word: "dress shirt" is a shirt, "shirt dress" a dress), then against the head phrase of the
# description, then against parent labels.
# Each family: (key, pattern, category, garment_type, item_type, allowed, note).
# ---------------------------------------------------------------------------------------------
NOT_ALLOWED_NOTE = "Not allowed: {rule}."
FAMILIES = [
    # Types the rules ban (policy groups in policy.json).
    ("smartwatch", r"smart ?watch(es)?|fitness trackers?|activity trackers?", "not_applicable", "one_size", "none_fits", "not_allowed", "smartwatches"),
    ("tshirt", r"t-?shirts?|tees?|tank tops?|singlets?|sleeveless shirts?|muscle shirts?", "not_applicable", "top", None, "not_allowed", "T-shirts and tank tops"),
    ("sport_top", r"(sports?|team|football|soccer|basketball|hockey|cycling|baseball|rugby) (jerseys?|shirts?|tops?)|jerseys?", "not_applicable", "top", None, "not_allowed", "T-shirts and tank tops"),
    ("trackpants", r"track ?pants|tracksuit (bottoms|trousers)|sweat ?pants|joggers?|jogging (pants|bottoms)|tracksuits?|sweatsuits?|jogging suits?", "not_applicable", "trousers", None, "not_allowed", "track pants, sweatpants and joggers"),
    ("shorts", r"shorts|hot pants", "not_applicable", "trousers", None, "not_allowed", "shorts"),
    ("jeans", r"jeans|denim (trousers|pants)", "not_applicable", "trousers", None, "not_allowed", "jeans"),
    ("hoodie", r"hood(ie|y)s?|hooded sweatshirts?|sweatshirts?", "not_applicable", "top", None, "not_allowed", "hoodies and sweatshirts"),
    ("shoes", r"shoes?|boots?|booties|sneakers?|trainers|sandals?|slippers?|loafers?|heels|pumps|clogs?|moccasins?|mules|flip-flops?|footwear|espadrilles?|brogues?|oxfords|stilettos?|galoshes|overshoes|chappals?|juttis?|mojaris?|khussas?|babouches?", "not_applicable", "none_fits", None, "not_allowed", "shoes"),
    ("socks", r"socks?|tabi", "not_applicable", "none_fits", None, "not_allowed", "socks"),
    ("pantyhose", r"pantyhose|tights|stockings?|hosiery|nylons", "not_applicable", "none_fits", None, "not_allowed", "pantyhose"),
    ("hats", r"hats?|caps?|berets?|beanies?|fedoras?|bonnets?|helmets?|headgear|headwear|headdress(es)?|bowlers?|trilbys?|sombreros?|turbans?|fez|tuques?|visors?|kippahs?|yarmulkes?|skullcaps?|toques?|hoods", "not_applicable", "none_fits", None, "not_allowed", "hats and caps"),
    ("swimwear", r"swim ?(suits?|wear|trunks|dress(es)?|shorts|briefs|costumes?)|bathing (suits?|costumes?|dress(es)?)|bikinis?|monokinis?|tankinis?|burkinis?|wetsuits?|rash guards?|swimming (costumes?|trunks)", "not_applicable", "none_fits", None, "not_allowed", "swimwear"),
    ("lingerie", r"lingerie|negligees?|babydolls?|teddy|chemises?|garter belts?|suspender belts?|bustiers?|basques?|camisoles?|bodystockings?|peignoirs?", "not_applicable", "none_fits", None, "not_allowed", "lingerie"),
    ("underwear", r"underwear|undergarments?|underclothes|bras?|brassieres?|pant(y|ies)|knickers|briefs|thongs?|g-strings?|boxers?|underpants|corsets?|girdles?|undershirts?|petticoats?|slips?|underskirts?|loincloths?|fundoshi|long johns|union suits?|drawers|bloomers|diapers?|nappies|nappy|crinolines?|bustles?|hoop skirts?|farthingales?|panniers?|jockstraps?", "not_applicable", "none_fits", None, "not_allowed", "underwear"),
    # Accessories. Specific kinds first, so "hair tie" isn't a tie and "nose ring" isn't a ring.
    ("hair_accessory", r"hair ?(clips?|pins?|bands?|ties?|combs?|slides?|nets?|sticks?|accessor(y|ies)|ornaments?|jewel(le)?ry)|hairpins?|headbands?|scrunchies?|barrettes?|kanzashi", "Accessories", "one_size", "none_fits", "review", "Hair accessory; no item type in the database."),
    ("special_jewellery", r"toe rings?|nose rings?|nose studs?|lip rings?|navel rings?|belly rings?|body piercings?|piercing jewel(le)?ry|cufflinks?|cuff links?|tie (clips?|pins?|bars?|tacks?)|arm rings?|armlets?|anklets?|tiaras?|diadems?|circlets?|crowns?|maang tikkas?|tikkas?", "Accessories", "one_size", "none_fits", "review", "Jewellery that isn't one of the five allowed kinds (necklace, earrings, bracelet, ring, brooch)."),
    ("watch", r"(wrist|pocket|dress|dive|diving|field|pilot|aviator|mechanical|quartz|automatic|analog|analogue|skeleton|digital)? ?watch(es)?|chronographs?|chronometers?", "Accessories", "one_size", "Watch (non-smart)", "allowed", ""),
    ("sunglasses", r"sun ?glasses|aviators", "Accessories", "one_size", "Sunglasses", "allowed", ""),
    ("tie", r"neck ?ties?|bow ties?|cravats?|ascots?|ascot ties?|bolo ties?|string ties?|bootlace ties?|kipper ties?|skinny ties?|ties?", "Accessories", "one_size", "Tie", "allowed", ""),
    ("handbag", r"handbags?|purses?|clutch(es| bags?)?|minaudi[eè]res?|pochettes?|tote bags?|totes?|satchels?|shoulder bags?|cross-?body bags?|evening bags?|potlis?|potli bags?|hobo bags?|bucket bags?|wristlets?|reticules?|bags?", "Accessories", "one_size", "Handbag", "allowed", ""),
    ("belt_buckle", r"(belt )?buckles?", "Accessories", "one_size", "Belt buckle", "allowed", ""),
    ("jewellery", r"necklaces?|pendants?|chokers?|lockets?|earrings?|ear ?rings?|bracelets?|bangles?|rings?|brooch(es)?|lapel pins?", "Accessories", "one_size", "Costume jewelry", "allowed", ""),
    ("belt", r"belts?|sashes|sash|cummerbunds?|obi|waistbands?|baldrics?", "Accessories", "one_size", "none_fits", "review", "Belt or sash; the database allows only belt buckles."),
    ("other_jewellery", r"jewel(le)?ry|jewels?|amulets?|talismans?|charms?|beads?|torcs?|torques?|chains?|medallions?|pins?|gorgets?", "Accessories", "one_size", "none_fits", "review", "Jewellery that isn't one of the five allowed kinds (necklace, earrings, bracelet, ring, brooch)."),
    ("scarf", r"scar(f|ves)|shawls?|stoles?|pashminas?|mufflers?|bandanas?|neckerchiefs?|snoods?|keffiyehs?|shemaghs?|rebozos?|mantillas?|veils?|headscarf|headscarves|wraps?|dupattas?|odhnis?|chunnis?", "Accessories", "one_size", "none_fits", "review", "Scarf or shawl; no item type in the database."),
    ("other_accessory", r"gloves?|mittens?|gauntlets?|fans?|umbrellas?|parasols?|masks?|wallets?|card holders?|key ?(chains?|rings?)|badges?|buttons?|suspenders|braces|garters?|handkerchiefs?|pocket squares?|collars?|ruffs?|jabots?|cuffs?|spectacles|eyeglasses|glasses|goggles|monocles?|lorgnettes?|walking sticks?|canes?|combs?|backpacks?|rucksacks?|briefcases?|luggage|pouches?|sporrans?|lanyards?|boutonni[eè]res?|corsages?|leis?|garlands?|wigs?|earmuffs?|epaulettes?|aiguillettes?|armbands?|patches", "Accessories", "one_size", "none_fits", "review", "Accessory that isn't in Dzirent's allowed list."),
    # Garments a person has to look at: work, sport, religious, ceremonial, costume, sleepwear.
    ("protective", r"space ?suits?|diving suits?|dry ?suits?|pressure suits?|flight suits?|g-suits?|hazmat suits?|boiler ?suits?|coveralls?|overalls?|dungarees|aprons?|lab coats?|scrubs|smocks?|life (jackets?|vests?)|high-visibility (vests?|jackets?|clothing)|hi-vis|protective (clothing|suits?|garments?|gear)|straitjackets?|ghillie suits?|survival suits?|immersion suits?|snow ?suits?|ski suits?|catsuits?|bodysuits?|unitards?|leotards?|leggings|onesies?|rompers?|playsuits?|hospital gowns?|surgical gowns?|patient gowns?|bulletproof vests?|stab vests?|wet ?suits?|fencing jackets?", "Everyday", "none_fits", None, "review", "Work, protective, sport or one-piece wear; not a type Dzirent lists as it is."),
    ("uniform", r"uniforms?|liveries|livery|regalia", "Everyday", "none_fits", None, "review", "Uniform."),
    ("costume", r"costumes?|fancy dress|disguises?", "Everyday", "none_fits", None, "review", "Costume."),
    ("religious", r"vestments?|cassocks?|chasubles?|albs?|surplices?|habits?|copes?|dalmatics?|mitres?|cinctures?|scapulars?|tallit(ot)?|tallits?|prayer shawls?|kittels?|ihram|soutanes?|rochets?|mozzettas?|amices?|maniples?|pallia|pallium|tunicles?|cottas?", "Everyday", "none_fits", None, "review", "Religious dress."),
    ("academic", r"academic (dress|gowns?|robes?|hoods?|regalia)|graduation gowns?|judicial (robes?|dress)|court dress|legal dress|barristers?'? gowns?", "Everyday", "none_fits", None, "review", "Academic, judicial or court dress."),
    ("sleepwear", r"pajamas|pyjamas|nightgowns?|nightdress(es)?|nightshirts?|night ?wear|nightclothes|sleepwear|bathrobes?|dressing gowns?|housecoats?|loungewear|bed jackets?|robes? de chambre|nightcaps?", "Everyday", "none_fits", None, "review", "Sleepwear or loungewear."),
    # Allowed garments.
    ("tuxedo", r"tuxedos?|dinner (jackets?|suits?)|tail ?coats?|tails|morning (coats?|dress|suits?)|white tie|black tie|smoking jackets?|frock coats?|evening (suits?|tailcoats?)|mess jackets?", "Occasion & Party", "suit", None, "allowed", ""),
    ("suit", r"suits?|blazers?|sport ?(coats?|jackets?)|waistcoats?|suit vests?|pantsuits?|trouser suits?|skirt suits?|tailleurs?", "Career & Professional", "suit", None, "allowed", ""),
    ("vest", r"vests?|gilets?", "Everyday", "top", None, "review", "Vest: a waistcoat in American use, an undershirt in British use; check."),
    ("jumpsuit", r"jumpsuits?|one-piece suits?", "Occasion & Party", "dress", None, "allowed", ""),
    ("occasion_dress", r"(evening|ball|cocktail|prom|party|gala|wedding|bridal|bridesmaids?'?|bridesmaid's|formal|slip|sequin(ned)?|mermaid|debutante|débutante|quincea[nñ]era|maxi|princess|tea-length)( dress(es)?| gowns?)|gowns?|robes? de style", "Occasion & Party", "dress", None, "allowed", ""),
    ("work_dress", r"(sheath|shirt|wrap|work|office|business|pencil) dress(es)?|shirtdress(es)?|shirtwaist(er)?s?", "Career & Professional", "dress", None, "allowed", ""),
    ("dress", r"dress(es)?|frocks?|sundress(es)?|pinafores?|shifts?|kaftans?|caftans?|muumuus?", "Everyday", "dress", None, "allowed", ""),
    ("robe", r"robes?", "Everyday", "dress", None, "review", "Robe; check whether it's a garment Dzirent lists."),
    ("skirt", r"skirts?|miniskirts?|kilts?|sarongs?|lungis?|tutus?", "Everyday", "skirt", None, "allowed", ""),
    ("dress_shirt", r"dress shirts?|formal shirts?|tuxedo shirts?|wing ?collar shirts?|oxford shirts?", "Career & Professional", "top", None, "allowed", ""),
    ("trousers", r"trousers|slacks|chinos|pants|culottes|palazzos?|breeches|jodhpurs|knickerbockers|capris?|pantaloons|harem pants|cargo pants|flares|bell-bottoms|plus fours|trews", "Career & Professional", "trousers", None, "allowed", ""),
    ("outerwear", r"coats?|overcoats?|jackets?|parkas?|anoraks?|windbreakers?|windcheaters?|raincoats?|mackintosh(es)?|trench ?coats?|pea ?coats?|duffel coats?|duffle coats?|capes?|cloaks?|ponchos?|blousons?|bombers?|puffers?|cagoules?|greatcoats?|ulsters?|topcoats?|mantles?|pelisses?|dusters?|spencers?|boleros?|shrugs?|capelets?|redingotes?|burnouses?|burnous|kagools?", "Outerwear", "top", None, "allowed", ""),
    ("basic_top", r"crop tops?|tube tops?|halter tops?|bandeaus?", "Everyday", "top", None, "review", "Close to the everyday basics Dzirent doesn't list; check."),
    ("top", r"blouses?|shirts?|sweaters?|jumpers?|pullovers?|cardigans?|tunics?|turtlenecks?|polo ?necks?|twinsets?|tops?|bodices?|chemisettes?|guernseys?|ganseys?|knitwear|camisas?", "Everyday", "top", None, "allowed", ""),
]
FAMILY_BY_KEY = {f[0]: f for f in FAMILIES}
FAMILY_RES = [(f, re.compile(rf"(?:^|[\s(/-])(?:{f[1]})$")) for f in FAMILIES]
GENERIC_FAMILIES = {f[0] for f in FAMILIES} - {"protective", "uniform", "costume", "religious", "academic"}

# Cultural garments, named (no generic head word to go by), with the policy's garment type
# where policy.json has the garment. Read at the end of a name, so "sari blouse" is a blouse.
CULTURAL_NAMES = [
    (r"saris?|sarees?|lehengas?|lehnga|ghagras?|lehenga cholis?|ghagra cholis?|half sarees?|langa voni|mekhela chador|mundum neriyathum", "saree"),
    (r"sherwanis?|achkans?|bandhgalas?|jodhpuri suits?|angarkhas?|jamas?", "suit"),
    (r"salwar kameez|shalwar kameez|anarkalis?|anarkali suits?|ghararas?|shararas?|abayas?|jilbabs?|chadors?|burqas?|niqabs?"
     r"|kaftans?|caftans?|djellabas?|jellabiyas?|galabiyas?|jalabiyas?|thobes?|thawbs?|dishdashas?|kanduras?|kimonos?"
     r"|yukatas?|furisodes?|tomesodes?|uchikakes?|hanboks?|qipaos?|cheongsams?|hanfu|ao dais?|áo dàis?|baju kurung|baju kebaya"
     r"|boubous?|bubus?|agbadas?|dirndls?|sarafans?|bunads?|deels?|kanzus?|kitenges?|kangas?|khangas?|kentes?"
     r"|chitons?|peplos|peploses?|himations?|togas?|stolas?|chima jeogori|china poblana|polleras?"
     r"|trajes?|sampots?|chut thai|pha sins?|barong tagalogs?|baro't saya|ternos?|malongs?|kebayas?", "dress"),
    (r"kurtas?|kurtis?|cholis?|dashikis?|huipils?|guayaberas?|barongs?|haoris?|happis?|jeogoris?|changshan|"
     r"mandarin jackets?|nehru jackets?|kameez|chapans?|chokhas?|chokas?|kaftan tops?|"
     r"pareos?|lavalavas?|tapa cloth", "top"),
    (r"dhotis?|veshtis?|mundus?|hakamas?|salwars?|shalwars?|churidars?|sirwals?|pyjama trousers", "trousers"),
    (r"pagnes?|wrappers?", "skirt"),
]
CULTURAL_END = [(re.compile(rf"(?:^|[\s(/-])(?:{p})$"), g) for p, g in CULTURAL_NAMES]
CULTURAL_ANY = re.compile("(?<![\\w-])(?:" + "|".join(p for p, _ in CULTURAL_NAMES) + ")(?![\\w-])")
CULTURAL_WORDS = re.compile(r"(?<![\w-])(traditional|folk|national (costume|dress)|ethnic|indigenous|tribal|"
                            r"native|islamic|muslim|jewish|hindu|buddhist|sikh)(?![\w-])")
HISTORICAL_WORDS = re.compile(r"(?<![\w-])(ancient|historical|historic|medieval|mediaeval|renaissance|baroque|"
                              r"\d{1,2}(st|nd|rd|th)[- ]centur(y|ies)|antiquity|byzantine|victorian|edwardian|"
                              r"elizabethan|tudor|regency|bronze age|iron age|neolithic|prehistoric)(?![\w-])")

# A garment name can be plain ("suit", "jacket") while its description says it's for one purpose
# only: then it's for review, not allowed.
SPECIAL_USE = re.compile(r"(?<![\w-])(firefight\w*|protective|military|army|naval|navy|soldiers?|police|uniforms?|"
                         r"livery|costumes?|theatrical|theatre|stage|ballet|ballerinas?|dancers?|liturgical|clergy|"
                         r"clerical|priests?|monks?|nuns?|bishops?|popes?|cardinals?|vestments?|religious|church|"
                         r"denomination|academic|professors?|graduat\w+|judicial|judges?|court dress|mourning|"
                         r"funeral|burial|baptism\w*|christening|children'?s?|child's|boys'?|girls'?|boy's|girl's|"
                         r"infants?|bab(y|ies)|toddlers?|space ?suits?|spacecraft|astronauts?|diving|divers?|chefs?|"
                         r"nurses?|medical|surgical|hospital|prisoners?|athletic|sportswear|riding|equestrian|"
                         r"hunting|hunters?|fencing|skiing|motorcycl\w+|emperors?|royalty|imperial|knighthood|"
                         r"coronation|regalia|bullfight\w*|matadors?|workers?|workwear)(?![\w-])")
LABEL_WORDS_RE = re.compile(r"(?<![\w-])(" + "|".join(
    re.escape(w.split(" ", 1)[0]) + "s?" + (r"\s+" + re.escape(w.split(" ", 1)[1]) if " " in w else "")
    for w in specs.EXCLUDE_LABEL_WORDS) + r")(?![\w-])")
LABEL_PATTERN_RE = re.compile(r"(?<![\w-])" + specs.EXCLUDE_LABEL_PATTERN + r"(?![\w-])")

DESC_LEAD = re.compile(r"^(an?|the|any|one)\s+")
DESC_KIND = re.compile(r"^(\w+\s+)?(type|kind|style|form|variety|piece|item|article|sort|class|category|part|element)s?\s+of\s+(an?\s+|the\s+)?")
DESC_CUT = re.compile(r"\s(worn|with|that|which|made|used|for|from|in|of|by|consisting|comprising|covering|"
                      r"designed|typically|usually|often|traditionally|similar|resembling|having|where|when|"
                      r"originating|popular|associated|or|and)\s|[;:(]")


def clean_name(text: str) -> str:
    text = re.sub(r"\s*\([^)]*\)", "", text or "")
    return re.sub(r"\s+", " ", text.replace("’", "'")).strip().lower()


def desc_head(desc: str) -> str:
    """The head phrase of a description: "a knee length jacket worn by ..." -> "knee length jacket"."""
    d = DESC_LEAD.sub("", clean_name(desc))
    d = DESC_LEAD.sub("", DESC_KIND.sub("", d))
    m = DESC_CUT.search(" " + d + " ")
    return (d[:max(0, m.start() - 1)] if m else d).strip(" ,.")


def family_at_end(text: str):
    for fam, rx in FAMILY_RES:
        if rx.search(" " + text):
            return fam
    return None


def bare_generic(label: str) -> bool:
    """True for a label that is only a garment word: "jacket", "skirts", "clothing"."""
    n = clean_name(label)
    return n in {"clothing", "garment", "garments", "outerwear", "apparel", "fashion accessory"} or any(
        re.fullmatch(f[1], n) for f in FAMILIES)


def cultural_at_end(text: str) -> str | None:
    for rx, garment in CULTURAL_END:
        if rx.search(" " + text):
            return garment
    return None


def classify(item: dict) -> dict:
    """Category, garment type, item type, allowed and a note, from the item's own text: its names
    (label, then aliases) read at their head word, then the head phrase of its description, then
    its parent classes' labels."""
    names = [n for n in [clean_name(item["label"])] + [clean_name(a) for a in item["aliases"]] if n]
    desc = clean_name(item["description"])
    head = desc_head(item["description"])
    parents = [clean_name(p) for p in item["parent_labels"] if p]
    own_text = " | ".join(names + [desc])
    cultural = bool(CULTURAL_WORDS.search(own_text) or CULTURAL_ANY.search(own_text)) or any(
        CULTURAL_WORDS.search(p) or (region_from_text(p) and re.search(r"cloth|costume|dress|garment|wear", p))
        for p in parents)
    historical = bool(HISTORICAL_WORDS.search(own_text)) or any(HISTORICAL_WORDS.search(p) for p in parents)

    fam = culture = None
    source = ""
    for texts, src in ((names, "name"), ([head] if head else [], "description"), (parents, "parent")):
        for t in texts:
            culture = cultural_at_end(t) if src != "parent" else None
            fam = None if culture else family_at_end(t)
            if culture or fam:
                source = src
                break
        if culture or fam:
            break
    base = {"cultural": cultural or bool(culture), "historical": historical, "signal": source}

    if culture:
        special = SPECIAL_USE.search(desc)
        ok = source == "name" and not historical and not special
        return {**base, "family": "cultural", "category": "Cultural & Traditional", "garment_type": culture,
                "item_type": None, "allowed": "allowed" if ok else "review",
                "notes": "" if ok else ("Historical garment; check that it can be listed today." if historical
                                        else f"Traditional, made for one purpose ('{special.group(0)}'); check."
                                        if special else "Traditional garment named in its description; check.")}
    if not fam:
        return {**base, "family": None, "category": "Everyday", "garment_type": "none_fits", "item_type": None,
                "allowed": "review", "notes": "No clear garment signal in its name, description or parents."}

    key, _, category, garment, item_type, allowed, note = fam
    if allowed == "not_allowed":
        if cultural and source in ("name", "description") and key not in ("shoes", "socks", "pantyhose", "smartwatch"):
            # A traditional garment that looks like a banned kind (leather shorts, a ceremonial
            # headdress): a person decides.
            return {**base, "family": key, "category": "Cultural & Traditional", "garment_type": garment,
                    "item_type": item_type, "allowed": "review",
                    "notes": f"Traditional, but looks like a banned kind ({note}); check."}
        return {**base, "family": key, "category": category, "garment_type": garment, "item_type": item_type,
                "allowed": allowed, "notes": NOT_ALLOWED_NOTE.format(rule=note)}
    if allowed == "allowed":
        special = SPECIAL_USE.search(desc) or SPECIAL_USE.search(names[0] if names else "")
        if source == "parent":
            allowed, note = "review", "Type taken from its parent class only; check."
        elif historical:
            allowed, note = "review", "Historical garment; check that it can be listed today."
        elif special:
            allowed, note = "review", f"Made for one purpose ('{special.group(0)}'); check."
        if key == "jewellery" and not item["under_jewellery"]:
            allowed, note = "review", "Named like jewellery but not under jewellery in Wikidata; check."
        if key == "handbag" and not item["under_handbag"]:
            allowed, item_type, note = "review", "none_fits", "A bag, but not under handbag in Wikidata; check."
    if cultural and category not in ("Accessories",):
        category = "Cultural & Traditional"
    return {**base, "family": key, "category": category, "garment_type": garment, "item_type": item_type,
            "allowed": allowed, "notes": note}


def is_latin_text(text: str) -> bool:
    cleaned = re.sub(r"[0-9\s\-_.,'\"()/’]+", "", text or "")
    return bool(cleaned) and all(ord(c) < 0x0250 for c in cleaned)


# ---------------------------------------------------------------------------------------------


def load_fetched() -> dict:
    if not FETCHED_JSON.exists():
        sys.exit(f"{FETCHED_JSON} is missing: run taxonomy/fetch_wikidata.py first.")
    return json.loads(FETCHED_JSON.read_text(encoding="utf-8"))


def excluded_instance_of(p31: list[str], ancestors: dict[str, str], instance_qids) -> list[str]:
    """The excluded classes (D2: brand, trademark, product model, ...) an item is an instance of:
    a P31 value, or an ancestor reached through P31 (P31/P279*). Never "subclass of": Wikidata
    files a few real types ("dress fastener") as subclasses of "archaeological artefact"."""
    hits = {a for a, via in ancestors.items() if a in instance_qids and via == "P31"}
    hits |= {c for c in p31 if c in instance_qids}
    return sorted(hits, key=lambda q: int(q[1:]))


def bfs_paths(crawl: dict, skip: set[str] = frozenset()) -> dict[str, list[str]]:
    """Shortest subclass-of path from the root to each crawled class (root first), within the
    crawl's hop limit and never through a class in `skip`."""
    children = defaultdict(list)
    for child, parent in crawl["edges"]:
        children[parent].append(child)
    root = crawl["root"]
    path = {root: [root]}
    queue = deque([root])
    while queue:
        node = queue.popleft()
        if len(path[node]) - 1 >= crawl["hops"]:
            continue
        for child in sorted(children[node], key=lambda q: int(q[1:])):
            if child not in path and child not in skip:
                path[child] = path[node] + [child]
                queue.append(child)
    return path


def build_taxonomy() -> int:
    f = load_fetched()
    roots, crawls, entities, ancestors, labels = f["roots"], f["crawls"], f["entities"], f["ancestors"], f["labels"]
    country_types = f["country_types"]
    country_classes = {r["qid"] for r in roots["country_classes"]}
    exclude_qids = {r["qid"]: r["key"] for r in roots["exclude"]}
    instance_qids = {r["qid"]: r["key"] for r in roots["instance_of"]}  # D2
    keep_list = {k["qid"] for k in roots["keep"]}  # D2
    exceptions = {k["qid"] for k in roots["instance_of_exceptions"]}  # D2b
    drop_list = {k["qid"] for k in roots["drop"]}  # D2b
    costume_keys = [r["key"] for r in roots["positive"] if r.get("costume")]  # D2b
    costume_qids = {r["qid"] for r in roots["positive"] if r.get("costume")}
    costume_root_qid = next(r["qid"] for r in roots["positive"] if r["key"] == "costume")
    wins_qids = {r["qid"] for r in roots["exclude"] if r["key"] in specs.COSTUME_EXCLUSION_WINS}
    only_itself = {r["qid"] for r in roots["positive"] if r["key"] in specs.ONLY_ITSELF_ROOTS}  # D2c
    generic_labels = {g.casefold() for g in specs.GENERIC_LEAF_LABELS}  # D2
    clothing_scope = {r["qid"] for r in roots["exclude"] if r.get("scope") == "clothing"}  # cut A
    skip_qids = {r["qid"] for r in roots.get("skip", [])}  # cut B
    banned_by_qid = {r["qid"]: r for r in roots["banned"]}
    positive_by_key = {r["key"]: r for r in roots["positive"]}
    launch = {l["qid"]: {**specs.LAUNCH_BY_QID[l["qid"]], **l} for l in roots["launch"]}
    jewellery_qid = positive_by_key["jewellery"]["qid"]
    handbag_qid = positive_by_key["handbag"]["qid"]

    paths = {key: bfs_paths(c, skip_qids if key == "clothing" else set()) for key, c in crawls.items()}
    found_in: dict[str, list[str]] = defaultdict(list)  # qid -> crawl keys
    for key, c in crawls.items():
        for q in c["nodes"]:
            found_in[q].append(key)
        found_in[c["root"]].append(key)

    def L(q: str) -> str:
        return labels.get(q) or q

    def origin(q: str) -> dict:
        e = entities.get(q)
        if not e:
            return {"countries": [], "dropped_countries": [], "cultures": []}
        kept, dropped = [], []
        for c in e["claims"]["P495"]:
            (kept if set(country_types.get(c, [])) & country_classes else dropped).append(c)
        return {"countries": kept, "dropped_countries": dropped, "cultures": e["claims"]["P2596"]}

    def region_of(q: str) -> tuple[str | None, str]:
        o = origin(q)
        for c in o["countries"] + o["cultures"]:
            r = region_from_text(L(c))
            if r:
                return r, f"origin: {L(c)}"
        return None, ""

    excluded: list[dict] = []
    kept: dict[str, dict] = {}

    def drop(q: str, reason: str, detail: str = "") -> None:
        excluded.append({"qid": q, "label": L(q), "description": entities.get(q, {}).get("descriptions", {}).get("en", ""),
                         "reason": reason, "detail": detail, "roots": sorted(set(found_in.get(q, [])))})

    for q, info in f["below_floor"].items():
        if q not in launch:
            drop(q, "no Commons category, image or English Wikipedia article")

    banned_root_qid = {r["key"]: r["qid"] for r in roots["banned"]}
    banned_rule = {r["key"]: r["rule"] for r in roots["banned"]}
    banned_pool: dict[str, list[str]] = defaultdict(list)  # banned root key -> items up to 2 levels below it
    for q in sorted(entities, key=lambda x: int(x[1:])):
        e = entities[q]
        anc = ancestors.get(q, {})
        label = e["labels"].get("en", "")
        is_launch = q in launch
        ex = sorted(exclude_qids[a] for a in anc if a in exclude_qids and a not in clothing_scope)
        if ex:
            if is_launch:
                logger.warning("launch type %s %s is under excluded root(s) %s; kept as a launch type", q, label, ex)
            else:
                drop(q, "under an excluded root", ", ".join(f"{exclude_qids[a]} ({anc[a]})" for a in anc
                                                            if a in exclude_qids and a not in clothing_scope))
                continue
        inst = excluded_instance_of(e["claims"]["P31"], anc, instance_qids)
        if inst and q not in exceptions:
            detail = ", ".join(f"{instance_qids[a]} (P31)" for a in inst)
            if is_launch:
                logger.warning("launch type %s %s is an instance of %s; kept as a launch type", q, label, detail)
            else:
                drop(q, "instance of an excluded class", detail)
                continue
        if label.casefold() in generic_labels and not is_launch:
            drop(q, "generic entry", f"'{label}'")
            continue
        word = LABEL_WORDS_RE.search(label.lower()) or LABEL_PATTERN_RE.search(label.lower())
        if word and not is_launch:
            drop(q, "label word", f"'{word.group(0)}'")
            continue
        if not label:
            drop(q, "no English label")
            continue
        if not (e["claims"]["P373"] or e["claims"]["P18"] or e["enwiki"]) and not is_launch:
            drop(q, "no Commons category, image or English Wikipedia article")
            continue
        under_banned = [banned_by_qid[a]["key"] for a in anc if a in banned_by_qid and anc[a] == "P279"]
        if under_banned and not is_launch:
            # A banned kind appears only as one of its root's examples, at most 2 levels below it.
            near = [k for k in under_banned if q == banned_root_qid[k] or q in crawls[k]["nodes"]]
            if not near:
                drop(q, "banned kind more than 2 levels below its root", ", ".join(under_banned))
            for k in near:
                banned_pool[k].append(q)
            continue
        reached = [r["key"] for r in roots["positive"] if q in paths[r["key"]]]
        if not reached and not is_launch:
            if q in crawls["clothing"]["nodes"]:
                drop(q, "reached only through a skipped class (cut B)", ", ".join(L(s) for s in sorted(skip_qids)))
            continue  # otherwise a banned root's crawl only
        cut = [a for a in anc if a in clothing_scope]
        if cut and not is_launch and q not in keep_list and reached == ["clothing"]:
            drop(q, "under an excluded root", ", ".join(f"{exclude_qids[a]} ({anc[a]})" for a in cut))
            continue
        # D2b: the costume root's reach doesn't save a mask, uniform, protective or sportswear type,
        # and what lies under costume past its 2 levels doesn't come in through clothing.
        wins = [a for a in cut if a in wins_qids]
        if (wins and "costume" in reached and not set(reached) - {"clothing", "costume"}
                and not is_launch and q not in keep_list):
            drop(q, "costume under an excluded root", ", ".join(f"{exclude_qids[a]} ({anc[a]})" for a in wins))
            continue
        if anc.get(costume_root_qid) == "P279" and reached == ["clothing"] and not is_launch and q not in keep_list:
            drop(q, "costume more than 2 levels below its root", "costume (P279)")
            continue
        # D2c: below space suit are particular suits; space suit itself stays.
        below = [a for a in anc if a in only_itself and a != q]
        if below and not is_launch and q not in keep_list:
            drop(q, "below a root kept as itself only", ", ".join(f"{L(a)} ({anc[a]})" for a in below))
            continue
        kept[q] = {"under_banned": under_banned}

    # Up to BANNED_KEEP examples per banned root: launch types first (a launch type that is itself
    # a banned root counts for that root), then the root, then items with a Commons category or
    # an image, nearest first.
    banned_examples: dict[str, str] = {}
    for q, cfg in launch.items():
        if cfg["allowed"] != "not_allowed":
            if kept.get(q, {}).get("under_banned"):
                logger.warning("allowed launch type %s %s is under banned root(s) %s", q, cfg["label"], kept[q]["under_banned"])
            continue
        own_root = next((k for k, v in banned_root_qid.items() if v == q), None)
        if own_root or kept[q]["under_banned"]:
            banned_examples[q] = own_root or kept[q]["under_banned"][0]
    for r in roots["banned"]:
        k = r["key"]
        depth_k = crawls[k]["nodes"]

        def rank(q: str) -> tuple:
            e = entities[q]
            return (0 if q == r["qid"] else 1, 0 if (e["claims"]["P373"] or e["claims"]["P18"]) else 1,
                    (depth_k.get(q) or {}).get("depth") or 0, 0 if e["enwiki"] else 1, int(q[1:]))
        count = sum(1 for v in banned_examples.values() if v == k)
        for q in sorted(set(banned_pool[k]) - set(banned_examples), key=rank):
            if count >= specs.BANNED_KEEP:
                break
            banned_examples[q] = k
            kept[q] = {"under_banned": [k]}
            count += 1
    for q in sorted({q for pool in banned_pool.values() for q in pool} - set(banned_examples), key=lambda x: int(x[1:])):
        drop(q, "banned kind beyond its root's examples", ", ".join(k for k, pool in banned_pool.items() if q in pool))

    # Rows.
    rows: list[dict] = []
    for q in sorted(kept, key=lambda x: int(x[1:])):
        e = entities[q]
        anc = ancestors.get(q, {})
        en_aliases = e["aliases"].get("en", [])
        parent_qids = e["claims"]["P279"]
        positive_keys = [r["key"] for r in roots["positive"] if q in paths[r["key"]]]
        best = None  # the nearest positive root
        for k in positive_keys:
            p = paths[k].get(q)
            if p and (best is None or len(p) < len(paths[best][q])):
                best = k
        banned_key = banned_examples.get(q)
        if banned_key:
            path = paths[banned_key].get(q, [q])
            root_key, depth = banned_key, len(path) - 1
        elif best:
            path = paths[best][q]
            root_key, depth = best, len(path) - 1
        else:
            path, root_key, depth = [q], "launch", 0
        item = {"label": e["labels"].get("en", ""), "aliases": en_aliases,
                "description": e["descriptions"].get("en", ""),
                "parent_labels": [L(p) for p in parent_qids],
                "under_jewellery": jewellery_qid in anc, "under_handbag": handbag_qid in anc}
        cls = classify(item)

        if banned_key and q not in launch and cls["allowed"] != "not_allowed":
            # Under a banned root, but its own text doesn't say it's a banned kind: a person decides.
            said = cls["family"] or "nothing clear"
            cls = {**cls, "allowed": "review",
                   "category": cls["category"] if cls["family"] else "not_applicable",
                   "notes": f"Under {L(banned_root_qid[banned_key])} in Wikidata (rule: {banned_rule[banned_key]}), "
                            f"but its own name or description reads as {said}; check."}
        if q in launch:
            cfg = launch[q]
            cls = {**cls, "category": cfg["category"], "garment_type": cfg["garment_type"],
                   "item_type": cfg.get("item_type"), "allowed": cfg["allowed"], "notes": cfg.get("notes", "")}
        elif q in keep_list:
            cut_by = ", ".join(L(a) for a in anc if a in clothing_scope) or "none"
            spec = specs.KEEP_BY_QID[q]
            if spec.get("not_allowed"):
                # D2b: back as a not-allowed example (owner: sportswear stays excluded).
                cls = {**cls, "category": "not_applicable", "garment_type": spec["garment_type"], "item_type": None,
                       "allowed": "not_allowed",
                       "notes": f"Keep list: back from cut A ({cut_by}) as a not-allowed example. "
                                + NOT_ALLOWED_NOTE.format(rule=spec["not_allowed"])}
            elif any(c in anc for c in costume_qids):
                cls = {**cls, **COSTUME_CLASS,
                       "notes": (f"Keep list: back from cut A ({cut_by}); " if cut_by != "none" else "Keep list: ")
                                + "a costume (owner policy, D2b)."}
            else:
                cls = {**cls, "notes": f"Keep list: back from cut A ({cut_by}); check category and allowed."
                                       + (f" {cls['notes']}" if cls["notes"] else "")}
        elif ((set(positive_keys) & set(costume_keys) or (costume_root_qid in anc and positive_keys == ["clothing"]))
              and cls["allowed"] != "not_allowed"):
            # D2b, owner policy: costumes rent. A banned kind (the classifier's not_allowed) stays
            # banned, and the root alone isn't enough to allow a type (D1b's rule).
            by = ", ".join(L(r["qid"]) for r in roots["positive"]
                           if r.get("costume") and (r["key"] in positive_keys or r["qid"] in anc))
            if cls["signal"] in ("name", "description"):
                cls = {**cls, **COSTUME_CLASS, "notes": f"Costume (under {by}; owner policy, D2b); check the photos."}
            else:
                cls = {**cls, **COSTUME_CLASS, "allowed": "review",
                       "notes": f"Under {by}, but its own name and description don't say it is worn; check."}

        # Region: origin, then the parent chain, then the item's text. A class whose English label
        # is a bare garment word ("jacket") gives no origin, to itself or below it: Wikidata's
        # "jacket" says Malaysia.
        root_qids = {r["qid"] for g in ("positive", "banned") for r in roots[g]}
        region, evidence = (None, "origin on a generic class ignored") if bare_generic(L(q)) and origin(q)["countries"] + origin(q)["cultures"] else region_of(q)
        chain = [a for a in reversed(path[:-1]) if a not in root_qids] + [p for p in parent_qids if p not in path]
        for anc_q in chain if not region else []:
            r2 = region_from_text(L(anc_q))
            if r2:
                region, evidence = r2, f"parent: {L(anc_q)}"
            elif not bare_generic(L(anc_q)) and family_at_end(clean_name(L(anc_q))) is None:
                region, evidence = region_of(anc_q)
                evidence = f"parent {L(anc_q)}, {evidence}" if region else ""
            if region:
                break
        if not region:
            r3 = region_from_text(" ".join([item["label"]] + en_aliases + [item["description"]]))
            if r3:
                region, evidence = r3, "text"
        if not region:
            generic = cls["family"] in GENERIC_FAMILIES and not cls["cultural"] and not cls["historical"] \
                and cls["signal"] in ("name", "description")
            region, evidence = ("Global", "generic") if generic else ("Unknown", evidence)
        if q in launch and launch[q].get("region") and launch[q]["region"] != region:
            # D1's launch region stands unless Wikidata names an origin that says otherwise.
            if not evidence.startswith("origin"):
                region, evidence = launch[q]["region"], "D1 launch mapping"

        vocab = set()
        for name in [item["label"]] + en_aliases:
            if is_latin_text(name):
                vocab.add(name)
        multilingual = {}
        for lang in specs.LANGUAGES:
            lab = e["labels"].get(lang)
            als = e["aliases"].get(lang, [])
            if lab or als:
                multilingual[lang] = {"label": lab, "aliases": als}
            for name in ([lab] if lab else []) + als:
                if is_latin_text(name):
                    vocab.add(name)
        if q in launch:
            vocab.update(launch[q]["fallback_names"])
        vocabulary = sorted(vocab, key=lambda s: (len(s), s.lower(), s))  # the last key makes reruns identical
        o = origin(q)
        image = e["claims"]["P18"][0] if e["claims"]["P18"] else None
        group = ("launch" if q in launch else "keep" if q in keep_list
                 else "costume" if cls["garment_type"] == "costume" and cls["allowed"] == "allowed"
                 else "review" if cls["allowed"] == "review" else "other")
        rows.append({
            "qid": q,
            "english_name": item["label"],
            "description": item["description"],
            "aliases": en_aliases,
            "multilingual": multilingual,
            "parents": [{"qid": p, "label": L(p)} for p in parent_qids],
            "instance_of": [{"qid": c, "label": L(c)} for c in e["claims"]["P31"]],
            "country_of_origin": [L(c) for c in o["countries"]],
            # Why each country was kept: the verified country classes it is an instance of.
            "country_evidence": [{"qid": c, "label": L(c), "classes": sorted(set(country_types.get(c, [])) & country_classes)}
                                 for c in o["countries"]],
            "culture_of_origin": [L(c) for c in o["cultures"]],
            "commons_category": e["claims"]["P373"][0] if e["claims"]["P373"] else None,
            "image": image,
            "wikipedia_article": e["enwiki"],
            "dzirent_category": cls["category"],
            "dzirent_item_type": cls["item_type"] if cls["category"] in ("Accessories", "not_applicable") else None,
            "dzirent_garment_type": cls["garment_type"],
            "allowed": cls["allowed"],
            "region": region,
            "region_evidence": evidence,
            "vocabulary": vocabulary,
            "priority": "launch" if q in launch else "later",
            "keep": "yes" if q in launch else "no" if q in drop_list else "",
            "notes": (f"Drop list: one brand's model (D2b); keep = no. {cls['notes']}".strip() if q in drop_list
                      else cls["notes"]),
            "launch_concept": launch[q]["concept"] if q in launch else None,
            "keep_list": q in keep_list,
            "instance_of_exception": q in exceptions,
            "drop_list": q in drop_list,
            "root": root_key,
            "positive_roots": positive_keys,
            "banned_root": banned_key,
            # The exclusion, banned and positive roots it is under (P279* or P31/P279*), by QID.
            "ancestor_roots": dict(sorted(anc.items(), key=lambda kv: int(kv[0][1:]))),
            "sheet_group": group,
            "depth": depth,
            "path": [{"qid": p, "label": L(p)} for p in path],
            "signal": cls["signal"],
            "source": {"source": "wikidata", "qid": q, "license": "CC0 1.0 Universal Public Domain Dedication"},
        })

    # Size gate.
    if not MIN_ROWS <= len(rows) <= MAX_ROWS:
        report_size(rows, excluded, crawls)
        return 2

    order = {c: i for i, c in enumerate(CATEGORIES)}
    rows.sort(key=lambda r: (SHEET_GROUPS.index(r["sheet_group"]), order.get(r["dzirent_category"], 99),
                             r["english_name"].lower()))
    TAXONOMY_JSON.write_text(json.dumps(rows, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    excluded.sort(key=lambda x: (x["reason"], int(x["qid"][1:])))
    EXCLUDED_JSON.write_text(json.dumps(excluded, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    write_review_csv(rows)
    vocabulary = write_vocabulary(rows)
    logger.info("Wrote %d types to %s, %d to %s, %d to %s, and %s.", len(rows), TAXONOMY_JSON.name, len(excluded),
                EXCLUDED_JSON.name, vocabulary, VOCABULARY_JSON.name, REVIEW_CSV.name)
    print_counts(rows, excluded)
    return 0


def also_called(row: dict) -> list[str]:
    """The sheet's also_called: the type's first five other names (V1b's text pins use the same)."""
    return [n for n in row["vocabulary"] if n.lower() != row["english_name"].lower()][:5]


def write_review_csv(rows: list[dict]) -> None:
    with open(REVIEW_CSV, "w", encoding="utf-8-sig", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(CSV_COLUMNS)
        for r in rows:
            also = also_called(r)
            writer.writerow(["yes" if r["sheet_group"] in NEEDS_OWNER_GROUPS else "", r["keep"], r["priority"],
                             r["english_name"],
                             "; ".join(also), r["region"], r["dzirent_category"], r["dzirent_garment_type"] or "",
                             r["allowed"], r["notes"], r["qid"]])


def vocabulary_entries(rows: list[dict]) -> list[dict]:
    """The scanner's extract: allowed and not-allowed types the owner hasn't marked keep = no."""
    return [{k: r[k] for k in VOCABULARY_FIELDS} for r in rows
            if r["allowed"] in ("allowed", "not_allowed") and r["keep"] != "no"]


def write_vocabulary(rows: list[dict]) -> int:
    entries = vocabulary_entries(rows)
    doc = {"source": "Wikidata, through data/vision/taxonomy/taxonomy.json",
           "license": "CC0 1.0 Universal Public Domain Dedication", "entries": entries}
    VOCABULARY_JSON.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    return len(entries)


def print_counts(rows: list[dict], excluded: list[dict]) -> None:
    print(f"rows: {len(rows)} (launch {sum(r['priority'] == 'launch' for r in rows)}, keep list "
          f"{sum(r['sheet_group'] == 'keep' for r in rows)}, costume {sum(r['sheet_group'] == 'costume' for r in rows)}, "
          f"needs_owner = yes {sum(r['sheet_group'] in NEEDS_OWNER_GROUPS for r in rows)}, keep = no "
          f"{sum(r['keep'] == 'no' for r in rows)})")
    for field in ("dzirent_category", "region", "allowed", "root"):
        print(f"  by {field}: " + ", ".join(f"{k} {v}" for k, v in Counter(r[field] for r in rows).most_common()))
    print("  excluded by reason: " + ", ".join(f"{k} {v}" for k, v in Counter(x["reason"] for x in excluded).most_common()))


def report_size(rows: list[dict], excluded: list[dict], crawls: dict) -> None:
    bound = f"above {MAX_ROWS}" if len(rows) > MAX_ROWS else f"below {MIN_ROWS}"
    print(f"\nSTOPPED: {len(rows)} rows is {bound}; nothing written. What dominated:")
    print_counts(rows, excluded)
    first = Counter(r["path"][1]["label"] if len(r["path"]) > 1 else r["path"][0]["label"] for r in rows if r["root"] == "clothing")
    print("  clothing rows by first-level branch: " + ", ".join(f"{k} {v}" for k, v in first.most_common(25)))
    print("  rows by depth: " + ", ".join(f"{k} {v}" for k, v in sorted(Counter(r["depth"] for r in rows).items())))
    review = Counter(r["notes"] for r in rows if r["allowed"] == "review")
    print("  review rows by note: " + "; ".join(f"{v}x {k}" for k, v in review.most_common(12)))


def read_review_csv() -> tuple[list[dict], list[str]]:
    """The sheet's rows and columns. Excel saves "CSV UTF-8", or Windows-1252 as plain "CSV"."""
    try:
        text = REVIEW_CSV.read_text(encoding="utf-8-sig")
    except UnicodeDecodeError:
        text = REVIEW_CSV.read_text(encoding="cp1252")
        logger.info("review.csv isn't UTF-8; read it as Windows-1252 (Excel's plain CSV).")
    reader = csv.DictReader(io.StringIO(text, newline=""))
    rows = list(reader)
    return rows, list(reader.fieldnames or [])


def apply_review() -> None:
    """Reads the owner's edited review.csv back into taxonomy.json."""
    if not REVIEW_CSV.exists() or not TAXONOMY_JSON.exists():
        sys.exit("review.csv and taxonomy.json must both exist (run build_taxonomy.py first).")
    taxonomy = json.loads(TAXONOMY_JSON.read_text(encoding="utf-8"))
    by_qid = {item["qid"]: item for item in taxonomy}
    updated, problems = 0, []
    for n, row in enumerate(read_review_csv()[0], start=2):
        qid = (row.get("qid") or "").strip()
        if qid not in by_qid:
            problems.append(f"line {n}: unknown qid '{qid}'")
            continue
        item = by_qid[qid]
        values = {k: (row.get(k) or "").strip() for k in ("keep", "priority", "dzirent_category",
                                                           "dzirent_garment_type", "allowed", "notes")}
        values["keep"] = values["keep"].lower()
        if values["keep"] not in KEEP_VALUES:
            problems.append(f"line {n} ({qid}): keep '{values['keep']}' must be yes, no or blank")
            continue
        if values["dzirent_category"] not in CATEGORIES:
            problems.append(f"line {n} ({qid}): category '{values['dzirent_category']}' isn't a database value")
            continue
        if values["dzirent_garment_type"] and values["dzirent_garment_type"] not in GARMENT_TYPES:
            problems.append(f"line {n} ({qid}): garment type '{values['dzirent_garment_type']}' isn't a database value")
            continue
        if values["allowed"] not in ALLOWED:
            problems.append(f"line {n} ({qid}): allowed '{values['allowed']}' must be one of {ALLOWED}")
            continue
        item["keep"] = values["keep"]
        item["priority"] = values["priority"] or item["priority"]
        item["dzirent_category"] = values["dzirent_category"]
        if values["dzirent_garment_type"]:
            item["dzirent_garment_type"] = values["dzirent_garment_type"]
        item["allowed"] = values["allowed"]
        item["notes"] = values["notes"]
        updated += 1
    for p in problems:
        logger.warning(p)
    TAXONOMY_JSON.write_text(json.dumps(taxonomy, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    vocabulary = write_vocabulary(taxonomy)
    logger.info("Updated %d types in %s from review.csv (%d lines skipped); %d marked keep = no; %s has %d types.",
                updated, TAXONOMY_JSON.name, len(problems), sum(t["keep"] == "no" for t in taxonomy),
                VOCABULARY_JSON.name, vocabulary)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the clothing taxonomy and the review sheet.")
    parser.add_argument("--apply-review", action="store_true", help="apply an owner-edited review.csv to taxonomy.json")
    args = parser.parse_args()
    if args.apply_review:
        apply_review()
        return
    sys.exit(build_taxonomy())


if __name__ == "__main__":
    main()
