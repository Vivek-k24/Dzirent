# Vision V1b: evaluation on the locked test split

Written by `services/vision/eval/run_eval.py --local` (service `v1b.1`). Every test photo of a type with a
text pin was scanned on this PC as a one-photo listing (slot front) by the service's own model and
`scan.listing_verdict`. The test split (`data/vision/images/split.json`) is never in the gallery and was
never used to choose the thresholds (those come from the train split, `eval/calibrate.py`).

- Pins: vocabulary `69eb998d7fbb4296`, 843 text pins, 8094 gallery pins; policy digest `30466e8f3a812d8c`.
- Test photos scanned: 1928 of 488 types (0 more belong to review types, which have no pin).

## Overall

| Set | Photos | Type top-1 | Top-3 (text pins) | Text top-1 | Gallery top-1 | Agreement | Allowed | Review | Rejected |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| All | 1928 | 51% | 42% | 24% | 55% | 20% | 35 | 1244 | 649 |
| Allowed types | 1214 | 49% | 43% | 24% | 52% | 19% | 35 | 1115 | 64 |
| Not-allowed types | 714 | 55% | 41% | 23% | 60% | 23% | 0 | 129 | 585 |

Type top-1: the type the rules decided (text and gallery together) is the photo's own type. Top-3 (text pins):
the photo's type is among the 3 most likely text pins (top_types). Text and gallery top-1: each source on its own.

## Allowed / not allowed against the verdict

| Photo's type | Allowed | Review | Rejected |
| --- | --- | --- | --- |
| allowed | 35 | 1115 | 64 |
| not allowed | 0 | 129 | 585 |

## Banned leaks: 0

Not-allowed test photos whose verdict is allowed: the number V2 must drive to zero and keep there, while allowing
far more of the allowed photos (see the table above).

None.

## The 57 launch types

| Type | Policy | Test photos | Type top-1 | Top-3 (text pins) | Allowed | Review | Rejected |
| --- | --- | --- | --- | --- | --- | --- | --- |
| blazer | allowed | 9 | 44% | 0% | 0 | 9 | 0 |
| sheath dress | allowed | 4 | 0% | 0% | 0 | 4 | 0 |
| suit | allowed | 10 | 20% | 0% | 0 | 9 | 1 |
| three-piece suit | allowed | 16 | 81% | 25% | 0 | 16 | 0 |
| trousers | allowed | 4 | 0% | 0% | 0 | 2 | 2 |
| ball gown | allowed | 16 | 75% | 25% | 0 | 16 | 0 |
| bridesmaid's dress | allowed | 4 | 50% | 25% | 0 | 4 | 0 |
| cocktail dress | allowed | 15 | 87% | 53% | 0 | 15 | 0 |
| dinner jacket | allowed | 10 | 20% | 50% | 0 | 10 | 0 |
| débutante dress | allowed | 0 |  |  | 0 | 0 | 0 |
| evening dress | allowed | 0 |  |  | 0 | 0 | 0 |
| jumpsuit | allowed | 4 | 50% | 0% | 0 | 4 | 0 |
| party dress | allowed | 8 | 38% | 0% | 0 | 8 | 0 |
| tuxedo | allowed | 12 | 67% | 83% | 0 | 12 | 0 |
| achkan | allowed | 0 |  |  | 0 | 0 | 0 |
| Anarkali Salwar Suit | allowed | 2 | 100% | 100% | 0 | 2 | 0 |
| boubou | allowed | 11 | 45% | 73% | 0 | 11 | 0 |
| cheongsam (qipao) | allowed | 10 | 80% | 100% | 3 | 7 | 0 |
| China Poblana | allowed | 2 | 50% | 100% | 0 | 2 | 0 |
| dashiki | allowed | 4 | 50% | 100% | 0 | 4 | 0 |
| guayabera | allowed | 6 | 83% | 67% | 0 | 6 | 0 |
| hanbok | allowed | 11 | 45% | 0% | 0 | 11 | 0 |
| huipil | allowed | 9 | 100% | 44% | 0 | 9 | 0 |
| kurta | allowed | 10 | 70% | 70% | 0 | 10 | 0 |
| lehenga | allowed | 15 | 60% | 80% | 1 | 14 | 0 |
| Nehru jacket | allowed | 1 | 0% | 100% | 0 | 1 | 0 |
| sari | allowed | 9 | 78% | 56% | 0 | 9 | 0 |
| shalwar kameez | allowed | 8 | 25% | 50% | 0 | 8 | 0 |
| Sherwani | allowed | 2 | 100% | 100% | 0 | 2 | 0 |
| blouse | allowed | 2 | 0% | 0% | 0 | 2 | 0 |
| cardigan | allowed | 8 | 25% | 25% | 0 | 7 | 1 |
| day dress | allowed | 4 | 75% | 0% | 0 | 4 | 0 |
| skirt | allowed | 5 | 20% | 0% | 0 | 4 | 1 |
| sundress | allowed | 7 | 43% | 43% | 0 | 6 | 1 |
| down jacket | allowed | 9 | 33% | 44% | 0 | 6 | 3 |
| leather jacket | allowed | 11 | 73% | 55% | 0 | 11 | 0 |
| overcoat | allowed | 4 | 25% | 0% | 0 | 4 | 0 |
| trench coat | allowed | 10 | 70% | 90% | 0 | 10 | 0 |
| costume jewelry | allowed | 9 | 22% | 44% | 0 | 9 | 0 |
| handbag | allowed | 9 | 78% | 100% | 0 | 8 | 1 |
| necktie | allowed | 8 | 62% | 100% | 0 | 8 | 0 |
| sunglasses | allowed | 10 | 90% | 100% | 5 | 5 | 0 |
| wristwatch | allowed | 16 | 50% | 0% | 0 | 15 | 1 |
| cap | not allowed | 10 | 40% | 50% | 0 | 2 | 8 |
| hat | not allowed | 11 | 36% | 36% | 0 | 3 | 8 |
| hoodie | not allowed | 14 | 50% | 29% | 0 | 3 | 11 |
| jeans | not allowed | 13 | 23% | 0% | 0 | 3 | 10 |
| lingerie | not allowed | 7 | 43% | 71% | 0 | 0 | 7 |
| shoe | not allowed | 10 | 30% | 70% | 0 | 1 | 9 |
| shorts | not allowed | 12 | 33% | 0% | 0 | 0 | 12 |
| smartwatch | not allowed | 14 | 100% | 79% | 0 | 0 | 14 |
| sports jersey | not allowed | 16 | 25% | 56% | 0 | 0 | 16 |
| sweatshirt | not allowed | 15 | 53% | 27% | 0 | 1 | 14 |
| swimsuit | not allowed | 5 | 40% | 40% | 0 | 1 | 4 |
| t-shirt | not allowed | 11 | 27% | 73% | 0 | 4 | 7 |
| tracksuit bottoms | not allowed | 8 | 12% | 25% | 0 | 3 | 5 |
| undergarment | not allowed | 6 | 0% | 17% | 0 | 0 | 6 |

## Thresholds used

| Name | Value |
| --- | --- |
| `text_logit_scale` | 100.0 |
| `text_top` | 5 |
| `gallery_k` | 10 |
| `disagreement_factor` | 0.5 |
| `type_min_confidence` | 0.7 |
| `banned_min` | 0.6 |

Each value's reason is in `services/vision/app/thresholds.json` and the V1b handoff.

## The owner's folders

- `should-accept`: no photos in `H:\DziRent\vision-test\should-accept`.
- `should-reject`: no photos in `H:\DziRent\vision-test\should-reject`.
