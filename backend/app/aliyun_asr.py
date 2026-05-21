from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple
from urllib.parse import urlparse

import httpx


ALIYUN_ASR_PROVIDER_NAMES = {"aliyun", "aliyun_asr", "aliyun_nls", "alibaba_nls"}
SUPPORTED_AUDIO_FORMATS = {"pcm", "wav", "opus", "speex", "amr", "mp3", "aac"}
SUCCESS_STATUS = 20000000
TOKEN_REFRESH_SAFETY_SECONDS = 300
_TOKEN_CACHE: Dict[str, Any] = {"token": "", "expires_at": 0}


@dataclass
class AsrResult:
    provider: str
    confidence: float
    recognized_text: str
    payload: Dict[str, Any]


def is_aliyun_asr_provider(provider: str) -> bool:
    return provider.strip().lower() in ALIYUN_ASR_PROVIDER_NAMES


def aliyun_asr_enabled(provider: str) -> bool:
    return is_aliyun_asr_provider(provider) and bool(
        aliyun_access_key_id() and aliyun_access_key_secret() and aliyun_nls_app_key()
    )


def aliyun_access_key_id() -> str:
    return os.getenv("ALIYUN_ACCESS_KEY_ID") or os.getenv("ALIBABA_CLOUD_ACCESS_KEY_ID", "")


def aliyun_access_key_secret() -> str:
    return os.getenv("ALIYUN_ACCESS_KEY_SECRET") or os.getenv("ALIBABA_CLOUD_ACCESS_KEY_SECRET", "")


def aliyun_nls_app_key() -> str:
    return os.getenv("ALIYUN_NLS_APP_KEY", "")


def aliyun_nls_region() -> str:
    return os.getenv("ALIYUN_NLS_REGION", "cn-shanghai")


def aliyun_nls_endpoint() -> str:
    configured = os.getenv("ALIYUN_NLS_ENDPOINT", "").strip()
    if configured:
        return configured
    return f"https://nls-gateway-{aliyun_nls_region()}.aliyuncs.com/stream/v1/asr"


def aliyun_nls_sample_rate() -> int:
    raw_value = os.getenv("ALIYUN_NLS_SAMPLE_RATE", "16000")
    try:
        sample_rate = int(raw_value)
    except ValueError:
        sample_rate = 16000
    return 8000 if sample_rate == 8000 else 16000


def get_nls_token() -> str:
    now = int(time.time())
    cached_token = str(_TOKEN_CACHE.get("token") or "")
    expires_at = int(_TOKEN_CACHE.get("expires_at") or 0)
    if cached_token and expires_at - now > TOKEN_REFRESH_SAFETY_SECONDS:
        return cached_token

    token, token_expires_at = create_nls_token()
    _TOKEN_CACHE["token"] = token
    _TOKEN_CACHE["expires_at"] = token_expires_at
    return token


def create_nls_token() -> Tuple[str, int]:
    try:
        from aliyunsdkcore.client import AcsClient
        from aliyunsdkcore.request import CommonRequest
    except ModuleNotFoundError as exc:
        raise RuntimeError("缺少阿里云 NLS Token SDK，请安装 aliyun-python-sdk-core") from exc

    region = aliyun_nls_region()
    client = AcsClient(aliyun_access_key_id(), aliyun_access_key_secret(), region)
    request = CommonRequest()
    request.set_method("POST")
    request.set_domain("nls-meta.cn-shanghai.aliyuncs.com")
    request.set_version("2019-02-28")
    request.set_action_name("CreateToken")

    raw_response = client.do_action_with_exception(request)
    if isinstance(raw_response, bytes):
        raw_response = raw_response.decode("utf-8")
    payload = json.loads(raw_response)
    token = str(payload.get("Token", {}).get("Id") or "")
    expires_at = int(payload.get("Token", {}).get("ExpireTime") or 0)
    if not token or not expires_at:
        raise RuntimeError("阿里云 NLS Token 响应缺少 Token.Id 或 ExpireTime")
    return token, expires_at


