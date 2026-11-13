# Dzirent

Peer-to-peer clothing rental. People list outfits they own, and people nearby rent them for a date range. Pickup and return are arranged in chat.

Dzirent runs on the web (dzirent.com), Android and iOS. All three share one backend and behave the same.

## Who uses it

- **Guest:** browses everything without an account.
- **Renter:** saves pieces and studios, messages lenders, rents.
- **Lender:** runs a studio, lists pieces, manages availability.

One account can be both renter and lender.

## Core workflows

**Browsing.** Home rows, search, filters, and listing pages with photos, garment measurements, availability, price and distance. Guests see all of this. A sign-in or sign-up prompt appears once on the first visit, with a "Browse as guest" option. After that, guests are asked to sign up only when they try to save a piece, message a lender, open a studio page, list a piece, or use fit matching.

**Fit matching.** Renters add their body measurements, which stay private. "Likely to fit you" compares them with each piece's garment measurements. Guests see one card inviting them to add measurements.

**Listing a piece.** Photos (front, back, close-up, size tag, extras), category, garment type, size, measurements, price, deposit note, retail value, styles and an availability calendar. Accessories need a one-time declaration. Lenders can pause or delete a listing; deleting removes its photos.

**Messaging.** A renter starts a chat from a listing with requested dates. Both sides chat directly in the app and can adjust the dates.

**Rentals.** Both sides mark whether a rental happened. A renter's rented pieces show in their own tab.

**Studios.** Each lender's page shows studio name, handle, bio, style tags, city, pickup area, rental count and typical reply time. Users save (bookmark) studios. There are no follows and no follower counts.

**Safety.** Users can block and report users, listings and messages. Blocked users disappear from each other's browsing.

**Account.** Settings, private measurements, and account deletion, which removes the user's listings and photos.

## Product rules

- No payments, checkout, deposits or shipping. Renters and lenders arrange these themselves. A clearly placed policy recommends that lenders ask for a deposit on high-value pieces.
- Categories: Career & Professional, Occasion & Party, Cultural & Traditional, Everyday, Outerwear, Accessories.
- Accessories allowed: sunglasses, handbags, ties, watches, belt buckles and costume jewelry (necklaces, earrings, bracelets, rings, brooches). Costume jewelry, like every accessory, needs the accessory declaration. Not allowed: smartwatches, caps, hats, boots, shoes, socks, pantyhose.
- Not offered: everyday basics such as T-shirts, tank tops, hoodies, sweatshirts, track pants, sweatpants, joggers, shorts, jean shorts and plain everyday jeans.
- Not allowed: lingerie, underwear and swimwear.
- Not allowed: counterfeits, replicas, or damaged or dirty items.
- Photos of the item being worn are allowed (hanger, mannequin, flat-lay, or worn are all fine). If a user appears in a photo, it is public like every listing photo; users must not include other people without their permission. No text, prices, phone numbers, social handles or watermarks on photos.
- Listing photos are checked automatically. A check comes back allowed, not allowed (with the reason), or for review by a person at Dzirent. When the photos of a live listing change, they are checked again.
- Location shows as "City, ST". Exact locations are never shown; only distance.
- Prices are per day: a listing's price is its price for one day. Cards show only the photo, title and "$price/day · distance". Never the word "free". No save button on cards.
- The listing page shows "$price/day" and, with dates chosen, the number of days and the total ("5 days · $125"). Days count both the first and the last day.
- Every error people see ends with its code in brackets, for example "Add a photo first (DZ-E2010)", so they can quote it to support. Photo warnings carry DZ-W codes the same way.
- "Saved" (not "Bag"), because there is no checkout.
- Minimalist look: black and white with a hint of the logo's maroon/pink. As few taps as possible.
- AI features use only Dzirent's own code or open-source models, never paid AI services.

## Mobile layout

- **Top bar:** profile at left, logo in the center, "City, ST" at right.
- **Sticky bar:** a date chip that always shows a range (for example "Oct 26 - 30").
- **Home:** three or four rows such as "Likely to fit you" and "New near you", then Products and Studios tabs.
- **Bottom bar:** Home, Inbox (Messages and Activity, with a notification dot), Search in the center, Closet, Saved.
- **Sidebar:** profile, settings, then "All categories" with the filter icon. Filters live only in the sidebar. Sort appears only in Search and Closet.

## Open-source software and models

Dzirent is built with the open-source projects below, each under its own license. The tables list Dzirent's direct dependencies, taken from its dependency files; these projects bring in their own dependencies, also open source. The Android app shows every library it contains, with its license, under About > Open-source licenses.

### Models

