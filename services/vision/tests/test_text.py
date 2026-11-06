from app.text import suggest_text, title_for


def test_color_detail_and_noun():
    assert suggest_text("cocktail_dress", "cocktail dress", None, ("Emerald", None), "velvet") == (
        "Emerald velvet cocktail dress", "Emerald velvet cocktail dress.")


def test_second_color_is_accents():
    assert suggest_text("shirt", "shirt", None, ("Navy", "White"), "polka-dot") == (
        "Navy polka-dot shirt", "Navy polka-dot shirt with white accents.")


def test_saree_second_color_is_its_border():
    assert suggest_text("saree", "saree", None, ("Yellow", "Red")) == ("Yellow saree", "Yellow saree with red border.")


def test_jewelry_gets_no_color():
    assert suggest_text("necklace", "necklace", "Costume jewelry", ("Yellow", "Grey")) == ("Necklace", "Necklace.")


def test_detail_already_in_the_noun_is_not_repeated():
    assert title_for("denim jacket", "Blue", "denim") == "Blue denim jacket"


def test_without_color_or_detail():
    assert title_for("gown") == "Gown"


def test_title_fits_the_listing_limit():
    assert len(title_for("very long noun " * 10, "Navy", "striped")) <= 80
