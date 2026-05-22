from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from io import BytesIO
from statistics import median
from typing import Any, Dict, Iterable, List, Tuple


ALIYUN_PROVIDER_NAMES = {"aliyun", "aliyun_ocr", "alibaba", "alibaba_cloud"}


@dataclass
class OcrResult:
    provider: str
    confidence: float
    raw_text: str
    answers: List[str]
    payload: Dict[str, Any]


def is_aliyun_ocr_provider(provider: str) -> bool:
    return provider.strip().lower() in ALIYUN_PROVIDER_NAMES


def aliyun_ocr_enabled(provider: str) -> bool:
    return is_aliyun_ocr_provider(provider) and bool(aliyun_access_key_id() and aliyun_access_key_secret())


def aliyun_access_key_id() -> str:
    return os.getenv("ALIYUN_ACCESS_KEY_ID") or os.getenv("ALIBABA_CLOUD_ACCESS_KEY_ID", "")


def aliyun_access_key_secret() -> str:
    return os.getenv("ALIYUN_ACCESS_KEY_SECRET") or os.getenv("ALIBABA_CLOUD_ACCESS_KEY_SECRET", "")


def aliyun_ocr_endpoint() -> str:
    return os.getenv("ALIYUN_OCR_ENDPOINT", "ocr-api.cn-hangzhou.aliyuncs.com")


def _create_aliyun_client() -> Tuple[Any, Any, Any]:
    try:
        from alibabacloud_ocr_api20210707.client import Client as OcrClient
        from alibabacloud_ocr_api20210707 import models as ocr_models
        from alibabacloud_tea_openapi import models as open_api_models
        from alibabacloud_tea_util import models as util_models
    except ModuleNotFoundError as exc:
        raise RuntimeError("缺少阿里云 OCR SDK，请安装 alibabacloud_ocr_api20210707") from exc

    config = open_api_models.Config(
        access_key_id=aliyun_access_key_id(),
        access_key_secret=aliyun_access_key_secret(),
    )
    config.endpoint = aliyun_ocr_endpoint()
    return OcrClient(config), ocr_models, util_models


def recognize_answer_sheet_with_aliyun(content: bytes, expected_answers: List[str]) -> OcrResult:
    payload = _call_aliyun_ocr(content, scene="handwriting")
    raw_text = extract_aliyun_text(payload)
    answers = split_answer_text(payload, expected_answers)
    return OcrResult(
        provider="aliyun_handwriting",
        confidence=estimate_aliyun_confidence(payload),
        raw_text=raw_text,
        answers=answers,
        payload=payload,
    )


def recognize_material_text_with_aliyun(content: bytes) -> OcrResult:
    payload = _call_aliyun_ocr(content, scene="general")
    raw_text = extract_aliyun_text(payload)
    return OcrResult(
        provider="aliyun_general",
        confidence=estimate_aliyun_confidence(payload),
        raw_text=raw_text,
        answers=[],
        payload=payload,
    )


def _call_aliyun_ocr(content: bytes, scene: str) -> Dict[str, Any]:
    if not content:
        raise RuntimeError("OCR 图片内容为空")
    max_bytes = int(os.getenv("ALIYUN_OCR_MAX_BYTES", str(10 * 1024 * 1024)))
    if len(content) > max_bytes:
        raise RuntimeError("OCR 图片超过阿里云接口大小限制")

    client, ocr_models, util_models = _create_aliyun_client()
    runtime_options = util_models.RuntimeOptions()

    if scene == "handwriting":
        request = _build_request(
            ocr_models.RecognizeHandwritingRequest,
            {
                "body": BytesIO(content),
                "need_rotate": True,
                "need_sort_page": False,
                "output_char_info": True,
                "paragraph": True,
            },
        )
        response = client.recognize_handwriting_with_options(request, runtime_options)
    else:
        request = _build_request(
            ocr_models.RecognizeGeneralRequest,
            {"body": BytesIO(content)},
        )
        response = client.recognize_general_with_options(request, runtime_options)
    return extract_aliyun_payload(response)


def _build_request(request_class: Any, kwargs: Dict[str, Any]) -> Any:
    try:
        return request_class(**kwargs)
    except TypeError:
        return request_class(body=kwargs["body"])


