/**
 * DEMO-REALISM Phase 1A — Curated Studio identities and outfit allocations.
 * Fictional Texas boutique rental studios distributing all 40 licensed sample garments.
 * Demo-only MSW simulation; canonical catalog manifest and backend database remain untouched.
 */
import manifest from "../../../../fixtures/catalog/manifest.json";

export interface DemoStudioRecord {
  id: string;
  lender_profile_id: string;
  handle: string;
  display_name: string;
  bio: string;
  city: string;
  state_code: "TX";
  is_public: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ProductEditorial {
  title: string;
  brand_label: string;
  description: string;
  studio_handle: string;
  lender_profile_id: string;
}

// Exactly 6 curated demo Studios across Texas
// Studio 1 is the original demo lender studio; Studios 2-6 are browse-only curated identities.
export const DEMO_STUDIOS: DemoStudioRecord[] = [
  {
    id: manifest.seed_studio.id, // "93e4022f-9375-5dd4-9acf-0f5f5974216c"
    lender_profile_id: manifest.seed_lender.id, // "d9927684-1454-51bb-9491-d2d5032e6820"
    handle: "sample-lender",
    display_name: "Sample Lender",
    bio: "A curated Austin collection of evening wear, celebration dresses, and gala-ready silhouettes.",
    city: "Austin",
    state_code: "TX",
    is_public: true,
    version: 1,
    created_at: manifest.seed_studio.created_at,
    updated_at: manifest.seed_studio.updated_at,
  },
  {
    id: "d3120000-0000-4000-8000-000000001001",
    lender_profile_id: "d3120000-0000-4000-8000-000000002001",
    handle: "atelier-valverde",
    display_name: "Atelier Valverde",
    bio: "Sharp tailoring, classic dinner jackets, and refined formalwear for Texas galas and evening celebrations.",
    city: "Dallas",
    state_code: "TX",
    is_public: true,
    version: 1,
    created_at: "2026-10-15T12:00:00+00:00",
    updated_at: "2026-10-15T12:00:00+00:00",
  },
  {
    id: "d3120000-0000-4000-8000-000000001002",
    lender_profile_id: "d3120000-0000-4000-8000-000000002002",
    handle: "nocturne-houston",
    display_name: "Nocturne Houston",
    bio: "Statement cocktail dresses, shimmering sequins, and after-dark party sets for celebration nights.",
    city: "Houston",
    state_code: "TX",
    is_public: true,
    version: 1,
    created_at: "2026-10-15T12:00:00+00:00",
    updated_at: "2026-10-15T12:00:00+00:00",
  },
  {
    id: "d3120000-0000-4000-8000-000000001003",
    lender_profile_id: "d3120000-0000-4000-8000-000000002003",
    handle: "zari-heritage",
    display_name: "Zari Heritage",
    bio: "Handcrafted lehengas, regal sherwanis, and festive silk sarees for weddings and sangeet celebrations.",
    city: "Sugar Land",
    state_code: "TX",
    is_public: true,
    version: 1,
    created_at: "2026-10-15T12:00:00+00:00",
    updated_at: "2026-10-15T12:00:00+00:00",
  },
  {
    id: "d3120000-0000-4000-8000-000000001004",
    lender_profile_id: "d3120000-0000-4000-8000-000000002004",
    handle: "maison-marfa",
    display_name: "Maison Marfa",
    bio: "Architectural co-ords, sculptural jumpsuits, and editorial designer separates with desert minimalism.",
    city: "Marfa",
    state_code: "TX",
    is_public: true,
    version: 1,
    created_at: "2026-10-15T12:00:00+00:00",
    updated_at: "2026-10-15T12:00:00+00:00",
  },
  {
    id: "d3120000-0000-4000-8000-000000001005",
    lender_profile_id: "d3120000-0000-4000-8000-000000002005",
    handle: "sol-san-antonio",
    display_name: "Sol Bridal Archive",
    bio: "Heirloom ceremony gowns, ethereal veils, and romantic reception ensembles for memorable occasions.",
    city: "San Antonio",
    state_code: "TX",
    is_public: true,
    version: 1,
    created_at: "2026-10-15T12:00:00+00:00",
    updated_at: "2026-10-15T12:00:00+00:00",
  },
];

export const CURATED_LENDER_IDS = new Set(
  DEMO_STUDIOS.filter(s => s.handle !== "sample-lender").map(s => s.lender_profile_id)
);

// Allocation of all 40 original licensed products across the 6 Studios
// Target counts: sample-lender: 14, atelier-valverde: 8, nocturne-houston: 6,
//                zari-heritage: 5, maison-marfa: 4, sol-san-antonio: 3 (sum: 40)
export const PRODUCT_EDITORIAL_MAP: Record<string, ProductEditorial> = {
  // --- Studio 1: sample-lender (14 outfits) --- Evening, Wedding Guest, Celebration
  "e2579a80-fb94-53d7-a29c-8c8ed5d529dc": { // demo-women-dresses-01
    studio_handle: "sample-lender",
    lender_profile_id: manifest.seed_lender.id,
    title: "Obsidian Crepe Column Gown",
    brand_label: "Atelier Austin",
    description: "Sleek black column silhouette cut from textured crepe with a structured square neckline.",
  },
  "742ea3cf-199e-5703-944b-d2654ffb4c3c": { // demo-women-gowns-02
    studio_handle: "sample-lender",
    lender_profile_id: manifest.seed_lender.id,
    title: "Ivory Silk Chiffon Draped Gown",
    brand_label: "Atelier Austin",
    description: "Sweeping ivory chiffon gown with pleated bodice detailing and fluid movement.",
  },
  "e7f81364-5121-50dc-9ddc-91ca9a78f999": { // demo-women-skirts-tops-05
    studio_handle: "sample-lender",
    lender_profile_id: manifest.seed_lender.id,
    title: "Emerald Satin Tiered Maxi Set",
    brand_label: "Atelier Austin",
    description: "Vibrant jewel-green satin camisole paired with a cascading tiered maxi skirt.",
  },
  "f61e1f35-3e33-5d35-8f5b-138aac99967d": { // demo-men-dress-shirts-07
    studio_handle: "sample-lender",
    lender_profile_id: manifest.seed_lender.id,
    title: "Dusty Rose Marcella Evening Shirt",
    brand_label: "Atelier Austin",
    description: "Fine cotton evening shirt in a soft blush tint featuring a bib-front panel.",
  },
  "32eff2de-205b-53f0-b4cd-88333c62b84c": { // demo-men-waistcoats-09
    studio_handle: "sample-lender",
    lender_profile_id: manifest.seed_lender.id,
    title: "Onyx Wool Peak Waistcoat",
    brand_label: "Atelier Austin",
    description: "Tailored formal waistcoat with welted pockets and satin adjustable back strap.",
  },
  "543271a3-acc9-5d9c-8808-f1cd6b941cb4": { // demo-suits-tuxedos-suit-separates-20
    studio_handle: "sample-lender",
    lender_profile_id: manifest.seed_lender.id,
    title: "Bordeaux Wool Flannel Suit Separates",
    brand_label: "Atelier Austin",
    description: "Rich burgundy jacket and trouser separates tailored from soft brushed wool.",
  },
  "61b830f9-4634-5ea6-9a15-79c2f9d477f3": { // demo-wedding-guest-daytime-21
    studio_handle: "sample-lender",
    lender_profile_id: manifest.seed_lender.id,
    title: "Sage Floral Linen Garden Midi Dress",
    brand_label: "Atelier Austin",
    description: "Breezy sage green linen dress with subtle botanical print and smocked bodice.",
  },
  "f20c6359-48be-5f48-9a1c-3a687f0c36bc": { // demo-wedding-guest-formal-22
    studio_handle: "sample-lender",
    lender_profile_id: manifest.seed_lender.id,
    title: "Gilded Jacquard Pleated Maxi Gown",
    brand_label: "Atelier Austin",
    description: "Shimmering warm-gold jacquard formal gown featuring accordion pleating and empire waist.",
  },
  "1502e2a8-2938-57ef-8992-234d746cce2e": { // demo-wedding-guest-black-tie-23
    studio_handle: "sample-lender",
    lender_profile_id: manifest.seed_lender.id,
    title: "Blush Organza Off-Shoulder Gown",
    brand_label: "Atelier Austin",
    description: "Romantic petal-pink gown crafted in layered organza with delicate off-the-shoulder straps.",
  },
  "985a4676-f2e4-5571-8d9d-44ddecce24f6": { // demo-wedding-guest-outdoor-24
    studio_handle: "sample-lender",
    lender_profile_id: manifest.seed_lender.id,
    title: "Dove Grey Tiered Chiffon Dress",
    brand_label: "Atelier Austin",
    description: "Airy light-grey chiffon dress with high halter neckline and tiered flounce hemline.",
  },
  "b9034c91-8398-5293-bafe-43a973392c7c": { // demo-wedding-guest-festive-25
    studio_handle: "sample-lender",
    lender_profile_id: manifest.seed_lender.id,
    title: "Midnight Tiered Lace Cocktail Dress",
    brand_label: "Atelier Austin",
    description: "Intricate black floral lace dress with delicate scalloped edges and illusion neckline.",
  },
  "fd3714ad-670f-5cb9-95de-48f6e869a001": { // demo-designer-dresses-31
    studio_handle: "sample-lender",
    lender_profile_id: manifest.seed_lender.id,
    title: "Rose Quartz Silk Bias-Cut Gown",
    brand_label: "Atelier Austin",
    description: "Minimalist pink silk charmeuse gown with cowl back and delicate straps.",
  },
  "3774ca13-3b66-503d-b93a-d112c58a6f34": { // demo-designer-gowns-32
    studio_handle: "sample-lender",
    lender_profile_id: manifest.seed_lender.id,
    title: "Silver Tulle A-Line Gala Gown",
    brand_label: "Atelier Austin",
    description: "Dramatic smoky-silver tulle ballgown featuring a corseted bodice and metallic embroidery.",
  },
  "0e481a59-48fa-5a67-9d81-d541837eac77": { // demo-designer-sets-34
    studio_handle: "sample-lender",
    lender_profile_id: manifest.seed_lender.id,
    title: "Alabaster Tailored Vest & Trouser Set",
    brand_label: "Atelier Austin",
    description: "Pristine ivory suiting separate set featuring a longline waistcoat and pleated trousers.",
  },

  // --- Studio 2: atelier-valverde (8 outfits) --- Bespoke Men's Suiting & Black Tie
  "34b73caa-536d-55c3-a6ac-50c2460b42bd": { // demo-men-blazers-06
    studio_handle: "atelier-valverde",
    lender_profile_id: "d3120000-0000-4000-8000-000000002001",
    title: "Champagne Jacquard Evening Blazer",
    brand_label: "Atelier Valverde",
    description: "Refined evening jacket woven in subtle champagne jacquard with satin peak lapels.",
  },
  "5e652e67-bc3e-5208-85d3-bbdbc2779e26": { // demo-men-trousers-08
    studio_handle: "atelier-valverde",
    lender_profile_id: "d3120000-0000-4000-8000-000000002001",
    title: "Slate Wool Flat-Front Trousers",
    brand_label: "Atelier Valverde",
    description: "Precision-tailored mid-grey dress trousers crafted from breathable tropical wool.",
  },
  "02e91b8c-cc68-5106-a7f3-fbf9d9063295": { // demo-men-ensembles-10
    studio_handle: "atelier-valverde",
    lender_profile_id: "d3120000-0000-4000-8000-000000002001",
    title: "Sandstone Linen Suiting Ensemble",
    brand_label: "Atelier Valverde",
    description: "Relaxed summer formal jacket and matching trousers in unbleached natural linen.",
  },
  "44e303a0-ed08-54b7-9b64-c30c6ab8b359": { // demo-suits-tuxedos-two-piece-suits-16
    studio_handle: "atelier-valverde",
    lender_profile_id: "d3120000-0000-4000-8000-000000002001",
    title: "Charcoal Two-Piece Notch Lapel Suit",
    brand_label: "Atelier Valverde",
    description: "Modern charcoal two-piece suit tailored in Italian virgin wool with horn buttons.",
  },
  "4975ae96-0689-5dd9-85c7-eecca4bd5189": { // demo-suits-tuxedos-three-piece-suits-17
    studio_handle: "atelier-valverde",
    lender_profile_id: "d3120000-0000-4000-8000-000000002001",
    title: "Midnight Classic Three-Piece Tuxedo",
    brand_label: "Atelier Valverde",
    description: "Timeless black-tie three-piece ensemble including jacket, vest, and grosgrain-stripe trousers.",
  },
  "69dfff0a-2005-5d83-b317-304aff6a17fc": { // demo-suits-tuxedos-tuxedos-18
    studio_handle: "atelier-valverde",
    lender_profile_id: "d3120000-0000-4000-8000-000000002001",
    title: "Alabaster Shawl-Collar Dinner Tuxedo",
    brand_label: "Atelier Valverde",
    description: "Contrasting cream dinner jacket with black silk satin shawl collar and black formal trousers.",
  },
  "fefffa78-2d24-5ab8-b0b7-5b4735f71fe3": { // demo-suits-tuxedos-dinner-jackets-19
    studio_handle: "atelier-valverde",
    lender_profile_id: "d3120000-0000-4000-8000-000000002001",
    title: "Navy Velvet Evening Dinner Jacket",
    brand_label: "Atelier Valverde",
    description: "Sumptuous deep navy cotton velvet dinner jacket with satin-faced peak lapels.",
  },
  "0e8e8d01-5494-5b55-83ce-10cd23659d9a": { // demo-designer-suits-33
    studio_handle: "atelier-valverde",
    lender_profile_id: "d3120000-0000-4000-8000-000000002001",
    title: "Architectural Double-Breasted Black Suit",
    brand_label: "Atelier Valverde",
    description: "Sharp six-button double-breasted suit with broad peak lapels and structured shoulders.",
  },

  // --- Studio 3: nocturne-houston (6 outfits) --- Party, Cocktail & Night Out
  "785a4261-1d4f-5bc3-ab5a-fa7d5cecaeb3": { // demo-party-cocktail-mini-dresses-11
    studio_handle: "nocturne-houston",
    lender_profile_id: "d3120000-0000-4000-8000-000000002002",
    title: "Cobalt Corset Cocktail Mini Dress",
    brand_label: "Nocturne Houston",
    description: "Structured cobalt mini dress featuring boned bodice construction and sculpted hem.",
  },
  "10b9bedc-b760-57d3-834f-905ce14b85c4": { // demo-party-cocktail-midi-dresses-12
    studio_handle: "nocturne-houston",
    lender_profile_id: "d3120000-0000-4000-8000-000000002002",
    title: "Crimson Asymmetric Drape Midi Dress",
    brand_label: "Nocturne Houston",
    description: "Statement scarlet cocktail midi with one-shoulder gathering and side slit.",
  },
  "844f0c0f-cf9f-569c-bad3-3917bf7ce160": { // demo-party-cocktail-sequin-outfits-13
    studio_handle: "nocturne-houston",
    lender_profile_id: "d3120000-0000-4000-8000-000000002002",
    title: "Malachite Shimmer Sequin Halter Gown",
    brand_label: "Nocturne Houston",
    description: "Deep emerald sequin-embellished gown cut with an open back and high halter neckline.",
  },
  "f3a854ba-f85c-530e-9c9f-160beae53ce5": { // demo-party-cocktail-party-sets-14
    studio_handle: "nocturne-houston",
    lender_profile_id: "d3120000-0000-4000-8000-000000002002",
    title: "Liquid Gold Metallic Crop & Skirt Set",
    brand_label: "Nocturne Houston",
    description: "Gleaming golden party coordinate set with bandeau top and matching pencil skirt.",
  },
  "fe3ad113-0ea7-598f-b971-b24c0bf57f1e": { // demo-party-cocktail-evening-separates-15
    studio_handle: "nocturne-houston",
    lender_profile_id: "d3120000-0000-4000-8000-000000002002",
    title: "Magenta Feather-Trim Evening Separates",
    brand_label: "Nocturne Houston",
    description: "Playful fuchsia satin camisole and trouser set adorned with delicate tonal plumes.",
  },
  "52aadf98-a510-5e40-8ddd-0e9647a2eb90": { // demo-designer-statement-pieces-35
    studio_handle: "nocturne-houston",
    lender_profile_id: "d3120000-0000-4000-8000-000000002002",
    title: "Sapphire Crystal-Embellished Cape Blazer",
    brand_label: "Nocturne Houston",
    description: "Dramatic midnight-blue tailored blazer with slit cape sleeves and rhinestone trim.",
  },

  // --- Studio 4: zari-heritage (5 outfits) --- South Asian Ceremonial & Cultural
  "e67cdbca-1c0f-5a6f-aa85-75ac8997deaf": { // demo-indian-cultural-sarees-26
    studio_handle: "zari-heritage",
    lender_profile_id: "d3120000-0000-4000-8000-000000002003",
    title: "Kanjivaram Zari Border Silk Saree",
    brand_label: "Zari Heritage",
    description: "Pure ivory silk saree adorned with intricate gold zari weaving and contrast pallu.",
  },
  "295adbff-4e64-5943-b86e-6248e8f4c2cc": { // demo-indian-cultural-lehengas-27
    studio_handle: "zari-heritage",
    lender_profile_id: "d3120000-0000-4000-8000-000000002003",
    title: "Royal Indigo Embroidered Lehenga",
    brand_label: "Zari Heritage",
    description: "Deep navy raw silk lehenga set with silver resham hand-embroidery and sheer dupatta.",
  },
  "e8639b06-0187-5154-ae3e-4dc74ec6df44": { // demo-indian-cultural-sherwanis-28
    studio_handle: "zari-heritage",
    lender_profile_id: "d3120000-0000-4000-8000-000000002003",
    title: "Crimson Embroidered Silk Sherwani",
    brand_label: "Zari Heritage",
    description: "Regal deep-red brocade sherwani coat with ornate gilt buttons and matching churidar.",
  },
  "9f31d921-9343-5dfd-bc1c-ebdcc4151bf0": { // demo-indian-cultural-kurta-sets-29
    studio_handle: "zari-heritage",
    lender_profile_id: "d3120000-0000-4000-8000-000000002003",
    title: "Pistachio Chanderi Silk Kurta Set",
    brand_label: "Zari Heritage",
    description: "Light olive-green festive kurta paired with embroidered Nehru jacket and slim trousers.",
  },
  "94c85d12-da8e-5d2e-957d-a2d54e42472a": { // demo-indian-cultural-anarkalis-30
    studio_handle: "zari-heritage",
    lender_profile_id: "d3120000-0000-4000-8000-000000002003",
    title: "Gilded Mustard Flared Anarkali Gown",
    brand_label: "Zari Heritage",
    description: "Floor-length marigold silk anarkali with mirror-work yoke and flowing kalis.",
  },

  // --- Studio 5: maison-marfa (4 outfits) --- Modern Avant-Garde & Co-ords
  "e50af395-1491-5af3-9f03-6d9a46928a9b": { // demo-women-jumpsuits-03
    studio_handle: "maison-marfa",
    lender_profile_id: "d3120000-0000-4000-8000-000000002004",
    title: "Tailored Navy Wide-Leg Jumpsuit",
    brand_label: "Maison Marfa Archive",
    description: "Minimalist deep navy jumpsuit with sharp lapels and relaxed wide-leg tailoring.",
  },
  "c8e1d626-c199-58b3-8133-1fce0852e2be": { // demo-women-co-ords-04
    studio_handle: "maison-marfa",
    lender_profile_id: "d3120000-0000-4000-8000-000000002004",
    title: "Terracotta Linen Co-ord Set",
    brand_label: "Maison Marfa Archive",
    description: "Sculptural crop top and high-rise culotte set in rich earth-toned terracotta.",
  },
  "f89d4d01-be23-5359-a1db-f42c4cdcebcb": { // demo-bridal-bridal-separates-38
    studio_handle: "maison-marfa",
    lender_profile_id: "d3120000-0000-4000-8000-000000002004",
    title: "Champagne Silk Bralette & Column Skirt",
    brand_label: "Maison Marfa Archive",
    description: "Modern bridal two-piece ensemble with structured silk crop top and high-waisted skirt.",
  },
  "e98c8681-1a34-5b65-8af2-cdd1c2709418": { // demo-bridal-bridal-ensembles-40
    studio_handle: "maison-marfa",
    lender_profile_id: "d3120000-0000-4000-8000-000000002004",
    title: "Minimalist Organza Duster Ensemble",
    brand_label: "Maison Marfa Archive",
    description: "Translucent silver-grey silk organza overcoat paired with an opaque under-dress.",
  },

  // --- Studio 6: sol-san-antonio (3 outfits) --- Romantic Bridal & Reception
  "a372115c-a075-5a49-ab50-f05c893c0c7d": { // demo-bridal-wedding-gowns-36
    studio_handle: "sol-san-antonio",
    lender_profile_id: "d3120000-0000-4000-8000-000000002005",
    title: "Scarlet Brocade Ceremony Gown",
    brand_label: "Sol Bridal Archive",
    description: "Dramatic crimson ceremony gown tailored in rich floral brocade with a trailing train.",
  },
  "247059c4-43cb-528a-8e6e-6155a92b1874": { // demo-bridal-reception-looks-37
    studio_handle: "sol-san-antonio",
    lender_profile_id: "d3120000-0000-4000-8000-000000002005",
    title: "Mint Gossamer Silk Reception Slip",
    brand_label: "Sol Bridal Archive",
    description: "Ethereal pastel-green silk charmeuse gown designed for dancing at evening receptions.",
  },
  "df618818-2c18-53b2-bb8b-3178f2b53a0b": { // demo-bridal-veils-capes-39
    studio_handle: "sol-san-antonio",
    lender_profile_id: "d3120000-0000-4000-8000-000000002005",
    title: "Blush Chantilly Lace Chapel Veil",
    brand_label: "Sol Bridal Archive",
    description: "Cathedral-length soft blush tulle veil bordered in hand-cut French Chantilly lace.",
  },
};