| Model | What Dzirent uses it for | License | Project |
|---|---|---|---|
| Marqo-FashionSigLIP | Reads listing photos on Dzirent's own photo-check service: what the piece is, whether it can be listed, and suggested details for the listing | Apache 2.0 | [Marqo/marqo-fashionSigLIP](https://huggingface.co/Marqo/marqo-fashionSigLIP) |
| ViT-B-16-SigLIP (WebLI), Google's SigLIP model | The base model Marqo-FashionSigLIP was fine-tuned from | Apache 2.0 | [timm/ViT-B-16-SigLIP](https://huggingface.co/timm/ViT-B-16-SigLIP), [google-research/big_vision](https://github.com/google-research/big_vision) |
| nsfw-image-detection-384 | The photo check's image safety model: how likely a photo shows nudity or sexual content | Apache 2.0 | [Marqo/nsfw-image-detection-384](https://huggingface.co/Marqo/nsfw-image-detection-384) |
| ViT-Tiny (vit_tiny_patch16_384, AugReg) | The base model nsfw-image-detection-384 was fine-tuned from | Apache 2.0 | [timm/vit_tiny_patch16_384.augreg_in21k_ft_in1k](https://huggingface.co/timm/vit_tiny_patch16_384.augreg_in21k_ft_in1k) |

### Text filter

| Data | What Dzirent uses it for | License | Project |
|---|---|---|---|
| List of Dirty, Naughty, Obscene, and Otherwise Bad Words (English list) | The words the database refuses in listings, profiles and report reasons | CC BY 4.0 | [LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words) |

Changes to the list: Dzirent uses the English list as of commit `5faf2ba`, leaves out its one emoji entry, and switches off a few entries that are ordinary words on a clothing marketplace (for example "nude" as a color and "pussy bow" as a blouse style).

### Photo-check service

| Software | What Dzirent uses it for | License | Project |
|---|---|---|---|
| Python 3.12, official Docker image on Debian 12 (bookworm) | Runs the service | Python: PSF License 2.0; Debian packages: their own free licenses | [python.org](https://www.python.org), [docker-library/python](https://github.com/docker-library/python), [debian.org](https://www.debian.org) |
| PyTorch | Runs the model on the CPU | BSD-3-Clause | [pytorch/pytorch](https://github.com/pytorch/pytorch) |
| OpenCLIP | Builds the model and loads its weights | MIT | [mlfoundations/open_clip](https://github.com/mlfoundations/open_clip) |
| timm (PyTorch Image Models) | The model's image encoder, through OpenCLIP | Apache 2.0 | [huggingface/pytorch-image-models](https://github.com/huggingface/pytorch-image-models) |
| Transformers | The model's text tokenizer, while the service is built | Apache 2.0 | [huggingface/transformers](https://github.com/huggingface/transformers) |
| huggingface_hub | Downloads the pinned model while the service is built | Apache 2.0 | [huggingface/huggingface_hub](https://github.com/huggingface/huggingface_hub) |
| safetensors | Saves and loads the model weights | Apache 2.0 | [safetensors/safetensors](https://github.com/safetensors/safetensors) |
| NumPy | Image and embedding math | BSD-3-Clause | [numpy/numpy](https://github.com/numpy/numpy) |
| SciPy | Finds the piece's outline for the "whole piece in the frame" photo check | BSD-3-Clause | [scipy/scipy](https://github.com/scipy/scipy) |
| Pillow | Opens and resizes photos | MIT-CMU | [python-pillow/Pillow](https://github.com/python-pillow/Pillow) |
| FastAPI | The service's web API | MIT | [fastapi/fastapi](https://github.com/fastapi/fastapi) |
| Starlette | Under FastAPI; runs each check off the request loop | BSD-3-Clause | [Kludex/starlette](https://github.com/Kludex/starlette) |
| Pydantic | Checks each request's fields | MIT | [pydantic/pydantic](https://github.com/pydantic/pydantic) |
| Uvicorn | The web server | BSD-3-Clause | [Kludex/uvicorn](https://github.com/Kludex/uvicorn) |
| HTTPX | Fetches the listing photos | BSD-3-Clause | [encode/httpx](https://github.com/encode/httpx) |

### Android and iOS apps

| Software | What Dzirent uses it for | License | Project |
|---|---|---|---|
| Kotlin and Kotlin Multiplatform | The language, and one shared code base for Android and iOS | Apache 2.0 | [JetBrains/kotlin](https://github.com/JetBrains/kotlin) |
| Compose Multiplatform (runtime, foundation, UI, Material 3, resources, Material icons) | The shared screens | Apache 2.0 | [JetBrains/compose-multiplatform](https://github.com/JetBrains/compose-multiplatform) |
| Navigation and Lifecycle for Compose Multiplatform | Moving between screens, and screen state | Apache 2.0 | [JetBrains/compose-multiplatform](https://github.com/JetBrains/compose-multiplatform) |
| kotlinx.coroutines | Background work | Apache 2.0 | [Kotlin/kotlinx.coroutines](https://github.com/Kotlin/kotlinx.coroutines) |
| kotlinx.serialization | Reading and writing JSON | Apache 2.0 | [Kotlin/kotlinx.serialization](https://github.com/Kotlin/kotlinx.serialization) |
| kotlinx-datetime | Dates for availability and rentals | Apache 2.0 | [Kotlin/kotlinx-datetime](https://github.com/Kotlin/kotlinx-datetime) |
| supabase-kt (Auth, Postgrest, Storage, Realtime, Functions) | Sign-in, data, photos, live updates and server functions | MIT | [supabase/supabase-kt](https://github.com/supabase/supabase-kt) |
| Ktor client (Android and Darwin engines) | Network requests | Apache 2.0 | [ktorio/ktor](https://github.com/ktorio/ktor) |
| Coil 3 | Loading and caching photos | Apache 2.0 | [coil-kt/coil](https://github.com/coil-kt/coil) |
| AndroidX Core, Activity Compose, DataStore, ExifInterface | Android app basics, settings saved on the phone, photo orientation | Apache 2.0 | [AndroidX](https://developer.android.com/jetpack/androidx) |
| Firebase Messaging for Android | Receives push notifications | Apache 2.0 | [firebase/firebase-android-sdk](https://github.com/firebase/firebase-android-sdk) |
| AboutLibraries | The in-app open-source licenses screen | Apache 2.0 | [mikepenz/AboutLibraries](https://github.com/mikepenz/AboutLibraries) |
| Android Gradle Plugin | Builds the Android app | Apache 2.0 | [Android build](https://developer.android.com/build) |
| JUnit 4 | Unit tests | EPL 1.0 | [junit-team/junit4](https://github.com/junit-team/junit4) |

The Android app also uses Google Play services Location (the approximate location behind "City, ST" and distances). It is not open source; it comes under the Android Software Development Kit License.

### Web app

| Software | What Dzirent uses it for | License | Project |
|---|---|---|---|
| Next.js | The web app framework | MIT | [vercel/next.js](https://github.com/vercel/next.js) |
| React and React DOM | The web pages | MIT | [react.dev](https://react.dev) |
| supabase-js | Sign-in, data and photos | MIT | [supabase/supabase-js](https://github.com/supabase/supabase-js) |
| Supabase SSR (@supabase/ssr) | Signed-in sessions in cookies | MIT | [supabase/ssr](https://github.com/supabase/ssr) |
| Fontsource Roboto (variable) | The Roboto font, served with the site | OFL 1.1 | [Fontsource Roboto](https://fontsource.org/fonts/roboto) |
| TypeScript | Type-checked code (build only) | Apache 2.0 | [microsoft/TypeScript](https://github.com/microsoft/TypeScript) |
| ESLint and eslint-config-next | Code checks (development only) | MIT | [eslint/eslint](https://github.com/eslint/eslint) |
| Type definitions for Node.js and React (@types) | Development only | MIT | [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped) |

### Database

| Software | What Dzirent uses it for | License | Project |
|---|---|---|---|
| PostgreSQL 17 | The database | PostgreSQL License | [postgresql.org](https://www.postgresql.org) |
| pg_trgm | Search that matches similar words in titles and descriptions | PostgreSQL License | [pg_trgm](https://www.postgresql.org/docs/17/pgtrgm.html) |
| unaccent | Reads accented letters as plain ones for the text filter | PostgreSQL License | [unaccent](https://www.postgresql.org/docs/17/unaccent.html) |
| pgcrypto | Random secrets | PostgreSQL License | [pgcrypto](https://www.postgresql.org/docs/17/pgcrypto.html) |
| pg_net | Lets the database call the photo-check and push-notification functions | Apache 2.0 | [supabase/pg_net](https://github.com/supabase/pg_net) |
| pgvector | Photo fingerprints, to spot the same photo in another listing | PostgreSQL License | [pgvector/pgvector](https://github.com/pgvector/pgvector) |
| Supabase Vault | Keeps the secrets those calls use | Apache 2.0 | [supabase/vault](https://github.com/supabase/vault) |

### Notices

- Marqo-FashionSigLIP and ViT-B-16-SigLIP ship no NOTICE file, and neither do nsfw-image-detection-384 and its ViT-Tiny base model.
- PyTorch ships a NOTICE file with the copyright notices of the code it includes: [NOTICE (PyTorch 2.7.1)](https://github.com/pytorch/pytorch/blob/v2.7.1/NOTICE). A copy is inside the photo-check service.
- Requests (Apache 2.0), part of the photo-check service as a dependency of the Hugging Face libraries, ships this NOTICE:

  > Requests<br>
  > Copyright 2019 Kenneth Reitz

- The mobile apps' direct dependencies ship no NOTICE files in their packages.
