-- P2A: content safety text filter, in the database so the website, Android and iPhone all get it.
-- - Language that isn't allowed (the LDNOOBW English list: slurs, hate terms, sexually explicit
--   terms) is refused everywhere people write: listing text, profile and studio text, chat
--   messages and reports.
-- - Contact details and outside links (phone numbers, email addresses, URLs, @handles) are
--   refused in public text only (listings and profiles); chat allows them.
-- Matching is on whole words after normalizing case, accents, repeated letters and common
-- character swaps, so a list word is never found inside another word ("cocktail", "classic").
-- Existing rows are not changed: the triggers check a column only when it is inserted or changes.
-- Refusals are P0001 with the plain-words message, and HINT names the column that failed.

create extension if not exists unaccent with schema extensions;

-- 1. Normalizing. Lower case, accents removed, 0 1 3 4 5 7 @ $ ! read as o i e a s t a s i,
-- and everything that isn't a letter or digit becomes one space.
create or replace function app_private.filter_normalize(p_text text)
returns text
language sql
stable
set search_path = ''
as $function$
  select pg_catalog.btrim(pg_catalog.regexp_replace(
    pg_catalog.translate(
      pg_catalog.lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_text, ''))),
      '013457@$!', 'oieastasi'),
    '[^a-z0-9]+', ' ', 'g'));
$function$;

-- A term as a whole-word pattern over ' ' || normalized text || ' ', each letter allowed to
-- repeat ("f+u+c+k+" also finds "fuuuck"). The lookahead keeps the next word's space free.
create or replace function app_private.filter_pattern(p_term text)
returns text
language sql
stable
set search_path = ''
as $function$
  select ' ' || pg_catalog.regexp_replace(app_private.filter_normalize(p_term), '([a-z0-9])', '\1+', 'g') || '(?= )';
$function$;

-- 2. The lists. Not exposed through the API: only the elevated check below reads them.
create table app_private.text_filter_terms (
  term text not null,
  pattern text not null,
  source text not null,
  constraint text_filter_terms_pkey primary key (term)
);
-- Words and phrases in the list that are ordinary on a clothing marketplace. They are masked
-- out of the text before matching ("nude heels", "tied up at the waist", "pussy-bow blouse").
create table app_private.text_filter_allowed (
  phrase text not null,
  pattern text not null,
  note text not null,
  constraint text_filter_allowed_pkey primary key (phrase)
);
alter table app_private.text_filter_terms enable row level security;
alter table app_private.text_filter_allowed enable row level security;
revoke all on app_private.text_filter_terms, app_private.text_filter_allowed
  from public, anon, authenticated, service_role;

