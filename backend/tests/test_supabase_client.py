from types import SimpleNamespace

from app.db import supabase_client


def test_client_uses_http1_because_http2_drops_parallel_requests(monkeypatch):
    built = {}

    def http_client(**options):
        built.update(options)
        return "http-client"

    monkeypatch.setattr(supabase_client.httpx, "Client", http_client)
    monkeypatch.setattr(supabase_client, "create_client", lambda _url, _key, options: options)
    monkeypatch.setattr(supabase_client, "ClientOptions", lambda httpx_client: httpx_client)
    monkeypatch.setattr(supabase_client, "get_settings", lambda: SimpleNamespace(
        supabase_url="https://example.test", supabase_key="key", supabase_service_role_key="",
    ))

    assert supabase_client.get_supabase.__wrapped__() == "http-client"
    assert built["http2"] is False
    assert built["follow_redirects"] is True
