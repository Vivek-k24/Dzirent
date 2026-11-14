# Error and warning codes

<!-- Generated from contracts/error-codes.json by contracts/generate.mjs. Do not edit. -->

The one source is `contracts/error-codes.json`; this table is generated from it. Errors are `DZ-E####`, warnings `DZ-W####`. The database starts each refusal's message with its code (`DZ-E2010: Add a photo first`) and puts the field in the HINT; Edge Functions answer `{ code, message }` with the status below. Apps and the website show the message for the code (the server's own words when "Server words" is yes), then the code in brackets; an unknown code shows the server's words, and anything else `DZ-E9999`.

## 1xxx - Account, sign-in, terms, age

| Code | Kind | Area | Status | Field | Server words | Message |
| --- | --- | --- | --- | --- | --- | --- |
| `DZ-E1001` | error | account | 401 |  |  | Not signed in |
| `DZ-E1002` | error | account | 401 |  |  | Your session may have expired. Please log out and log in again. |
| `DZ-E1003` | error | account | 401 |  |  | Please sign in again. |
| `DZ-E1004` | error | sign-in | 400 |  |  | Email or password is incorrect. |
| `DZ-E1005` | error | sign-in | 403 |  |  | Please confirm your email first. Check your inbox for the link. |
| `DZ-E1006` | error | sign-in | 409 | `email` |  | An account with this email already exists. Try logging in. |
| `DZ-E1007` | error | sign-in | 400 | `password` |  | That password is too weak. Use at least 8 characters. |
| `DZ-E1008` | error | sign-in | 429 |  |  | Too many attempts. Please try again later. |
| `DZ-E1009` | error | account | 403 |  |  | Invalid profile creation context |
| `DZ-E1010` | error | terms | 403 |  |  | Please accept the updated Terms of Use and Privacy Policy to continue. |
| `DZ-E1011` | error | account | 400 | `platform` |  | Invalid platform |
| `DZ-E1012` | error | account | 400 | `platform` |  | Unknown platform |
| `DZ-E1020` | error | account | 403 |  |  | Give consent before saving your measurements. |
| `DZ-E1030` | error | age | 403 |  |  | Dzirent is only for people 18 and older. |
| `DZ-E1031` | error | age | 400 |  |  | Unknown age check source |
| `DZ-E1032` | error | age | 400 |  |  | Unknown age check result |
| `DZ-E1040` | error | account | 403 |  | yes | Your account is suspended. |
| `DZ-E1050` | error | text | 400 |  |  | This text includes language that isn't allowed on Dzirent. |
| `DZ-E1051` | error | account | 400 |  |  | Please remove contact details from your profile; people can message you in Dzirent. |
| `DZ-E1052` | error | text | 400 |  |  | Unknown place for the text check |
| `DZ-E1053` | error | text | 400 |  |  | Text too long |
| `DZ-E1060` | error | account | 400 |  |  | Invalid push token |

## 2xxx - Listings, photos, photo checks

| Code | Kind | Area | Status | Field | Server words | Message |
| --- | --- | --- | --- | --- | --- | --- |
| `DZ-E2001` | error | listings | 403 |  |  | Not your listing |
| `DZ-E2002` | error | listings | 404 |  |  | Listing not found. |
| `DZ-E2003` | error | listings | 400 |  |  | A valid listing_id is required. |
| `DZ-E2004` | error | listings | 503 |  |  | Couldn't load the listing. Please try again. |
| `DZ-E2005` | error | listings | 503 |  |  | Deletion is unavailable. Please try again. |
| `DZ-E2006` | error | listings | 409 |  |  | Couldn't delete the listing. Stop uploading photos and retry. |
| `DZ-E2007` | error | listings | 503 |  |  | Couldn't delete the listing. Please retry. |
| `DZ-E2010` | error | photos | 400 |  |  | Add a photo first |
| `DZ-E2011` | error | scans | 503 |  |  | Photo checks are not set up |
| `DZ-E2020` | error | scans | 409 |  |  | Check the photos before publishing this listing. |
| `DZ-E2021` | error | scans | 409 |  |  | The photo check is still running. Try again in a minute. |
| `DZ-E2022` | error | scans | 409 |  |  | The photos changed after they were checked. Check them again before publishing. |
| `DZ-E2023` | error | scans | 409 |  | yes | This listing can't be published yet. |
| `DZ-E2024` | error | scans | 409 |  |  | Scan is not running |
| `DZ-E2025` | error | scans | 400 |  |  | Bad scan result |
| `DZ-E2030` | error | listings | 403 |  | yes | This listing is hidden by Dzirent. Contact support if you think this is a mistake. |
| `DZ-E2040` | error | listings | 403 |  |  | Sign the accessory declaration before listing accessories. |
| `DZ-E2041` | error | listings | 400 | `full_legal_name` |  | Type your full legal name |
| `DZ-E2042` | error | listings | 400 |  |  | Unknown declaration version |
| `DZ-E2050` | error | listings | 400 |  |  | Please remove contact details from your listing; people can message you in Dzirent. |
| `DZ-E2060` | error | photos | 403 |  |  | Invalid photo context |
| `DZ-E2061` | error | photos | 400 |  |  | Use listing_id/random.ext for photos |
| `DZ-E2062` | error | photos | 403 |  |  | Not your listing folder |
| `DZ-E2063` | error | photos | 409 |  |  | Remove listing photos through the Storage API before deleting the listing. |
| `DZ-E2064` | error | photos | 415 |  |  | Choose a JPEG, PNG or WebP photo. |
| `DZ-E2065` | error | photos | 413 |  |  | This photo is too big. Choose one under 10 MB. |
| `DZ-E2066` | error | photos | 503 |  |  | Couldn't remove the photos. Please retry. |
| `DZ-E2067` | error | photos | 409 |  |  | Couldn't remove all photos. Please retry. |
| `DZ-W2001` | warning | photos | 200 |  |  | Too blurry: hold steady and retake |
| `DZ-W2002` | warning | photos | 200 |  |  | Too dark: try daylight |
| `DZ-W2003` | warning | photos | 200 |  |  | Too bright: avoid direct sun and flash |
| `DZ-W2004` | warning | photos | 200 |  |  | Strong glare: move out of direct light |
| `DZ-W2005` | warning | photos | 200 |  |  | Top of the item is cut off |
| `DZ-W2006` | warning | photos | 200 |  |  | Bottom of the item is cut off |
| `DZ-W2007` | warning | photos | 200 |  |  | Left side of the item is cut off |
| `DZ-W2008` | warning | photos | 200 |  |  | Right side of the item is cut off |