-- List of Dirty, Naughty, Obscene, and Otherwise Bad Words, English, commit 5faf2ba42d7b1c0977169ec3611df25a3c08eb13
-- (https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words), CC BY 4.0.
-- Changes: the one entry that is an emoji is left out (the filter matches words).
insert into app_private.text_filter_terms (term, pattern, source)
select v.term, app_private.filter_pattern(v.term), 'LDNOOBW en 5faf2ba'
from (values
  ('2g1c'),
  ('2 girls 1 cup'),
  ('acrotomophilia'),
  ('alabama hot pocket'),
  ('alaskan pipeline'),
  ('anal'),
  ('anilingus'),
  ('anus'),
  ('apeshit'),
  ('arsehole'),
  ('ass'),
  ('asshole'),
  ('assmunch'),
  ('auto erotic'),
  ('autoerotic'),
  ('babeland'),
  ('baby batter'),
  ('baby juice'),
  ('ball gag'),
  ('ball gravy'),
  ('ball kicking'),
  ('ball licking'),
  ('ball sack'),
  ('ball sucking'),
  ('bangbros'),
  ('bangbus'),
  ('bareback'),
  ('barely legal'),
  ('barenaked'),
  ('bastard'),
  ('bastardo'),
  ('bastinado'),
  ('bbw'),
  ('bdsm'),
  ('beaner'),
  ('beaners'),
  ('beaver cleaver'),
  ('beaver lips'),
  ('beastiality'),
  ('bestiality'),
  ('big black'),
  ('big breasts'),
  ('big knockers'),
  ('big tits'),
  ('bimbos'),
  ('birdlock'),
  ('bitch'),
  ('bitches'),
  ('black cock'),
  ('blonde action'),
  ('blonde on blonde action'),
  ('blowjob'),
  ('blow job'),
  ('blow your load'),
  ('blue waffle'),
  ('blumpkin'),
  ('bollocks'),
  ('bondage'),
  ('boner'),
  ('boob'),
  ('boobs'),
  ('booty call'),
  ('brown showers'),
  ('brunette action'),
  ('bukkake'),
  ('bulldyke'),
  ('bullet vibe'),
  ('bullshit'),
  ('bung hole'),
  ('bunghole'),
  ('busty'),
  ('butt'),
  ('buttcheeks'),
  ('butthole'),
  ('camel toe'),
  ('camgirl'),
  ('camslut'),
  ('camwhore'),
  ('carpet muncher'),
  ('carpetmuncher'),
  ('chocolate rosebuds'),
  ('cialis'),
  ('circlejerk'),
  ('cleveland steamer'),
  ('clit'),
  ('clitoris'),
  ('clover clamps'),
  ('clusterfuck'),
  ('cock'),
  ('cocks'),
  ('coprolagnia'),
  ('coprophilia'),
  ('cornhole'),
  ('coon'),
  ('coons'),
  ('creampie'),
  ('cum'),
  ('cumming'),
  ('cumshot'),
  ('cumshots'),
  ('cunnilingus'),
  ('cunt'),
  ('darkie'),
  ('date rape'),
  ('daterape'),
  ('deep throat'),
  ('deepthroat'),
  ('dendrophilia'),
  ('dick'),
  ('dildo'),
  ('dingleberry'),
  ('dingleberries'),
  ('dirty pillows'),
  ('dirty sanchez'),
  ('doggie style'),
  ('doggiestyle'),
  ('doggy style'),
  ('doggystyle'),
  ('dog style'),
  ('dolcett'),
  ('domination'),
  ('dominatrix'),
  ('dommes'),
  ('donkey punch'),
  ('double dong'),
  ('double penetration'),
  ('dp action'),
  ('dry hump'),
  ('dvda'),
  ('eat my ass'),
  ('ecchi'),
  ('ejaculation'),
  ('erotic'),
  ('erotism'),
  ('escort'),
  ('eunuch'),
  ('fag'),
  ('faggot'),
  ('fecal'),
  ('felch'),
  ('fellatio'),
  ('feltch'),
  ('female squirting'),
  ('femdom'),
  ('figging'),
  ('fingerbang'),
  ('fingering'),
  ('fisting'),
  ('foot fetish'),
  ('footjob'),
  ('frotting'),
  ('fuck'),
  ('fuck buttons'),
  ('fuckin'),
  ('fucking'),
  ('fucktards'),
  ('fudge packer'),
  ('fudgepacker'),
  ('futanari'),
  ('gangbang'),
  ('gang bang'),
  ('gay sex'),
  ('genitals'),
  ('giant cock'),
  ('girl on'),
  ('girl on top'),
  ('girls gone wild'),
  ('goatcx'),
  ('goatse'),
  ('god damn'),
  ('gokkun'),
  ('golden shower'),
  ('goodpoop'),
  ('goo girl'),
  ('goregasm'),
  ('grope'),
  ('group sex'),
  ('g-spot'),
  ('guro'),
  ('hand job'),
  ('handjob'),
  ('hard core'),
  ('hardcore'),
  ('hentai'),
  ('homoerotic'),
  ('honkey'),
  ('hooker'),
  ('horny'),
  ('hot carl'),
  ('hot chick'),
  ('how to kill'),
  ('how to murder'),
  ('huge fat'),
  ('humping'),
  ('incest'),
  ('intercourse'),
  ('jack off'),
  ('jail bait'),
  ('jailbait'),
  ('jelly donut'),
  ('jerk off'),
  ('jigaboo'),
  ('jiggaboo'),
  ('jiggerboo'),
  ('jizz'),
  ('juggs'),
  ('kike'),
  ('kinbaku'),
  ('kinkster'),
  ('kinky'),
  ('knobbing'),
  ('leather restraint'),
  ('leather straight jacket'),
  ('lemon party'),
  ('livesex'),
  ('lolita'),
  ('lovemaking'),
  ('make me come'),
  ('male squirting'),
  ('masturbate'),
  ('masturbating'),
  ('masturbation'),
  ('menage a trois'),
  ('milf'),
  ('missionary position'),
  ('mong'),
  ('motherfucker'),
  ('mound of venus'),
  ('mr hands'),
  ('muff diver'),
  ('muffdiving'),
  ('nambla'),
  ('nawashi'),
  ('negro'),
  ('neonazi'),
  ('nigga'),
  ('nigger'),
  ('nig nog'),
  ('nimphomania'),
  ('nipple'),
  ('nipples'),
  ('nsfw'),
  ('nsfw images'),
  ('nude'),
  ('nudity'),
  ('nutten'),
  ('nympho'),
  ('nymphomania'),
  ('octopussy'),
  ('omorashi'),
  ('one cup two girls'),
  ('one guy one jar'),
  ('orgasm'),
  ('orgy'),
  ('paedophile'),
  ('paki'),
  ('panties'),
  ('panty'),
  ('pedobear'),
  ('pedophile'),
  ('pegging'),
  ('penis'),
  ('phone sex'),
  ('piece of shit'),
  ('pikey'),
  ('pissing'),
  ('piss pig'),
  ('pisspig'),
  ('playboy'),
  ('pleasure chest'),
  ('pole smoker'),
  ('ponyplay'),
  ('poof'),
  ('poon'),
  ('poontang'),
  ('punany'),
  ('poop chute'),
  ('poopchute'),
  ('porn'),
  ('porno'),
  ('pornography'),
  ('prince albert piercing'),
  ('pthc'),
  ('pubes'),
  ('pussy'),
  ('queaf'),
  ('queef'),
  ('quim'),
  ('raghead'),
  ('raging boner'),
  ('rape'),
  ('raping'),
  ('rapist'),
  ('rectum'),
  ('reverse cowgirl'),
  ('rimjob'),
  ('rimming'),
  ('rosy palm'),
  ('rosy palm and her 5 sisters'),
  ('rusty trombone'),
  ('sadism'),
  ('santorum'),
  ('scat'),
  ('schlong'),
  ('scissoring'),
  ('semen'),
  ('sex'),
  ('sexcam'),
  ('sexo'),
  ('sexy'),
  ('sexual'),
  ('sexually'),
  ('sexuality'),
  ('shaved beaver'),
  ('shaved pussy'),
  ('shemale'),
  ('shibari'),
  ('shit'),
  ('shitblimp'),
  ('shitty'),
  ('shota'),
  ('shrimping'),
  ('skeet'),
  ('slanteye'),
  ('slut'),
  ('s&m'),
  ('smut'),
  ('snatch'),
  ('snowballing'),
  ('sodomize'),
  ('sodomy'),
  ('spastic'),
  ('spic'),
  ('splooge'),
  ('splooge moose'),
  ('spooge'),
  ('spread legs'),
  ('spunk'),
  ('strap on'),
  ('strapon'),
  ('strappado'),
  ('strip club'),
  ('style doggy'),
  ('suck'),
  ('sucks'),
  ('suicide girls'),
  ('sultry women'),
  ('swastika'),
  ('swinger'),
  ('tainted love'),
  ('taste my'),
  ('tea bagging'),
  ('threesome'),
  ('throating'),
  ('thumbzilla'),
  ('tied up'),
  ('tight white'),
  ('tit'),
  ('tits'),
  ('titties'),
  ('titty'),
  ('tongue in a'),
  ('topless'),
  ('tosser'),
  ('towelhead'),
  ('tranny'),
  ('tribadism'),
  ('tub girl'),
  ('tubgirl'),
  ('tushy'),
  ('twat'),
  ('twink'),
  ('twinkie'),
  ('two girls one cup'),
  ('undressing'),
  ('upskirt'),
  ('urethra play'),
  ('urophilia'),
  ('vagina'),
  ('venus mound'),
  ('viagra'),
  ('vibrator'),
  ('violet wand'),
  ('vorarephilia'),
  ('voyeur'),
  ('voyeurweb'),
  ('voyuer'),
  ('vulva'),
  ('wank'),
  ('wetback'),
  ('wet dream'),
  ('white power'),
  ('whore'),
  ('worldsex'),
  ('wrapping men'),
  ('wrinkled starfish'),
  ('xx'),
  ('xxx'),
  ('yaoi'),
  ('yellow showers'),
  ('yiffy'),
  ('zoophilia')
) as v(term);

