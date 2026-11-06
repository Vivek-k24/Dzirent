import numpy as np

from app.colors import color_votes, name_colors, nearest_color_name, rgb_to_lab


def solid(rgb, w=64, h=64):
    return np.full((h, w, 3), rgb, dtype=np.uint8)


def votes(image):
    return color_votes(image, region=np.ones(image.shape[:2], dtype=bool))


def test_typical_shades_get_their_names():
    cases = {
        (10, 10, 10): "Black", (250, 250, 250): "White", (128, 128, 128): "Grey", (0, 0, 128): "Navy",
        (40, 95, 195): "Blue", (34, 139, 34): "Green", (0, 130, 95): "Emerald", (220, 25, 30): "Red",
        (125, 10, 35): "Maroon", (255, 182, 193): "Pink", (128, 0, 128): "Purple", (255, 140, 0): "Orange",
        (245, 215, 60): "Yellow", (225, 205, 170): "Beige", (110, 70, 40): "Brown",
    }
    assert {rgb: nearest_color_name(*rgb) for rgb in cases} == cases


def test_one_color_garment():
    assert name_colors(votes(solid((200, 20, 30)))) == ("Red", None)


def test_clear_second_color():
    image = solid((25, 35, 85))
    image[:, 48:] = (245, 245, 245)  # three quarters navy, one quarter white
    assert name_colors(votes(image)) == ("Navy", "White")


def test_two_colors_too_close_to_call():
    image = solid((200, 20, 30))
    image[:, 32:] = (34, 139, 34)  # half red, half green
    assert name_colors(votes(image)) == (None, None)


def test_shadow_shades_are_not_a_second_color():
    image = solid((205, 30, 35))
    image[:, 40:] = (120, 15, 35)  # red with maroon shadows
    assert name_colors(votes(image)) == ("Red", None)


def test_too_few_pixels_names_nothing():
    assert name_colors(votes(solid((200, 20, 30), 20, 20))) == (None, None)


def test_dark_pixels_are_navy_only_when_blue():
    assert name_colors(votes(solid((15, 20, 60))))[0] == "Navy"
    assert name_colors(votes(solid((25, 25, 25))))[0] == "Black"


def test_center_box_leaves_out_the_background():
    image = solid((245, 245, 245), 100, 100)
    image[30:70, 30:70] = (0, 130, 95)  # an emerald piece on white
    background = rgb_to_lab(np.array([245, 245, 245], dtype=np.uint8))
    assert name_colors(color_votes(image, None, background)) == ("Emerald", None)


def test_skin_is_left_out_unless_it_is_most_of_the_piece():
    image = solid((0, 0, 128))
    image[:, :16] = (224, 172, 150)  # a navy dress with a quarter arms and face
    assert name_colors(votes(image)) == ("Navy", None)
    beige = solid((224, 172, 150))  # a skin-toned dress
    assert name_colors(votes(beige))[0] is not None