## 3xxx - Chat, saving, blocking

| Code | Kind | Area | Status | Field | Server words | Message |
| --- | --- | --- | --- | --- | --- | --- |
| `DZ-E3001` | error | chat | 403 |  |  | Invalid conversation |
| `DZ-E3002` | error | chat | 403 |  |  | Listing unavailable for conversation |
| `DZ-E3003` | error | chat | 409 |  |  | Listing not available |
| `DZ-E3004` | error | chat | 400 |  |  | Cannot message your own listing |
| `DZ-E3005` | error | blocking | 403 |  |  | You can't message this user. |
| `DZ-E3006` | error | chat | 400 | `dates` |  | Invalid dates |
| `DZ-E3007` | error | chat | 403 |  |  | Only the renter can set dates for this chat |
| `DZ-E3010` | error | saving | 403 |  |  | Cannot save blocked studio |
| `DZ-E3020` | error | blocking | 403 |  |  | Not your block relationship |

## 4xxx - Rentals, condition photos (C3); payments, deposits, claims (C4)

| Code | Kind | Area | Status | Field | Server words | Message |
| --- | --- | --- | --- | --- | --- | --- |
| `DZ-E4001` | error | rentals | 404 |  |  | Rental not found |
| `DZ-E4002` | error | rentals | 403 |  |  | Only the lender can do this. |
| `DZ-E4003` | error | rentals | 403 |  |  | You can't rent with this person. |
| `DZ-E4004` | error | rentals | 400 |  |  | You can't rent your own piece. |
| `DZ-E4005` | error | rentals | 400 | `dates` |  | Choose the dates you want to rent. |
| `DZ-E4006` | error | rentals | 400 | `dates` |  | Pick dates from today on. |
| `DZ-E4007` | error | rentals | 400 | `dates` |  | The last day can't be before the first day. |
| `DZ-E4008` | error | rentals | 409 | `dates` |  | Those dates aren't open for this piece. Pick dates inside its available dates. |
| `DZ-E4009` | error | rentals | 409 | `dates` |  | Those dates are already booked. Pick other dates. |
| `DZ-E4010` | error | rentals | 409 |  |  | You already have a rental for this piece in progress. |
| `DZ-E4011` | error | rentals | 409 |  |  | This piece isn't available to rent right now. |
| `DZ-E4012` | error | rentals | 409 |  |  | This rental can't be changed now. |
| `DZ-E4013` | error | rentals | 409 |  |  | This request has expired. |
| `DZ-E4014` | error | rentals | 409 |  |  | This rental can't be cancelled now. |
| `DZ-E4016` | error | rentals | 400 |  |  | Answer accept or decline. |
| `DZ-E4017` | error | rentals | 400 | `note` |  | Keep the note under 300 characters. |
| `DZ-E4018` | error | rentals | 409 |  |  | To turn down a request, decline it. |
| `DZ-E4020` | error | condition photos | 409 | `photos` |  | Add at least 2 photos of the piece first. |
| `DZ-E4021` | error | condition photos | 403 |  |  | Photos for this step can't be added now. |
| `DZ-E4022` | error | condition photos | 503 |  |  | Couldn't load the condition photos. Please try again. |
| `DZ-E4030` | error | payments | 503 |  |  | Payments aren't available yet. |
| `DZ-E4031` | error | payments | 409 |  |  | The lender hasn't finished setting up payouts yet. |
| `DZ-E4032` | error | payments | 403 |  |  | Only the renter can do this. |
| `DZ-E4033` | error | payments | 409 |  |  | Place the deposit hold before marking the piece picked up. |
| `DZ-E4034` | error | payments | 409 |  |  | There's no saved card for this rental. |
| `DZ-E4035` | error | payments | 402 |  |  | The deposit hold couldn't be placed. Ask the renter to check their card. |
| `DZ-E4036` | error | payments | 502 |  |  | The payment service didn't answer. Please try again. |
| `DZ-E4037` | error | payments | 403 |  |  | Only lenders can set up payouts. |
| `DZ-E4038` | error | payments | 400 |  |  | This payment event isn't signed correctly. |
| `DZ-E4039` | error | payments | 409 |  |  | This rental has no deposit hold to change. |
| `DZ-E4040` | error | claims | 409 |  |  | Claims can be filed only after the return, until the claim window ends. |
| `DZ-E4041` | error | claims | 400 | `amount` | yes | Claim an amount above $0 and up to the deposit. |
| `DZ-E4042` | error | claims | 400 | `reason` |  | Give a reason for the claim (3 to 500 characters). |
| `DZ-E4043` | error | claims | 400 | `photos` |  | Add at least one return photo of this rental as evidence. |
| `DZ-E4044` | error | claims | 404 |  |  | Claim not found |
| `DZ-E4045` | error | claims | 409 |  |  | This claim can't be changed now. |
| `DZ-E4046` | error | claims | 400 |  |  | Answer accept or dispute. |
| `DZ-E4047` | error | claims | 409 |  |  | This rental has no deposit to claim from. |
| `DZ-E4048` | error | claims | 409 |  |  | A claim was already filed for this rental. |

