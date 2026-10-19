# Bounded workflow integration tests

Claude owns `test_studios.py` here for the current Studio workflow. Add at most four PostgreSQL/API
integration cases. Reuse the parent conftest and a disposable database ending in `_test`. Missing
PostgreSQL must fail CI (`DZIRENT_REQUIRE_DB_TESTS=1`), not turn into a claimed pass.

The routine pipeline selects two existing persistence/ownership integration cases plus this directory.
No unit tests or full parameterized API suite run automatically in this batch. Keep this directory
present so pytest can select it before the Studio tests land.