insert into app_private.text_filter_allowed (phrase, pattern, note)
select v.phrase, app_private.filter_pattern(v.phrase), v.note
from (values
  ('nude', 'a color: nude heels, a nude dress'),
  ('sexy', 'ordinary fashion wording: a sexy little black dress'),
  ('suck', 'everyday speech in chat'),
  ('sucks', 'everyday speech in chat'),
  ('snatch', 'everyday speech in chat ("snatch it before the weekend")'),
  ('hardcore', 'everyday speech in chat'),
  ('hard core', 'everyday speech in chat'),
  ('tied up', 'garment wording: tied up at the waist'),
  ('tight white', 'garment wording: a tight white dress'),
  ('big black', 'garment wording: a big black bag'),
  ('girl on', 'everyday wording: a girl on a budget'),
  ('taste my', 'everyday wording in chat'),
  ('xx', 'kisses in chat; sizes like XXL are other words already'),
  ('xxx', 'kisses in chat; sizes like XXXL are other words already'),
  ('s&m', 'normalizes to "s m", which is how people write sizes S M L'),
  ('pussy bow', 'a garment style: a pussy-bow blouse'),
  ('bondage pants', 'a garment: punk bondage pants'),
  ('bondage trousers', 'a garment: punk bondage trousers'),
  ('poof sleeve', 'a garment detail'),
  ('poof sleeves', 'a garment detail')
) as v(phrase, note);