## 5xxx - Reports, moderation, admin

| Code | Kind | Area | Status | Field | Server words | Message |
| --- | --- | --- | --- | --- | --- | --- |
| `DZ-E5001` | error | admin | 403 |  |  | Admins only |
| `DZ-E5002` | error | admin | 403 |  |  | Sign in with two-step verification to use admin tools |
| `DZ-E5003` | error | admin | 403 |  |  | Enter a new two-step code to keep using admin tools |
| `DZ-E5004` | error | admin | 403 |  |  | The admin log is append-only |
| `DZ-E5005` | error | reports | 403 |  |  | Report evidence never changes |
| `DZ-E5006` | error | admin | 400 | `reason` |  | Give a reason (at least 3 characters) |
| `DZ-E5007` | error | admin | 400 | `reason` |  | Give a reason of at most 500 characters. |
| `DZ-E5008` | error | admin | 403 |  |  | Admins only, signed in with two-step verification. |
| `DZ-E5009` | error | admin | 400 |  |  | Unknown action. |
| `DZ-E5010` | error | reports | 404 |  |  | Report not found |
| `DZ-E5011` | error | reports | 409 |  |  | This report is already closed |
| `DZ-E5012` | error | reports | 403 |  |  | You can only report messages in your own chats. |
| `DZ-E5013` | error | reports | 400 | `reason` |  | Reason is required |
| `DZ-E5014` | error | admin | 400 |  |  | Pick a report |
| `DZ-E5015` | error | reports | 403 |  |  | You can only report your own rentals. |
| `DZ-E5016` | error | admin | 409 |  |  | A rental report has no content to remove. Warn, suspend or dismiss instead. |
| `DZ-E5020` | error | admin | 404 |  |  | User not found |
| `DZ-E5021` | error | admin | 409 |  |  | Admins can't ban themselves |
| `DZ-E5022` | error | admin | 409 |  |  | Admins can't suspend themselves |
| `DZ-E5023` | error | admin | 400 | `days` |  | Suspend for 1 to 3650 days |
| `DZ-E5024` | error | admin | 502 |  |  | Couldn't change the account in Supabase Auth. |
| `DZ-E5025` | error | admin | 500 |  |  | The account was changed in Supabase Auth, but the record couldn't be saved. Try again. |
| `DZ-E5030` | error | admin | 404 |  |  | Listing not found |
| `DZ-E5031` | error | admin | 404 |  |  | Photo check not found |
| `DZ-E5032` | error | admin | 409 |  |  | This photo check hasn't finished |
| `DZ-E5033` | error | admin | 400 |  |  | Decide approved or rejected |
| `DZ-E5034` | error | admin | 400 |  |  | Pick the photos to remove |
| `DZ-E5035` | error | admin | 500 |  |  | Couldn't remove the photos. Try again. |
| `DZ-E5036` | error | admin | 502 |  |  | The photo records were removed, but the files couldn't be deleted. Try again. |
| `DZ-E5040` | error | admin | 400 |  |  | Claimant name, contact and the work are required |
| `DZ-E5041` | error | admin | 404 |  |  | Takedown request not found |
| `DZ-E5042` | error | admin | 400 |  |  | Unknown takedown status |
| `DZ-E5043` | error | admin | 400 |  |  | Enter the counter-notice |
| `DZ-E5050` | error | admin | 400 |  |  | Say on or off |
| `DZ-E5051` | error | admin | 404 |  |  | Unknown flag |
| `DZ-E5052` | error | admin | 400 |  |  | Search for an email, handle or account id |
| `DZ-E5060` | error | admin | 404 |  |  | Background job not found |
| `DZ-E5061` | error | admin | 409 |  |  | Only a dead background job can be retried |
| `DZ-E5070` | error | admin settings | 400 | `value` | yes | This value is outside the setting's allowed range. |
| `DZ-E5071` | error | admin settings | 404 |  |  | Setting not found |
| `DZ-E5072` | error | admin settings | 400 | `value` | yes | This value isn't the right kind for this setting. |
| `DZ-E5080` | error | admin rentals | 400 |  |  | Choose cancelled or completed. |
| `DZ-E5081` | error | admin rentals | 409 |  |  | This rental has already ended. |
| `DZ-E5082` | error | admin rentals | 409 |  |  | Only a rental that was picked up can be ended as completed. |
| `DZ-E5083` | error | admin rentals | 400 |  |  | Choose what happens to the deposit hold: release or capture. |
| `DZ-E5084` | error | admin payments | 400 | `amount` | yes | Refund an amount above $0 and up to what is still paid. |
| `DZ-E5085` | error | admin payments | 409 |  |  | This rental has no payment to refund. |
| `DZ-E5086` | error | admin payments | 400 | `amount` | yes | Capture from $0 up to the deposit amount. |

