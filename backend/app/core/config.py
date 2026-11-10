from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "SET&PLATE API"
    supabase_url: str = ""
    supabase_key: str = ""
    supabase_service_role_key: str = ""
    # Any OpenAI-compatible chat API (Groq, OpenAI, OpenRouter, Gemini, Ollama...).
    # The older GROQ_* names still work, so existing .env files keep running.
    ai_base_url: str = "https://api.groq.com/openai/v1"
    ai_api_key: str = Field("", validation_alias=AliasChoices("AI_API_KEY", "GROQ_API_KEY"))
    ai_model: str = Field("openai/gpt-oss-20b", validation_alias=AliasChoices("AI_MODEL", "GROQ_MODEL"))
    ai_tips_model: str = Field("openai/gpt-oss-120b", validation_alias=AliasChoices("AI_TIPS_MODEL", "GROQ_TIPS_MODEL"))
    ai_tips_model_enabled: bool = False
    cors_origins: str = "http://localhost:5173"

    # Session signing. Falls back to the Supabase service-role key when no
    # dedicated secret is configured, so existing deployments keep working;
    # ``AUTH_SECRET_KEY`` is preferred and should be set in production.
    auth_secret_key: str = ""
    auth_token_ttl_hours: int = 12

    environment: str = "development"
    allowed_hosts: str = ""

    model_config = SettingsConfigDict(
        env_file=("../.env", ".env", "backend/.env"),
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def allowed_hosts_list(self) -> list[str]:
        hosts = [host.strip() for host in self.allowed_hosts.split(",") if host.strip()]
        if not hosts:
            return hosts
        # The container HEALTHCHECK calls /health on 127.0.0.1, and the Host
        # header it sends is validated by the same middleware. If loopback is
        # missing the check gets 400, the backend stays unhealthy and
        # ``depends_on: service_healthy`` keeps the frontend from starting,
        # which the tunnel surfaces as a bare 502.
        for loopback in ("127.0.0.1", "localhost"):
            if loopback not in hosts:
                hosts.append(loopback)
        return hosts

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() in {"production", "prod"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
