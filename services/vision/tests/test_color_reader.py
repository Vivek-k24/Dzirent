"""V1a: the color reader (garment mask, light correction, clusters, names, second opinion).

Synthetic images, plus the 22 sample listing photos (supabase/seed/images) for the robustness
test. Nothing here needs the model: its second opinion is tested with a stand-in bank.
"""

from pathlib import Path

import numpy as np
import pytest

from app import color_reader as cr
from app.colors import NAMES, RELATED, linear_to_lab, srgb_to_linear
from app.fetch import open_image
from app.quality import check_photo, working_image

SAMPLES = Path(__file__).resolve().parents[3] / "supabase" / "seed" / "images"


def to_srgb(linear: np.ndarray) -> np.ndarray:
    lin = np.clip(linear, 0.0, 1.0)
    s = np.where(lin <= 0.0031308, 12.92 * lin, 1.055 * np.power(lin, 1 / 2.4) - 0.055)
    return np.clip(np.round(s * 255), 0, 255).astype(np.uint8)


def with_cast(rgb: np.ndarray, gains) -> np.ndarray:
    """The photo as if taken under another light (or exposure): gains on linear light, clipped."""
    return to_srgb(srgb_to_linear(rgb) * np.asarray(gains, dtype=np.float64))


def light_cast(kelvin: float) -> np.ndarray:
    """Daylight at [kelvin] relative to D65, at the same brightness."""
    g = cr.daylight_rgb(kelvin)
    return g / (0.2126 * g[0] + 0.7152 * g[1] + 0.0722 * g[2])


CASTS = {"yellow": light_cast(4000), "blue": light_cast(9000), "dark": [0.5] * 3, "bright": [1.6] * 3}


def main_color(rgb: np.ndarray) -> str | None:
    q = check_photo(rgb)
    return cr.name_values(cr.clusters(cr.read_photo(rgb, q.region).lab))[0]


# ---- CIEDE2000 and the names -----------------------------------------------------------------

@pytest.mark.parametrize("lab1, lab2, expected", [
    # Sharma, Wu and Dalal (2005), test data pairs 1, 7, 12, 14, 17, 25 and 34.
    ((50.0, 2.6772, -79.7751), (50.0, 0.0, -82.7485), 2.0425),
    ((50.0, 0.0, 0.0), (50.0, -1.0, 2.0), 2.3669),
    ((50.0, -0.001, 2.49), (50.0, 0.0009, -2.49), 4.8045),
    ((50.0, -0.001, 2.49), (50.0, 0.0011, -2.49), 4.7461),
    ((50.0, 2.5, 0.0), (73.0, 25.0, -18.0), 27.1492),
    ((60.2574, -34.0099, 36.2677), (60.4626, -34.1751, 39.4387), 1.2644),
    ((90.8027, -2.0831, 1.441), (91.1528, -1.6435, 0.0447), 1.4441),
])
def test_ciede2000_matches_the_reference_pairs(lab1, lab2, expected):
    assert float(cr.delta_e2000(np.array(lab1), np.array(lab2))) == pytest.approx(expected, abs=1e-4)


def test_textile_lightness_factor_counts_lightness_half():
    a, b = np.array([40.0, 0.0, 0.0]), np.array([60.0, 0.0, 0.0])
    assert float(cr.delta_e2000(a, b, cr.TEXTILE_KL)) == pytest.approx(float(cr.delta_e2000(a, b)) / 2)


def test_every_name_maps_to_one_of_the_apps_values():
    p = cr.palette()
    assert len(p.names) == 949 and len(set(p.names)) == 949
    assert set(int(v) for v in p.value) <= set(range(len(NAMES)))
    assert set(cr.FINE_OVERRIDES) <= set(p.names) and set(cr.FINE_OVERRIDES.values()) <= set(NAMES)


def test_names_that_are_app_values_map_to_themselves():
    p = cr.palette()
    for value in NAMES:
        assert NAMES[p.value[p.index[value.lower()]]] == value


