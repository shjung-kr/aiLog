from app.pipeline.segmentation.boundary_detector import BoundaryDetector


class Segmenter:
    def __init__(self, max_turns_per_segment: int = 5) -> None:
        self.max_turns_per_segment = max_turns_per_segment

    def segment(self, turns: list[dict]) -> list[list[dict]]:
        if not turns:
            return []
        return [
            turns[i : i + self.max_turns_per_segment]
            for i in range(0, len(turns), self.max_turns_per_segment)
        ]

    def segment_with_boundaries(
        self,
        turns: list[dict],
        embeddings: list[list[float]],
        threshold: float = 0.75,
    ) -> list[list[dict]]:
        if not turns:
            return []
        detector = BoundaryDetector(threshold=threshold, max_segment_size=self.max_turns_per_segment)
        boundaries = detector.detect(embeddings)
        segments = []
        for i, start in enumerate(boundaries):
            end = boundaries[i + 1] if i + 1 < len(boundaries) else len(turns)
            segments.append(turns[start:end])
        return segments
