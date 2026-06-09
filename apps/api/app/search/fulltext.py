import re

TOKEN_RE = re.compile(r"[0-9A-Za-z가-힣]{2,}")


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
