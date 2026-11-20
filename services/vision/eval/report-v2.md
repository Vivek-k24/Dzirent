# Vision V2: evaluation on the locked test split

Written by `services/vision/eval/run_eval.py --local` (service `v2.1`). Every test photo of a type with a
text pin was scanned on this PC as a one-photo listing (slot front) by the service's own model and
`scan.listing_verdict`. The test split (`data/vision/images/split.json`) is never in the gallery or the
linear head's training set and was never used to choose the weights or thresholds (those come from the
train split, `eval/calibrate.py`); this is the one measurement on it.

- Pins: vocabulary `02fcb7ac3009731c`, 843 text pins, 8827 gallery pins; linear head `7fd0498b060272ae` (708 types); policy digest `f2250888045a4f47`.
- Test photos scanned: 2125 of 492 types (0 more belong to review types, which have no pin). V1b's test split had 1,928; the split is sticky, so all of them are here, plus 197 photos the model-agreement check gave back.
- V1b's numbers are from `report-v1b.md`. "V2, V1b's photos" is V2 on exactly V1b's test photos.

## Overall

| Run | Set | Photos | Type top-1 | Mapping top-1 | Top-3 (final) | Top-3 (text pins) | Agreement | Allowed | Review | Rejected |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| V2 | All | 2125 | 53% | 75% | 76% | 43% | 57% | 305 | 1243 | 577 |
| V2 | Allowed types | 1378 | 52% | 73% | 76% | 41% | 56% | 304 | 1014 | 60 |
| V2 | Not-allowed types | 747 | 54% | 77% | 77% | 47% | 60% | 1 | 229 | 517 |
| V2, V1b's photos | All | 1928 | 53% | 75% | 77% | 47% | 59% | 292 | 1104 | 532 |
| V2, V1b's photos | Allowed types | 1214 | 52% | 73% | 76% | 46% | 58% | 291 | 883 | 40 |
| V2, V1b's photos | Not-allowed types | 714 | 54% | 77% | 77% | 48% | 61% | 1 | 221 | 492 |
| V1b | All | 1928 | 51% | | | 42% | 20% | 35 | 1244 | 649 |
| V1b | Allowed types | 1214 | 49% | | | 43% | 19% | 35 | 1115 | 64 |
| V1b | Not-allowed types | 714 | 55% | | | 41% | 23% | 0 | 129 | 585 |

