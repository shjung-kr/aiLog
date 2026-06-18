import re

TOKEN_RE = re.compile(r"[0-9A-Za-z가-힣]{2,}")
_TECH_TOKEN_RE = re.compile(r"^[A-Za-z][A-Za-z0-9]*(?:[._+#\-][A-Za-z0-9]+)*$")


class FullTextSearch:
    def tokenize(self, text: str) -> set[str]:
        return {token for token in TOKEN_RE.findall(text.lower()) if len(token) >= 2}

    def keyword_overlap(self, query_tokens: set[str], text: str) -> float:
        if not query_tokens or not text:
            return 0.0
        text_tokens = self.tokenize(text)
        if not text_tokens:
            return 0.0
        return len(query_tokens & text_tokens) / len(query_tokens)

    def extract_tech_tokens(self, tokens: set[str]) -> set[str]:
        """영문/코드 토큰 추출 (SQLAlchemy, react, n+1 등). 이미 소문자화된 토큰 기준."""
        return {t for t in tokens if _TECH_TOKEN_RE.match(t) and len(t) >= 3}

    def tech_exact_boost(self, tech_tokens: set[str], text: str) -> float:
        """tech_tokens 중 text에 등장하는 비율 (0.0~1.0)."""
        if not tech_tokens or not text:
            return 0.0
        text_lower = text.lower()
        hits = sum(1 for t in tech_tokens if t in text_lower)
        return hits / len(tech_tokens)