def extract_aliyun_payload(response: Any) -> Dict[str, Any]:
    mapped = _to_plain_value(response)
    body = _lookup(mapped, "body", "Body") if isinstance(mapped, dict) else {}
    if not body and hasattr(response, "body"):
        body = _to_plain_value(getattr(response, "body"))
    if not isinstance(body, dict):
        body = {}

    code = _lookup(body, "Code", "code")
    message = _lookup(body, "Message", "message")
    if code and str(code).lower() not in {"success", "ok", "200"}:
        raise RuntimeError(f"阿里云 OCR 调用失败：{code} {message or ''}".strip())

    data = _lookup(body, "Data", "data") or _lookup(mapped, "Data", "data")
    if data is None:
        data = body
    if isinstance(data, str):
        stripped = data.strip()
        try:
            parsed = json.loads(stripped)
            return parsed if isinstance(parsed, dict) else {"content": stripped, "raw": parsed}
        except json.JSONDecodeError:
            return {"content": stripped}
    plain = _to_plain_value(data)
    return plain if isinstance(plain, dict) else {"content": str(plain or "")}


def extract_aliyun_text(payload: Dict[str, Any]) -> str:
    for key in ("content", "Content", "text", "Text"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    lines = lines_from_words_info(payload)
    if lines:
        return "\n".join(lines)
    return ""


def estimate_aliyun_confidence(payload: Dict[str, Any]) -> float:
    probs = list(_iter_word_probs(payload))
    if not probs:
        return 0.88 if extract_aliyun_text(payload) else 0.0
    average = sum(probs) / len(probs)
    confidence = average / 100 if average > 1 else average
    return max(0.0, min(round(confidence, 4), 0.99))


def split_answer_text(payload: Dict[str, Any], expected_answers: List[str]) -> List[str]:
    expected_count = len(expected_answers)
    lines = clean_answer_lines(lines_from_words_info(payload))
    if len(lines) < expected_count:
        lines = clean_answer_lines(re.split(r"[\n\r]+", extract_aliyun_text(payload)))
    if len(lines) < expected_count:
        text = extract_aliyun_text(payload)
        lines = clean_answer_lines(re.split(r"[\s,，、;；]+", text))
    if len(lines) == 1 and expected_count > 1:
        lines = split_compact_text(lines[0], expected_answers)
    return fit_answer_lines_to_expected(lines, expected_answers)


def fit_answer_lines_to_expected(lines: List[str], expected_answers: List[str]) -> List[str]:
    expected_count = len(expected_answers)
    if expected_count <= 0 or len(lines) <= expected_count:
        return lines

    result: List[str] = []
    index = 0
    expected_lengths = [max(1, len(normalize_ocr_answer(answer))) for answer in expected_answers]
    for answer_index, expected_length in enumerate(expected_lengths):
        if index >= len(lines):
            break
        remaining_answers = expected_count - answer_index
        value = ""
        while index < len(lines):
            remaining_lines_after_current = len(lines) - index - 1
            remaining_answers_after_current = remaining_answers - 1
            value += lines[index]
            index += 1
            if (
                len(normalize_ocr_answer(value)) >= expected_length
                and remaining_lines_after_current >= remaining_answers_after_current
            ):
                break
        result.append(normalize_ocr_answer(value))

    while len(result) < expected_count:
        result.append("")

    if index < len(lines) and result:
        final_expected_length = expected_lengths[-1]
        for extra_line in lines[index:]:
            if len(normalize_ocr_answer(result[-1])) >= final_expected_length:
                break
            result[-1] = normalize_ocr_answer(result[-1] + extra_line)
    return result[:expected_count]


def clean_answer_lines(values: Iterable[str]) -> List[str]:
    result: List[str] = []
    for value in values:
        cleaned = normalize_ocr_answer(value)
        if cleaned:
            result.append(cleaned)
    return result


def normalize_ocr_answer(value: str) -> str:
    cleaned = str(value or "").strip()
    cleaned = re.sub(r"^\s*(?:第?\s*\d+\s*[题、.．:：)]?\s*)", "", cleaned)
    cleaned = re.sub(r"^[①②③④⑤⑥⑦⑧⑨⑩]\s*", "", cleaned)
    cleaned = re.sub(r"[\s\t]+", "", cleaned)
    cleaned = cleaned.strip("，。,.、；;：:！!？?\"'“”‘’（）()【】[]")
    return cleaned


def split_compact_text(text: str, expected_answers: List[str]) -> List[str]:
    cleaned = normalize_ocr_answer(text)
    if not cleaned:
        return []
    result: List[str] = []
    offset = 0
    for expected in expected_answers:
        length = max(1, len(normalize_ocr_answer(expected)))
        if offset >= len(cleaned):
            break
        result.append(cleaned[offset : offset + length])
        offset += length
    if offset < len(cleaned) and result:
        result[-1] += cleaned[offset:]
    return result


def lines_from_words_info(payload: Dict[str, Any]) -> List[str]:
    words_info = _lookup(payload, "prism_wordsInfo", "prismWordsInfo", "wordsInfo", "words_info") or []
    if not isinstance(words_info, list):
        return []
    word_items = []
    heights: List[float] = []
    for item in words_info:
        if not isinstance(item, dict):
            continue
        word = str(_lookup(item, "word", "Word", "text", "Text") or "").strip()
        if not word:
            continue
        x, y, height = _word_position(item)
        if height:
            heights.append(height)
        word_items.append((y, x, height, word))
    if not word_items:
        return []

    threshold = max(16.0, (median(heights) if heights else 24.0) * 0.75)
    rows: List[Dict[str, Any]] = []
    for y, x, height, word in sorted(word_items, key=lambda value: (value[0], value[1])):
        target = None
        for row in rows:
            if abs(row["y"] - y) <= threshold:
                target = row
                break
        if target is None:
            target = {"y": y, "items": []}
            rows.append(target)
        target["items"].append((x, word))
        target["y"] = (target["y"] + y) / 2

    lines = []
    for row in sorted(rows, key=lambda value: value["y"]):
        line = " ".join(word for _, word in sorted(row["items"], key=lambda value: value[0]))
        if line.strip():
            lines.append(line.strip())
    return lines


def _word_position(item: Dict[str, Any]) -> Tuple[float, float, float]:
    x = _to_float(_lookup(item, "x", "X"), 0.0)
    y = _to_float(_lookup(item, "y", "Y"), 0.0)
    height = _to_float(_lookup(item, "height", "Height"), 0.0)
    pos = _lookup(item, "pos", "Pos") or []
    if isinstance(pos, list) and pos:
        xs = [_to_float(point.get("x") if isinstance(point, dict) else None, x) for point in pos]
        ys = [_to_float(point.get("y") if isinstance(point, dict) else None, y) for point in pos]
        x = sum(xs) / len(xs)
        y = sum(ys) / len(ys)
        if not height and ys:
            height = max(ys) - min(ys)
    return x, y, height


def _iter_word_probs(payload: Dict[str, Any]) -> Iterable[float]:
    words_info = _lookup(payload, "prism_wordsInfo", "prismWordsInfo", "wordsInfo", "words_info") or []
    if isinstance(words_info, list):
        for item in words_info:
            if not isinstance(item, dict):
                continue
            prob = _lookup(item, "prob", "Prob", "confidence", "Confidence")
            if prob is not None:
                yield _to_float(prob, 0.0)
            char_info = _lookup(item, "charInfo", "char_info") or []
            if isinstance(char_info, list):
                for char_item in char_info:
                    if isinstance(char_item, dict):
                        char_prob = _lookup(char_item, "prob", "Prob", "confidence", "Confidence")
                        if char_prob is not None:
                            yield _to_float(char_prob, 0.0)


def _lookup(value: Any, *keys: str) -> Any:
    if not isinstance(value, dict):
        return None
    for key in keys:
        if key in value:
            return value[key]
    return None


def _to_float(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _to_plain_value(value: Any) -> Any:
    if hasattr(value, "to_map"):
        return _to_plain_value(value.to_map())
    if hasattr(value, "to_dict"):
        return _to_plain_value(value.to_dict())
    if isinstance(value, dict):
        return {key: _to_plain_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_to_plain_value(item) for item in value]
    return value
