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
- Accessories allowed: sunglasses, handbags, ties, watches, belt buckles. Not allowed: smartwatches, caps, hats, boots, shoes, socks, pantyhose.
- Not offered: everyday basics such as T-shirts, track pants, sweatpants, joggers, shorts, jean shorts and plain everyday jeans.
- Location shows as "City, ST". Exact locations are never shown; only distance.
- Listing cards show only the photo, title and "$price · distance". Never the word "free". No save button on cards.
- "Saved" (not "Bag"), because there is no checkout.
- Minimalist look: black and white with a hint of the logo's maroon/pink. As few taps as possible.
- AI features use only Dzirent's own code or open-source models, never paid AI services.

## Mobile layout

- **Top bar:** profile at left, logo in the center, "City, ST" at right.
- **Sticky bar:** a date chip that always shows a range (for example "Oct 26 - 30").
- **Home:** three or four rows such as "Likely to fit you" and "New near you", then Products and Studios tabs.
- **Bottom bar:** Home, Inbox (Messages and Activity, with a notification dot), Search in the center, Closet, Saved.
- **Sidebar:** profile, settings, then "All categories" with the filter icon. Filters live only in the sidebar. Sort appears only in Search and Closet.
