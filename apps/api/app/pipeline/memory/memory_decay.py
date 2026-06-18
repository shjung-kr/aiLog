from app.db.models.episode import Episode

_LTM_PROMOTED_FLAG = "promoted_to_ltm"


class MemoryDecay:
    def filter_for_deletion(self, episodes: list[Episode]) -> list[Episode]:
        """Return episodes that should be deleted. Protects LTM-promoted episodes."""
        return [
            episode for episode in episodes
            if not (episode.metadata_json or {}).get(_LTM_PROMOTED_FLAG)
        ]
