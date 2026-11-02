"""Small Step 1A guest check. Credentials come only from the environment."""
import json
import os
import urllib.error
import urllib.request


def main():
    url = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_PUBLISHABLE_KEY"]
    assert key.startswith("sb_publishable_"), "Use the modern publishable key"
    headers = {"apikey": key, "Content-Type": "application/json"}

    def request(path, body=None):
        req = urllib.request.Request(
            url + "/rest/v1/" + path,
            data=None if body is None else json.dumps(body).encode(),
            headers=headers,
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            return error.code, None

    for table in ("listings", "profiles", "us_cities"):
        status, rows = request(table + "?select=*&limit=1")
        assert status in (401, 403) or (status == 200 and rows == []), table + " exposed rows"
        print(table + ": guest denied or zero rows (HTTP " + str(status) + ")")

    status, cities = request("rpc/search_cities", {"p_query": "Austin"})
    assert status == 200 and isinstance(cities, list) and cities, "City RPC failed"
    assert all(city["name"].lower().startswith("austin") for city in cities)
    print("search_cities(Austin): " + str(len(cities)) + " results; guest key only")


if __name__ == "__main__":
    main()
