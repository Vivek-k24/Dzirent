import pytest
from db_safety import LIBPQ_OVERRIDES, safe_test_url

BASE = "postgresql+psycopg://local_operator:disposable@127.0.0.1:55462/dzirent_auth62_test"


@pytest.fixture(autouse=True)
def clean_libpq(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in LIBPQ_OVERRIDES:
        monkeypatch.delenv(name, raising=False)


def test_explicit_loopback_test_target() -> None:
    url = safe_test_url(BASE)
    assert (url.host, url.database, url.username) == (
        "127.0.0.1",
        "dzirent_auth62_test",
        "local_operator",
    )


@pytest.mark.parametrize(
    "host",
    [
        "db.example.invalid",
        "127.0.0.1,host.example.invalid",
        "host.postgres.database.azure.com",
        "::1",
        "127.1.2.3",
        "/var/run/postgresql",
    ],
)
def test_reject_host_before_connection(host: str) -> None:
    with pytest.raises(ValueError):
        safe_test_url(BASE.replace("127.0.0.1", host))


@pytest.mark.parametrize(
    "database",
    [
        "postgres",
        "dzirent_staging",
        "dzirent_staging_test",
        "dzirent_staging62_test",
        "dzirent_prod_test",
        "bad-name_test",
        'bad";DROP_test',
        "x" * 64 + "_test",
        "native_test;",
        "_test",
        "é_test",
    ],
)
def test_reject_unsafe_database(database: str) -> None:
    with pytest.raises(ValueError):
        safe_test_url(BASE.replace("dzirent_auth62_test", database))


@pytest.mark.parametrize(
    "query",
    [
        "host=host.example.invalid",
        "hostaddr=1.2.3.4",
        "dbname=dzirent_staging",
        "service=staging",
        "options=-csearch_path=other",
        "port=443",
        "user=other",
        "sslmode=disable&host=host.example.invalid",
    ],
)
def test_reject_query_target_overrides(query: str) -> None:
    with pytest.raises(ValueError):
        safe_test_url(f"{BASE}?{query}")


@pytest.mark.parametrize("name", LIBPQ_OVERRIDES)
def test_reject_inherited_libpq_override(name: str, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(name, "untrusted-override")
    with pytest.raises(ValueError):
        safe_test_url(BASE)


def test_reject_non_loopback_localhost_resolution(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "db_safety.socket.getaddrinfo",
        lambda *args, **kwargs: [(2, 1, 6, "", ("192.0.2.1", 55462))],
    )
    with pytest.raises(ValueError):
        safe_test_url(BASE.replace("127.0.0.1", "localhost"))