-- 3. Contact details and outside links (public text only).
create or replace function app_private.text_has_contact(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select v ~ '(^|[^0-9])(\+?1[\s.-]*)?\(?[0-9]{3}\)?[\s.-]*[0-9]{3}[\s.-]*[0-9]{4}([^0-9]|$)'  -- phone numbers
      or v ~ '[0-9]{10,}'
      or v ~ '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'                                         -- email addresses
      or v ~ '(https?://|www\.)'                                                             -- links
      or v ~ '\m[a-z0-9-]+\.(com|net|org|io|co|me|app|ly|us|info|biz|shop|store|link|gg|tv|ai|xyz|site|online)\M'
      or v ~ '(^|[^a-z0-9._%+-])@[a-z_][a-z0-9_.]+'                                          -- @handles
  from (select pg_catalog.lower(coalesce(p_text, '')) as v) t;
$function$;

-- 4. The check. [p_where] is 'listing', 'profile', 'message' or 'report'. Returns the plain-words
-- refusal, or null when the text is fine.
create or replace function app_private.text_refusal(p_text text, p_where text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_text text;
  v_allowed record;
begin
  if pg_catalog.btrim(coalesce(p_text, '')) = '' then
    return null;
  end if;
  v_text := ' ' || app_private.filter_normalize(p_text) || ' ';
  for v_allowed in select a.pattern from app_private.text_filter_allowed a loop
    v_text := pg_catalog.regexp_replace(v_text, v_allowed.pattern, ' |', 'g');
  end loop;
  if exists (select 1 from app_private.text_filter_terms t where v_text ~ t.pattern) then
    return 'This text includes language that isn''t allowed on Dzirent.';
  end if;
  if p_where = 'listing' and app_private.text_has_contact(p_text) then
    return 'Please remove contact details from your listing; people can message you in Dzirent.';
  end if;
  if p_where = 'profile' and app_private.text_has_contact(p_text) then
    return 'Please remove contact details from your profile; people can message you in Dzirent.';
  end if;
  return null;
end;
$function$;

-- Raises the refusal for [p_field] (the HINT tells the app which field to mark).
create or replace function app_private.check_text_field(p_text text, p_where text, p_field text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_message text := app_private.text_refusal(p_text, p_where);
begin
  if v_message is not null then
    raise exception using message = v_message, errcode = 'P0001', hint = p_field;
  end if;
end;
$function$;

-- 5. Triggers. A column is checked when it is inserted or changes, so old rows never block
-- unrelated updates (a status change, a photo check).
create or replace function app_private.filter_listing_text()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' or new.title is distinct from old.title then
    perform app_private.check_text_field(new.title, 'listing', 'title');
  end if;
  if tg_op = 'INSERT' or new.description is distinct from old.description then
    perform app_private.check_text_field(new.description, 'listing', 'description');
  end if;
  if tg_op = 'INSERT' or new.price_note is distinct from old.price_note then
    perform app_private.check_text_field(new.price_note, 'listing', 'price_note');
  end if;
  if tg_op = 'INSERT' or new.deposit_note is distinct from old.deposit_note then
    perform app_private.check_text_field(new.deposit_note, 'listing', 'deposit_note');
  end if;
  return new;
end;
$function$;

create or replace function app_private.filter_profile_text()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' or new.display_name is distinct from old.display_name then
    perform app_private.check_text_field(new.display_name, 'profile', 'display_name');
  end if;
  if tg_op = 'INSERT' or new.studio_name is distinct from old.studio_name then
    perform app_private.check_text_field(new.studio_name, 'profile', 'studio_name');
  end if;
  if tg_op = 'INSERT' or new.studio_handle is distinct from old.studio_handle then
    perform app_private.check_text_field(new.studio_handle, 'profile', 'studio_handle');
  end if;
  if tg_op = 'INSERT' or new.studio_bio is distinct from old.studio_bio then
    perform app_private.check_text_field(new.studio_bio, 'profile', 'studio_bio');
  end if;
  if tg_op = 'INSERT' or new.pickup_area is distinct from old.pickup_area then
    perform app_private.check_text_field(new.pickup_area, 'profile', 'pickup_area');
  end if;
  return new;
end;
$function$;

create or replace function app_private.filter_message_text()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' or new.body is distinct from old.body then
    perform app_private.check_text_field(new.body, 'message', 'body');
  end if;
  return new;
end;
$function$;

create or replace function app_private.filter_report_text()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' or new.reason is distinct from old.reason then
    perform app_private.check_text_field(new.reason, 'report', 'reason');
  end if;
  if tg_op = 'INSERT' or new.details is distinct from old.details then
    perform app_private.check_text_field(new.details, 'report', 'details');
  end if;
  return new;
end;
$function$;

create trigger listings_filter_text before insert or update on public.listings
  for each row execute function app_private.filter_listing_text();
create trigger profiles_filter_text before insert or update on public.profiles
  for each row execute function app_private.filter_profile_text();
create trigger messages_filter_text before insert or update on public.messages
  for each row execute function app_private.filter_message_text();
create trigger reports_filter_text before insert or update on public.reports
  for each row execute function app_private.filter_report_text();

-- 6. A check the apps can run before saving: sign-up's display name, which the Auth API would
-- otherwise refuse with a generic error. Returns the refusal or null.
create or replace function public.check_text(p_text text, p_where text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_where is null or p_where not in ('listing', 'profile', 'message', 'report') then
    raise exception 'Unknown place for the text check' using errcode = '22023';
  end if;
  if pg_catalog.char_length(coalesce(p_text, '')) > 5000 then
    raise exception 'Text too long' using errcode = '22023';
  end if;
  return app_private.text_refusal(p_text, p_where);
end;
$function$;

-- 7. Access. The triggers run as the person writing, so it may run the field check (it is
-- elevated and reads the lists itself); nothing else here is callable through the API.
revoke execute on function app_private.filter_normalize(text) from public, anon, authenticated;
revoke execute on function app_private.filter_pattern(text) from public, anon, authenticated;
revoke execute on function app_private.text_has_contact(text) from public, anon, authenticated;
revoke execute on function app_private.text_refusal(text, text) from public, anon, authenticated;
revoke execute on function app_private.check_text_field(text, text, text) from public, anon;
grant execute on function app_private.check_text_field(text, text, text) to authenticated, service_role;
revoke execute on function app_private.filter_listing_text() from public, anon, authenticated;
revoke execute on function app_private.filter_profile_text() from public, anon, authenticated;
revoke execute on function app_private.filter_message_text() from public, anon, authenticated;
revoke execute on function app_private.filter_report_text() from public, anon, authenticated;
revoke execute on function public.check_text(text, text) from public;
grant execute on function public.check_text(text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
