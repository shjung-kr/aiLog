from app.db.models.episode import Episode


class Reranker:
    def top(self, candidates: list[tuple[float, Episode]], limit: int) -> list[tuple[float, Episode]]:
        return sorted(candidates, key=lambda item: item[0], reverse=True)[:limit]