## 6xxx - ID verification (reserved)

Reserved: no codes yet.

## 7xxx - Data download, account deletion

| Code | Kind | Area | Status | Field | Server words | Message |
| --- | --- | --- | --- | --- | --- | --- |
| `DZ-E7001` | error | data download | 429 |  | yes | You can download your data once a day. |
| `DZ-E7002` | error | data download | 500 |  |  | Couldn't prepare your data. Please try again. |
| `DZ-E7003` | error | data download | 503 |  |  | Downloading your data is unavailable right now. Please try again later. |
| `DZ-E7010` | error | deletion | 409 |  |  | You have a rental in progress. Finish or cancel it in its chat (My rentals), then delete your account. |
| `DZ-E7011` | error | deletion | 503 |  |  | Account deletion is unavailable. Please try again. |
| `DZ-E7012` | error | deletion | 503 |  |  | Couldn't verify rental status. Please try again. |
| `DZ-E7013` | error | deletion | 503 |  |  | Couldn't load your listings. Please try again. |
| `DZ-E7014` | error | deletion | 503 |  |  | Couldn't remove listing photos. Please retry. |
| `DZ-E7015` | error | deletion | 503 |  |  | Couldn't delete your account. Please try again. |

## 9xxx - System

| Code | Kind | Area | Status | Field | Server words | Message |
| --- | --- | --- | --- | --- | --- | --- |
| `DZ-E9001` | error | system | 429 |  |  | You're doing that too often. Try again in a bit. |
| `DZ-E9002` | error | system | 503 |  |  | Can't reach the server. Check your internet connection and try again. |
| `DZ-E9003` | error | system | 503 |  |  | This service is unavailable right now. Please try again later. |
| `DZ-E9004` | error | system | 401 |  |  | This request isn't allowed. |
| `DZ-E9005` | error | system | 405 |  |  | Use POST. |
| `DZ-E9010` | error | system | 400 |  |  | Send a JSON object. |
| `DZ-E9011` | error | system | 400 |  |  | This request has fields that aren't accepted. |
| `DZ-E9012` | error | system | 400 |  |  | This request is missing required fields. |
| `DZ-E9013` | error | system | 413 |  |  | This request is too large. |
| `DZ-E9014` | error | system | 400 |  |  | This request couldn't be read. |
| `DZ-E9015` | error | system | 400 |  |  | Unknown file job |
| `DZ-E9016` | error | system | 400 |  |  | This request isn't valid. |
| `DZ-E9020` | error | system | 500 |  |  | A setting is missing. Please try again later. |
| `DZ-E9999` | error | system | 500 |  |  | Something went wrong. Please try again. |

177 codes: 169 errors, 8 warnings.