Type top-1: the decided type is the photo's own type. Mapping top-1: the decided Dzirent mapping (category,
garment type, allowed) is the photo's type's. Top-3 (final): the photo's type is among the 3 best types by
the final score (`top_types`); top-3 (text pins): among the 3 most likely text pins (V1b's `top_types`).
Each source alone, V2 test: text top-1 25%, gallery top-1 54%, linear head top-1 64%.

## Allowed / not allowed against the verdict

| Run | Photo's type | Allowed | Review | Rejected |
| --- | --- | --- | --- | --- |
| V2 | allowed | 304 | 1014 | 60 |
| V2 | not allowed | 1 | 229 | 517 |
| V2, V1b's photos | allowed | 291 | 883 | 40 |
| V2, V1b's photos | not allowed | 1 | 221 | 492 |
| V1b | allowed | 35 | 1115 | 64 |
| V1b | not allowed | 0 | 129 | 585 |

## Banned leaks: 1

Not-allowed test photos whose verdict is allowed (V2 on V1b's photos: 1; V1b: 0).

| Photo (sha1) | Its type | Decided type | Confidence | Banned score | Source |
| --- | --- | --- | --- | --- | --- |
| `27abe3ead742` | hat | boubou | 0.7566 | 0.0061 | category |

## Gate false rejections and reviews

- Allowed test photos the gate rejected outright (banned_score at `banned_hard` or more): **8** of 1378 (V2 on V1b's photos: 7 of 1214; V1b: 44 of 1214, V1b's one-tier gate at 0.60).
- Allowed photos rejected by anything: 8 by the gate, 50 by the policy check's own rules, 2 for nudity.
- Not-allowed photos rejected by the gate: 421 of 747.
- Sent to review as text or a poster: 16 allowed-type and 8 not-allowed-type test photos.

Why the allowed-type test photos that weren't allowed were not:

| Reason | Photos |
| --- | --- |
| We couldn't confirm this item is allowed; a reviewer will check. | 499 |
| We're not sure what this piece is, so someone at Dzirent will check the photos. | 353 |
| This piece has a hood, so someone at Dzirent will check it. | 131 |
| This doesn't look like clothing or an accessory we list. | 29 |
| This photo looks like text or a poster, not the piece itself, so someone at Dzirent will check it. | 16 |
| Someone at Dzirent will check these photos before this listing can go live. | 11 |
| This looks like a cowboy hat. Dzirent doesn't allow hats or caps. | 4 |
| The photos seem to show different things, so someone at Dzirent will check them. | 4 |
| This looks like a sleeveless tee. Dzirent doesn't list everyday basics like T-shirts. | 3 |
| This looks like heels. Dzirent doesn't allow shoes. | 3 |
| This looks like a sweatshirt. Dzirent doesn't list everyday basics like hoodies and sweatshirts. | 3 |
| This photo isn't allowed on Dzirent. | 2 |
| This looks like a T-shirt. Dzirent doesn't list everyday basics like T-shirts. | 2 |
| This looks like socks. Dzirent doesn't allow socks. | 2 |
| This looks like a tank top. Dzirent doesn't list everyday basics like tank tops. | 1 |
| This looks like a sport tee. Dzirent doesn't list everyday basics like T-shirts. | 1 |
| This looks like underwear. Dzirent doesn't allow underwear. | 1 |
| This looks like a smartwatch. Dzirent doesn't allow smartwatches. | 1 |
| This looks like a hoodie. Dzirent doesn't list everyday basics like hoodies and sweatshirts. | 1 |
| This looks like a cap. Dzirent doesn't allow caps or hats. | 1 |
| This looks like plain jeans. Dzirent doesn't list everyday basics like jeans. | 1 |
| This looks like track pants. Dzirent doesn't list everyday basics like track pants. | 1 |
| This looks like shorts. Dzirent doesn't list everyday basics like shorts. | 1 |
| This looks like a hat. Dzirent doesn't allow hats or caps. | 1 |
| This looks like pantyhose. Dzirent doesn't allow pantyhose or tights. | 1 |
| This looks like boots. Dzirent doesn't allow shoes or boots. | 1 |

## The 57 launch types

| Type | Policy | Test photos | Type top-1 | Mapping top-1 | Allowed / review / rejected | V1b test photos | V1b type top-1 | V1b allowed / review / rejected |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| blazer | allowed | 9 | 56% | 78% | 1 / 8 / 0 | 9 | 44% | 0 / 9 / 0 |
| sheath dress | allowed | 4 | 0% | 0% | 0 / 4 / 0 | 4 | 0% | 0 / 4 / 0 |
| suit | allowed | 10 | 30% | 50% | 0 / 10 / 0 | 10 | 20% | 0 / 9 / 1 |
| three-piece suit | allowed | 16 | 81% | 88% | 4 / 12 / 0 | 16 | 81% | 0 / 16 / 0 |
| trousers | allowed | 12 | 33% | 67% | 0 / 10 / 2 | 4 | 0% | 0 / 2 / 2 |
| ball gown | allowed | 16 | 56% | 69% | 3 / 13 / 0 | 16 | 75% | 0 / 16 / 0 |
| bridesmaid's dress | allowed | 8 | 75% | 75% | 2 / 6 / 0 | 4 | 50% | 0 / 4 / 0 |
| cocktail dress | allowed | 15 | 53% | 60% | 1 / 14 / 0 | 15 | 87% | 0 / 15 / 0 |
| dinner jacket | allowed | 10 | 40% | 70% | 4 / 6 / 0 | 10 | 20% | 0 / 10 / 0 |
| débutante dress | allowed | 2 | 50% | 100% | 0 / 2 / 0 | 0 |  | 0 / 0 / 0 |
| evening dress | allowed | 11 | 36% | 64% | 0 / 11 / 0 | 0 |  | 0 / 0 / 0 |
| jumpsuit | allowed | 10 | 60% | 70% | 0 / 10 / 0 | 4 | 50% | 0 / 4 / 0 |
| party dress | allowed | 8 | 25% | 50% | 0 / 8 / 0 | 8 | 38% | 0 / 8 / 0 |
| tuxedo | allowed | 12 | 58% | 83% | 6 / 6 / 0 | 12 | 67% | 0 / 12 / 0 |
| achkan | allowed | 0 |  |  | 0 / 0 / 0 | 0 |  | 0 / 0 / 0 |
| Anarkali Salwar Suit | allowed | 2 | 50% | 100% | 1 / 1 / 0 | 2 | 100% | 0 / 2 / 0 |
| boubou | allowed | 11 | 64% | 73% | 2 / 9 / 0 | 11 | 45% | 0 / 11 / 0 |
| cheongsam (qipao) | allowed | 10 | 90% | 100% | 7 / 3 / 0 | 10 | 80% | 3 / 7 / 0 |
| China Poblana | allowed | 7 | 71% | 71% | 2 / 5 / 0 | 2 | 50% | 0 / 2 / 0 |
| dashiki | allowed | 5 | 40% | 60% | 0 / 5 / 0 | 4 | 50% | 0 / 4 / 0 |
| guayabera | allowed | 9 | 78% | 78% | 1 / 8 / 0 | 6 | 83% | 0 / 6 / 0 |
| hanbok | allowed | 11 | 64% | 82% | 2 / 9 / 0 | 11 | 45% | 0 / 11 / 0 |
| huipil | allowed | 9 | 100% | 100% | 5 / 4 / 0 | 9 | 100% | 0 / 9 / 0 |
| kurta | allowed | 13 | 69% | 77% | 5 / 8 / 0 | 10 | 70% | 0 / 10 / 0 |
| lehenga | allowed | 15 | 60% | 60% | 3 / 12 / 0 | 15 | 60% | 1 / 14 / 0 |
| Nehru jacket | allowed | 2 | 0% | 0% | 1 / 1 / 0 | 1 | 0% | 0 / 1 / 0 |
| sari | allowed | 12 | 67% | 92% | 7 / 5 / 0 | 9 | 78% | 0 / 9 / 0 |
| shalwar kameez | allowed | 13 | 31% | 46% | 1 / 12 / 0 | 8 | 25% | 0 / 8 / 0 |
| Sherwani | allowed | 3 | 67% | 67% | 0 / 2 / 1 | 2 | 100% | 0 / 2 / 0 |
| blouse | allowed | 6 | 0% | 0% | 1 / 4 / 1 | 2 | 0% | 0 / 2 / 0 |
| cardigan | allowed | 8 | 38% | 62% | 0 / 7 / 1 | 8 | 25% | 0 / 7 / 1 |
| day dress | allowed | 13 | 54% | 69% | 2 / 11 / 0 | 4 | 75% | 0 / 4 / 0 |
| skirt | allowed | 15 | 40% | 93% | 2 / 11 / 2 | 5 | 20% | 0 / 4 / 1 |
| sundress | allowed | 13 | 62% | 69% | 2 / 10 / 1 | 7 | 43% | 0 / 6 / 1 |
| down jacket | allowed | 9 | 89% | 89% | 0 / 9 / 0 | 9 | 33% | 0 / 6 / 3 |
| leather jacket | allowed | 11 | 64% | 73% | 4 / 7 / 0 | 11 | 73% | 0 / 11 / 0 |
| overcoat | allowed | 14 | 43% | 86% | 1 / 12 / 1 | 4 | 25% | 0 / 4 / 0 |
| trench coat | allowed | 13 | 69% | 85% | 6 / 6 / 1 | 10 | 70% | 0 / 10 / 0 |
| costume jewelry | allowed | 9 | 33% | 89% | 2 / 7 / 0 | 9 | 22% | 0 / 9 / 0 |
| handbag | allowed | 9 | 89% | 100% | 5 / 4 / 0 | 9 | 78% | 0 / 8 / 1 |
| necktie | allowed | 15 | 53% | 100% | 9 / 6 / 0 | 8 | 62% | 0 / 8 / 0 |
| sunglasses | allowed | 10 | 80% | 100% | 9 / 1 / 0 | 10 | 90% | 5 / 5 / 0 |
| wristwatch | allowed | 16 | 69% | 94% | 10 / 5 / 1 | 16 | 50% | 0 / 15 / 1 |
| cap | not allowed | 10 | 30% | 70% | 0 / 5 / 5 | 10 | 40% | 0 / 2 / 8 |
| hat | not allowed | 11 | 45% | 82% | 1 / 3 / 7 | 11 | 36% | 0 / 3 / 8 |
| hoodie | not allowed | 14 | 57% | 64% | 0 / 5 / 9 | 14 | 50% | 0 / 3 / 11 |
| jeans | not allowed | 13 | 23% | 54% | 0 / 5 / 8 | 13 | 23% | 0 / 3 / 10 |
| lingerie | not allowed | 14 | 64% | 100% | 0 / 1 / 13 | 7 | 43% | 0 / 0 / 7 |
| shoe | not allowed | 16 | 62% | 94% | 0 / 2 / 14 | 10 | 30% | 0 / 1 / 9 |
| shorts | not allowed | 12 | 25% | 58% | 0 / 4 / 8 | 12 | 33% | 0 / 0 / 12 |
| smartwatch | not allowed | 14 | 64% | 64% | 0 / 1 / 13 | 14 | 100% | 0 / 0 / 14 |
| sports jersey | not allowed | 16 | 19% | 88% | 0 / 1 / 15 | 16 | 25% | 0 / 0 / 16 |
| sweatshirt | not allowed | 15 | 53% | 73% | 0 / 2 / 13 | 15 | 53% | 0 / 1 / 14 |
| swimsuit | not allowed | 11 | 9% | 9% | 0 / 3 / 8 | 5 | 40% | 0 / 1 / 4 |
| t-shirt | not allowed | 11 | 73% | 82% | 0 / 4 / 7 | 11 | 27% | 0 / 4 / 7 |
| tracksuit bottoms | not allowed | 9 | 33% | 44% | 0 / 5 / 4 | 8 | 12% | 0 / 3 / 5 |
| undergarment | not allowed | 14 | 43% | 64% | 0 / 2 / 12 | 6 | 0% | 0 / 0 / 6 |

## Thresholds used

| Name | Value |
| --- | --- |
| `text_logit_scale` | 100.0 |
| `text_top` | 5 |
| `gallery_k` | 10 |
| `disagreement_factor` | 0.5 |
| `type_min_confidence` | 0.6 |
| `banned_min` | 0.1 |
| `banned_hard` | 0.91 |
| `banned_rule` | max |
| `weight_text` | 0.6 |
| `weight_gallery` | 0.1 |
| `weight_linear` | 0.3 |
| `text_poster_min` | 0.25 |

Each value's reason is in `services/vision/app/thresholds.json` and the V2 handoff.

## The owner's folders

`H:\DziRent\vision-test` is a local exam: read on this PC, never copied into the dataset and never
listed by name in the repo. Files are numbered in sorted-name order. Each went through the full scan
(quality and colors included) as a one-photo listing.

- `should-accept`: 32 photos: 17 review, 15 allowed.

| File | Verdict | Type | Confidence | Agreement | Mapping | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| file 1 | review | kurta | 0.4755 | True | Cultural & Traditional / top | We're not sure what this piece is, so someone at Dzirent will check the photos. |
| file 2 | review | kurta | 0.2203 | False | Cultural & Traditional / top | We're not sure what this piece is, so someone at Dzirent will check the photos. |
| file 3 | allowed | kurta | 0.7212 | True | Cultural & Traditional / top | This looks like a kurta. You can list it. |
| file 4 | allowed | Sherwani | 0.6793 | True | Cultural & Traditional / suit | This looks like a Sherwani. You can list it. |
| file 5 | review | kurta | 0.1989 | False | Cultural & Traditional / top | We're not sure what this piece is, so someone at Dzirent will check the photos. |
| file 6 | allowed | Sherwani | 0.6764 | True | Cultural & Traditional / suit | This looks like a Sherwani. You can list it. |
| file 7 | review | kurta | 0.253 | False | Cultural & Traditional / top | We're not sure what this piece is, so someone at Dzirent will check the photos. |
| file 8 | allowed | Sherwani | 0.7465 | True | Cultural & Traditional / suit | This looks like a Sherwani. You can list it. |
| file 9 | allowed | Sherwani | 0.7425 | True | Cultural & Traditional / suit | This looks like a Sherwani. You can list it. |
| file 10 | allowed | kurta | 0.7399 | True | Cultural & Traditional / top | This looks like a kurta. You can list it. |
| file 11 | review | Sherwani | 0.1155 | False | Cultural & Traditional / suit | We're not sure what this piece is, so someone at Dzirent will check the photos. |
| file 12 | review | Sherwani | 0.697 | True | Cultural & Traditional / suit | This piece has a hood, so someone at Dzirent will check it. |
| file 13 | review | Sherwani | 0.3385 | True | Cultural & Traditional / suit | We're not sure what this piece is, so someone at Dzirent will check the photos. |
| file 14 | allowed | kurta | 0.662 | True | Cultural & Traditional / top | This looks like a kurta. You can list it. |
| file 15 | review | Sherwani | 0.1845 | False | Cultural & Traditional / suit | We're not sure what this piece is, so someone at Dzirent will check the photos. |
| file 16 | allowed | kurta | 0.6842 | True | Cultural & Traditional / top | This looks like a kurta. You can list it. |
| file 17 | allowed | Sherwani | 0.7668 | True | Cultural & Traditional / suit | This looks like a Sherwani. You can list it. |
| file 18 | review | kurta | 0.2604 | False | Cultural & Traditional / top | We're not sure what this piece is, so someone at Dzirent will check the photos. |
| file 19 | review | Sherwani | 0.1752 | False | Cultural & Traditional / suit | We're not sure what this piece is, so someone at Dzirent will check the photos. |
| file 20 | review | kurta | 0.2086 | False | Cultural & Traditional / top | We're not sure what this piece is, so someone at Dzirent will check the photos. |
| file 21 | review | Sherwani | 0.0869 | False | Cultural & Traditional / suit | We're not sure what this piece is, so someone at Dzirent will check the photos. |
| file 22 | review | kurta | 0.5874 | True | Cultural & Traditional / top | We're not sure what this piece is, so someone at Dzirent will check the photos. |
| file 23 | review | Sherwani | 0.2198 | False | Cultural & Traditional / suit | We're not sure what this piece is, so someone at Dzirent will check the photos. |
| file 24 | review | kurta | 0.5327 | True | Cultural & Traditional / top | We're not sure what this piece is, so someone at Dzirent will check the photos. |
| file 25 | review | Sherwani | 0.2346 | False | Cultural & Traditional / suit | We're not sure what this piece is, so someone at Dzirent will check the photos. |
| file 26 | allowed | kurta | 0.679 | True | Cultural & Traditional / top | This looks like a kurta. You can list it. |
| file 27 | allowed | kurta | 0.65 | True | Cultural & Traditional / top | This looks like a kurta. You can list it. |
| file 28 | allowed | kurta | 0.6346 | True | Cultural & Traditional / top | This looks like a kurta. You can list it. |
| file 29 | allowed | Sherwani | 0.7485 | True | Cultural & Traditional / suit | This looks like a Sherwani. You can list it. |
| file 30 | allowed | kurta | 0.6473 | True | Cultural & Traditional / top | This looks like a kurta. You can list it. |
| file 31 | review | Sherwani | 0.3049 | False | Cultural & Traditional / suit | We're not sure what this piece is, so someone at Dzirent will check the photos. |
| file 32 | allowed | kurta | 0.8997 | True | Cultural & Traditional / top | This looks like a kurta. You can list it. |

- `should-reject`: no photos in `H:\DziRent\vision-test\should-reject`.
