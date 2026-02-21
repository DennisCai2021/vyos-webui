"""Application Configuration"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings"""

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # Application
    app_name: str = "VyOS Web API"
    app_version: str = "1.0.0"
    debug: bool = False

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    # VyOS Connection
    vyos_host: str = ""
    vyos_port: int = 22
    vyos_username: str = ""
    vyos_password: str = ""
    vyos_timeout: int = 30

    # Security
    secret_key: str = ""
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    # Database
    database_url: str = "sqlite:///./vyos_webui.db"

    # Logging
    log_level: str = "INFO"


settings = Settings()