@pytest.mark.parametrize("name, value", [
    ("ivory", "White"), ("cream", "White"), ("off white", "White"), ("charcoal", "Grey"), ("camel", "Beige"),
    ("burgundy", "Maroon"), ("terracotta", "Orange"), ("denim", "Blue"), ("mocha", "Brown"), ("teal", "Emerald"),
])
def test_fashion_names_map_where_a_lender_would_expect(name, value):
    p = cr.palette()
    assert NAMES[p.value[p.index[name]]] == value


def test_the_model_prompts_cover_every_name():
    prompts = cr.color_prompts()
    assert [n for n, _ in prompts] == list(cr.palette().names)
    assert dict(prompts)["ivory"][0] == "a photo of an ivory garment"
    assert len(cr.color_digest()) == 64


# ---- Light -----------------------------------------------------------------------------------

def test_the_daylight_locus_runs_through_the_srgb_white():
    assert np.allclose(cr.daylight_rgb(6504), 1.0, atol=2e-3)
    origin, direction, warmest, coolest = cr.daylight_axis()
    assert np.linalg.norm(origin) < 2e-3 and warmest < 0 < coolest
    assert direction[0] < 0 < direction[1]  # cooler light: less red, more blue


def test_a_cast_on_a_neutral_background_is_removed():
    scene = np.full((120, 120, 3), 0.55)        # a light grey backdrop
    scene[30:90, 30:90] = (0.40, 0.12, 0.10)    # a red piece
    garment = np.zeros((120, 120), dtype=bool)
    garment[30:90, 30:90] = True
    clean, light = cr.correct_light(scene, ~garment)
    for kelvin in (4000, 5000, 8000, 9000):
        corrected, light = cr.correct_light(scene * light_cast(kelvin), ~garment)
        assert light.neutral_background
        assert np.allclose(corrected[garment], clean[garment], atol=0.01)


def test_a_colored_background_is_not_mistaken_for_the_light():
    scene = np.full((120, 120, 3), (0.35, 0.03, 0.04))  # a red rug
    scene[30:90, 30:90] = 0.75                           # an ivory piece
    garment = np.zeros((120, 120), dtype=bool)
    garment[30:90, 30:90] = True
    corrected, light = cr.correct_light(scene, ~garment)
    assert not light.neutral_background
    assert np.allclose(corrected[garment], scene[garment] * light.gains, atol=1e-9)
    assert np.allclose(light.gains, light.gains[0])  # brightness only, never a hue change


def test_a_dim_photo_is_brightened_but_never_darkened():
    dim = np.full((50, 50, 3), 0.2)
    _, light = cr.correct_light(dim, np.ones((50, 50), dtype=bool))
    assert light.gains[1] == pytest.approx(min(cr.EXPOSURE_MAX_GAIN, cr.EXPOSURE_TARGET / 0.2), rel=1e-3)
    _, light = cr.correct_light(np.full((50, 50, 3), 0.95), np.ones((50, 50), dtype=bool))
    assert light.gains[1] == pytest.approx(1.0, rel=1e-3)


# ---- Mask ------------------------------------------------------------------------------------

