import logging
import math

logger = logging.getLogger(__name__)


class BoundaryDetector:
    def __init__(self, threshold: float = 0.75, max_segment_size: int = 8) -> None:
        self.threshold = threshold
        self.max_segment_size = max_segment_size

    def detect(self, embeddings: list[list[float]]) -> list[int]:
        """Returns start index of each segment. First segment always starts at 0."""
        if not embeddings:
            return []

        boundaries = [0]
        current_segment_start = 0
        similarities: list[str] = []

        for i in range(1, len(embeddings)):
            segment_size = i - current_segment_start
            sim = self._cosine_similarity(embeddings[i - 1], embeddings[i])
            similarities.append(f"{sim:.3f}")
            is_topic_shift = sim < self.threshold
            is_max_reached = segment_size >= self.max_segment_size

            if is_topic_shift or is_max_reached:
                reason = "topic_shift" if is_topic_shift else "max_size"
                logger.debug("boundary at turn=%d sim=%.3f reason=%s", i, sim, reason)
                boundaries.append(i)
                current_segment_start = i

        logger.info(
            "[boundary] turns=%d segments=%d boundaries=%s similarities=[%s]",
            len(embeddings),
            len(boundaries),
            boundaries,
            ", ".join(similarities),
        )
        return boundaries

    def _cosine_similarity(self, a: list[float], b: list[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(y * y for y in b))
        if norm_a == 0.0 or norm_b == 0.0:
            return 0.0
        return dot / (norm_a * norm_b)