def recognize_speech_with_aliyun(content: bytes, filename: str, content_type: str = "") -> AsrResult:
    if not content:
        raise RuntimeError("ASR 音频内容为空")

    audio_format = infer_audio_format(filename, content_type)
    if audio_format not in SUPPORTED_AUDIO_FORMATS:
        raise RuntimeError(f"阿里云一句话识别暂不支持当前音频格式：{content_type or filename or 'unknown'}")

    token = get_nls_token()
    params: Dict[str, Any] = {
        "appkey": aliyun_nls_app_key(),
        "format": audio_format,
        "sample_rate": aliyun_nls_sample_rate(),
        "enable_punctuation_prediction": os.getenv("ALIYUN_NLS_ENABLE_PUNCTUATION", "false").lower(),
        "enable_inverse_text_normalization": os.getenv("ALIYUN_NLS_ENABLE_ITN", "true").lower(),
        "enable_voice_detection": os.getenv("ALIYUN_NLS_ENABLE_VOICE_DETECTION", "true").lower(),
    }
    optional_envs = {
        "vocabulary_id": os.getenv("ALIYUN_NLS_VOCABULARY_ID", ""),
        "customization_id": os.getenv("ALIYUN_NLS_CUSTOMIZATION_ID", ""),
    }
    params.update({key: value for key, value in optional_envs.items() if value})

    headers = {
        "X-NLS-Token": token,
        "Content-Type": "application/octet-stream",
        "Host": urlparse(aliyun_nls_endpoint()).netloc,
    }
    with httpx.Client(timeout=45) as client:
        response = client.post(aliyun_nls_endpoint(), params=params, headers=headers, content=content)
        response.raise_for_status()
    payload = response.json()
    recognized_text, confidence = parse_aliyun_asr_payload(payload)
    return AsrResult(
        provider="aliyun_nls_one_sentence",
        confidence=confidence,
        recognized_text=recognized_text,
        payload=payload,
    )


def infer_audio_format(filename: str, content_type: str = "") -> str:
    configured = os.getenv("ALIYUN_NLS_FORMAT", "").strip().lower()
    if configured in SUPPORTED_AUDIO_FORMATS:
        return configured

    value = f"{filename} {content_type}".lower()
    candidates = (
        ("wav", ("audio/wav", "audio/x-wav", ".wav")),
        ("mp3", ("audio/mpeg", "audio/mp3", ".mp3")),
        ("aac", ("audio/aac", "audio/mp4", ".aac", ".m4a")),
        ("amr", ("audio/amr", ".amr")),
        ("opus", ("audio/ogg", "ogg", ".opus", ".ogg")),
        ("speex", ("speex", ".spx")),
        ("pcm", ("audio/pcm", ".pcm")),
    )
    for audio_format, markers in candidates:
        if any(marker in value for marker in markers):
            return audio_format
    return ""


def parse_aliyun_asr_payload(payload: Dict[str, Any]) -> Tuple[str, float]:
    status = payload.get("status")
    if status is not None and int(status) != SUCCESS_STATUS:
        raise RuntimeError(f"阿里云一句话识别失败：{status} {payload.get('message', '')}".strip())

    recognized_text = extract_text(payload)
    if not recognized_text:
        raise RuntimeError("阿里云一句话识别未返回文本结果")

    return recognized_text, extract_confidence(payload)


def extract_text(payload: Dict[str, Any]) -> str:
    for key in ("result", "text", "recognized_text", "transcript"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    flash_result = payload.get("flash_result")
    if isinstance(flash_result, dict):
        sentences = flash_result.get("sentences")
        if isinstance(sentences, list):
            parts = [str(item.get("text", "")).strip() for item in sentences if isinstance(item, dict)]
            text = "".join(part for part in parts if part)
            if text:
                return text
    return ""


def extract_confidence(payload: Dict[str, Any]) -> float:
    value: Optional[Any] = payload.get("confidence")
    if value is None and isinstance(payload.get("flash_result"), dict):
        value = payload["flash_result"].get("confidence")
    try:
        confidence = float(value)
    except (TypeError, ValueError):
        confidence = 0.9
    if confidence > 1:
        confidence = confidence / 100
    return max(0.0, min(round(confidence, 4), 0.99))