def rug_and_garment(seed: int = 0) -> tuple[np.ndarray, np.ndarray]:
    """The owner's case, synthetic: a cream piece laid flat on a red patterned rug."""
    rng = np.random.default_rng(seed)
    h, w = 480, 360
    yy, xx = np.mgrid[0:h, 0:w]
    rug = np.where(((xx // 24 + yy // 24) % 2 == 0)[..., None], (150, 28, 36), (95, 15, 25)).astype(np.float64)
    rug[(np.abs(((xx - yy) % 60) - 30) < 4)] = (40, 30, 70)       # a dark blue lattice
    rug[(np.abs(((xx + yy) % 90) - 45) < 3)] = (210, 160, 70)     # gold threads
    garment = ((xx - w / 2) / (w * 0.30)) ** 2 + ((yy - h / 2) / (h * 0.40)) ** 2 <= 1
    garment |= (np.abs(xx - w / 2) < w * 0.42) & (np.abs(yy - h * 0.30) < h * 0.07)  # sleeves
    cream = np.array([238.0, 228.0, 205.0]) * (0.88 + 0.12 * np.sin(xx / 7.0))[..., None]  # folds
    image = np.where(garment[..., None], cream, rug) + rng.normal(0, 4, (h, w, 3))
    return np.clip(image, 0, 255).astype(np.uint8), garment


def test_grabcut_separates_a_cream_garment_from_a_red_patterned_rug():
    rgb, truth = rug_and_garment()
    q = check_photo(rgb)
    small = cr.small_image(rgb)
    mask, used = cr.garment_mask(small, cr.seed_mask(small.shape[:2], q.region))
    truth_small = cr.seed_mask(small.shape[:2], truth)
    iou = (mask & truth_small).sum() / (mask | truth_small).sum()
    assert used and iou >= 0.85


def test_a_cream_garment_on_a_red_rug_is_named_white_not_grey():
    rgb, _ = rug_and_garment()
    q = check_photo(rgb)
    found = cr.clusters(cr.read_photo(rgb, q.region).lab)
    assert cr.name_values(found)[0] == "White"
    assert all(NAMES[c.value] not in ("Red", "Maroon") for c in found)


def test_mask_falls_back_to_the_seed_when_grabcut_finds_nothing():
    flat = np.full((200, 160, 3), 128, dtype=np.uint8)
    small = cr.small_image(flat)
    seed = cr.seed_mask(small.shape[:2], None)
    mask, used = cr.garment_mask(small, seed)
    assert mask.any() and not (mask & cr.border_band(small.shape[:2])).any()


def test_a_photo_too_small_to_read_names_nothing():
    tiny = np.full((12, 12, 3), (200, 20, 30), dtype=np.uint8)
    assert cr.read_listing([cr.read_photo(tiny, None)]).colors == (None, None)


# ---- Clusters and naming ---------------------------------------------------------------------

def lab_pixels(rgb, n) -> np.ndarray:
    return np.repeat(linear_to_lab(srgb_to_linear(np.array([rgb], dtype=np.uint8))), n, axis=0).astype(np.float32)


def test_typical_shades_get_their_names():
    cases = {
        (10, 10, 10): "Black", (250, 250, 250): "White", (128, 128, 128): "Grey", (0, 0, 128): "Navy",
        (40, 95, 195): "Blue", (34, 139, 34): "Green", (0, 130, 95): "Emerald", (220, 25, 30): "Red",
        (125, 10, 35): "Maroon", (255, 182, 193): "Pink", (128, 0, 128): "Purple", (255, 140, 0): "Orange",
        (245, 215, 60): "Yellow", (225, 205, 170): "Beige", (110, 70, 40): "Brown",
    }
    assert {rgb: cr.name_values(cr.clusters(lab_pixels(rgb, 1000)))[0] for rgb in cases} == cases


def test_skin_is_left_out_unless_it_is_most_of_the_piece():
    navy = np.full((96, 96, 3), (0, 0, 128), dtype=np.uint8)
    navy[:, :24] = (224, 172, 150)  # a navy dress with a quarter arms and face
    everything = np.ones((96, 96), dtype=bool)
    assert cr.read_listing([cr.read_photo(navy, everything)]).colors == ("Navy", None)
    beige = np.full((96, 96, 3), (224, 172, 150), dtype=np.uint8)  # a skin-toned dress
    assert cr.read_listing([cr.read_photo(beige, everything)]).colors[0] is not None


def test_one_color_garment():
    found = cr.clusters(lab_pixels((200, 20, 30), 3000))
    assert cr.name_values(found) == ("Red", None)


def test_clear_second_color_and_tiny_clusters_left_out():
    lab = np.concatenate([lab_pixels((25, 35, 85), 2400), lab_pixels((245, 245, 245), 700),
                          lab_pixels((230, 20, 20), 100)])  # 3% red: a tiny cluster
    found = cr.clusters(lab)
    assert cr.name_values(found) == ("Navy", "White")
    assert all(NAMES[c.value] != "Red" for c in found)


def test_black_and_white_are_never_one_fabric_in_shadow():
    lab = np.concatenate([lab_pixels((15, 15, 15), 1800), lab_pixels((245, 245, 245), 1200)])
    assert cr.name_values(cr.clusters(lab)) == ("Black", "White")


def test_a_dark_green_and_its_near_black_shadows_are_one_fabric():
    rng = np.random.default_rng(6)
    base = srgb_to_linear(np.array([0, 110, 78], dtype=np.uint8))
    lab = linear_to_lab(base * rng.uniform(0.3, 1.0, (3000, 1))).astype(np.float32)
    assert cr.name_values(cr.clusters(lab))[0] in ("Emerald", "Green")


def test_two_colors_too_close_to_call():
    lab = np.concatenate([lab_pixels((200, 20, 30), 1500), lab_pixels((34, 139, 34), 1500)])
    assert cr.name_values(cr.clusters(lab)) == (None, None)


def test_shadows_of_one_fabric_are_one_color():
    rng = np.random.default_rng(3)
    base = srgb_to_linear(np.array([205, 30, 35], dtype=np.uint8))
    shade = rng.uniform(0.25, 1.0, (4000, 1))  # folds from deep shadow to full light
    lab = linear_to_lab(base * shade).astype(np.float32)
    assert cr.name_values(cr.clusters(lab))[0] in ("Red", *[NAMES[i] for i in RELATED[NAMES.index("Red")]])


def test_returned_colors_are_only_the_apps_values():
    rng = np.random.default_rng(4)
    for _ in range(20):
        lab = linear_to_lab(rng.uniform(0, 1, (800, 3))).astype(np.float32)
        reading = cr.read_listing([cr.PhotoColors(lab=lab)])
        assert all(c is None or c in NAMES for c in reading.colors)


# ---- Second opinion --------------------------------------------------------------------------

def stand_in_bank(prefer: str) -> tuple[cr.ColorBank, np.ndarray]:
    """A bank of random unit vectors with an embedding that matches [prefer]'s row best."""
    names = list(cr.palette().names)
    rng = np.random.default_rng(5)
    m = rng.normal(size=(len(names), 32))
    m /= np.linalg.norm(m, axis=1, keepdims=True)
    return cr.ColorBank(keys=names, matrix=m.astype(np.float32)), m[names.index(prefer)].astype(np.float32)


def photo(rgb, n=3000) -> cr.PhotoColors:
    return cr.PhotoColors(lab=lab_pixels(rgb, n))


def candidate_of(rgb, value: str) -> str:
    """A name the model is asked about for [rgb]'s pixels that maps to [value]."""
    p = cr.palette()
    main = cr.clusters(lab_pixels(rgb, 3000))[0]
    return next(p.names[i] for i in cr._candidates([main.lab]) if NAMES[p.value[i]] == value)


def test_the_model_agreeing_keeps_the_pixels_answer_with_high_confidence():
    cream = (236, 230, 212)
    bank, embedding = stand_in_bank(candidate_of(cream, "White"))
    reading = cr.read_listing([photo(cream)], embedding, bank)
    assert reading.colors[0] == "White" and reading.rule == "agree"
    assert reading.confidence == cr.CONFIDENCE["agree"]


def test_the_model_settles_a_near_tie():
    # A color the pixels put about equally close to a White name and a Beige name.
    p = cr.palette()
    for rgb in [(r, r - 6, r - 22) for r in range(200, 250, 2)]:
        main = cr.clusters(lab_pixels(rgb, 3000))[0]
        closest = cr._closest_by_value(main.lab)
        pixel = NAMES[main.value]
        other = "Beige" if pixel == "White" else "White"
        if pixel in ("White", "Beige") and closest.get(other, 99) - closest[pixel] <= cr.NEAR_TIE_DE:
            near, _ = cr.nearest_names(main.lab, 10)
            name = next(p.names[i] for i in near if NAMES[p.value[i]] == other)
            bank, embedding = stand_in_bank(name)
            reading = cr.read_listing([photo(rgb)], embedding, bank)
            assert reading.colors == (other, None) and reading.rule == "settled"
            assert reading.confidence == cr.CONFIDENCE["settled"]
            return
    pytest.fail("no near tie between White and Beige found")


def test_a_strong_disagreement_keeps_the_pixels_answer_with_lower_confidence():
    # The model prefers a name near the pixels' color whose value is neither theirs, a related
    # shade of it, nor a near tie: the pixels don't support it.
    p = cr.palette()
    for pixels in [(128, 128, 128), (110, 140, 60), (70, 130, 180), (150, 100, 60), (190, 40, 40)]:
        main = cr.clusters(lab_pixels(pixels, 3000))[0]
        closest = cr._closest_by_value(main.lab)
        supported = {main.value, *RELATED[main.value]}
        far = next((p.names[i] for i in cr._candidates([main.lab]) if int(p.value[i]) not in supported
                    and closest[NAMES[p.value[i]]] - closest[NAMES[main.value]] > cr.NEAR_TIE_DE), None)
        if far is None:
            continue
        bank, embedding = stand_in_bank(far)
        reading = cr.read_listing([photo(pixels)], embedding, bank)
        assert reading.colors[0] == NAMES[main.value] and reading.rule == "disagree"
        assert reading.confidence == cr.CONFIDENCE["disagree"] < cr.CONFIDENCE["pixels_only"]
        return
    pytest.fail("no color with an unsupported neighbor found")


def test_the_model_breaks_a_tie_the_pixels_cannot_call():
    lab = np.concatenate([lab_pixels((12, 14, 13), 1500), lab_pixels((0, 110, 78), 1500)])  # black and emerald
    assert cr.read_listing([cr.PhotoColors(lab=lab)]).colors == (None, None)
    bank, embedding = stand_in_bank(candidate_of((0, 110, 78), "Emerald"))
    reading = cr.read_listing([cr.PhotoColors(lab=lab)], embedding, bank)
    assert reading.colors == ("Emerald", None) and reading.rule == "settled"


def test_the_model_settles_a_close_call_between_two_colors():
    lab = np.concatenate([lab_pixels((200, 180, 150), 1800), lab_pixels((110, 15, 35), 1200)])  # beige 60%, maroon 40%
    assert cr.read_listing([cr.PhotoColors(lab=lab)]).colors == ("Beige", "Maroon")
    bank, embedding = stand_in_bank(candidate_of((110, 15, 35), "Maroon"))
    reading = cr.read_listing([cr.PhotoColors(lab=lab)], embedding, bank)
    assert reading.colors == ("Maroon", None) and reading.rule == "settled"


def test_a_clear_main_color_is_not_handed_to_the_model():
    lab = np.concatenate([lab_pixels((200, 180, 150), 2400), lab_pixels((110, 15, 35), 600)])  # beige 80%, maroon 20%
    bank, embedding = stand_in_bank(candidate_of((110, 15, 35), "Maroon"))
    reading = cr.read_listing([cr.PhotoColors(lab=lab)], embedding, bank)
    assert reading.colors == ("Beige", "Maroon") and reading.rule != "settled"


def test_without_the_model_the_pixels_answer_stands():
    reading = cr.read_listing([photo((25, 35, 85))])
    assert reading.colors[0] == "Navy" and reading.rule == "pixels_only"


# ---- Robustness on the sample listing photos -------------------------------------------------

SAMPLE_PHOTOS = sorted(SAMPLES.rglob("*.jpg"))


@pytest.mark.skipif(not SAMPLE_PHOTOS, reason="sample photos not found")
@pytest.mark.parametrize("path", SAMPLE_PHOTOS, ids=lambda p: f"{p.parent.name}/{p.stem}")
def test_light_casts_keep_the_color_family(path):
    """Yellow and blue light, under- and over-exposure: the main color stays the same or one of
    its related shades (colors.RELATED: its light, shadow and neighbor shades)."""
    rgb = working_image(open_image(path.read_bytes()))
    base = main_color(rgb)
    assert base is not None
    family = {base, *(NAMES[i] for i in RELATED[NAMES.index(base)])}
    for name, gains in CASTS.items():
        got = main_color(with_cast(rgb, gains))
        assert got in family, f"{name} cast: {got}, expected {base} or a related shade"


@pytest.mark.skipif(not SAMPLE_PHOTOS, reason="sample photos not found")
def test_reading_a_photo_takes_under_a_second():
    import time

    rgb = working_image(open_image(SAMPLE_PHOTOS[0].read_bytes()))
    q = check_photo(rgb)
    started = time.perf_counter()
    cr.read_photo(rgb, q.region)
    assert time.perf_counter() - started < 1.0
