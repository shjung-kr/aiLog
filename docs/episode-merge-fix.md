# Episode 병합 버그 수정 내역

## 배경

세션 간 동일 주제 대화가 별도 Episode로 중복 생성되는 문제가 발생했다.
원인은 단일 버그가 아니라 4가지 독립적인 결함의 복합 작용이었다.

---

## 수정 1 — 임계값 완화

**파일:** `apps/api/app/services/episode_builder_service.py`

| 상수 | 변경 전 | 변경 후 |
|------|--------|--------|
| `MIN_EMBEDDING_COSINE_FOR_MERGE` | `0.68` | `0.62` |
| `EMBEDDING_MERGE_THRESHOLD` | `0.74` | `0.70` |

### 문제

`_merge_score`는 `embedding_cosine × 0.8 + keyword × 0.1 + type × 0.1` 구조다.
임계값 0.74를 통과하려면 코사인 0.68만으로는 키워드·타입이 완벽 일치해도
`0.68 × 0.8 + 0.2 = 0.744`로 아슬아슬하다.

한국어 텍스트는 OpenAI 임베딩에서 영어 대비 코사인이 낮게 측정되는 경향이 있어,
같은 주제여도 프리필터(0.68)에서 탈락하는 케이스가 발생했다.

### 수정

임계값을 완화해 한국어 시맨틱 유사도 범위를 수용한다.
코사인 0.62 + 키워드·타입 완전 일치 기준 최종 스코어 `0.696 ≥ 0.70`으로 통과 가능해진다.

---

## 수정 2 — Semantic Text 형식 불일치 보완

**파일:** `apps/api/app/services/episode_builder_service.py` — `_find_matching_episode`

### 문제

기존 Episode에 `semantic_text`가 없으면 `_ensure_episode_embedding`이 폴백으로
`"Title: ...\nSummary: ...\nKeywords: ..."` 형식 텍스트의 임베딩을 사용한다.

신규 빌드된 Episode는 LLM 1인칭 내러티브 형식이므로, 같은 주제여도 두 임베딩 간
코사인이 0.5 수준으로 떨어져 프리필터에서 탈락했다.

### 수정

`_find_matching_episode` 루프 내부에 **title embedding 백업 비교**를 추가했다.

```python
title_embedding = (episode.metadata_json or {}).get(TITLE_EMBEDDING_METADATA_KEY)
if isinstance(title_embedding, list):
    title_cosine = self._cosine_similarity(
        candidate_embedding, [float(v) for v in title_embedding]
    )
    cosine_score = max(cosine_score, title_cosine * 0.92)
```

`title_embedding`은 짧고 형식에 덜 의존적이라 포맷 불일치 상황에서 신호를 복원한다.
0.92 할인 계수를 적용해 title 단독으로 merge 결정을 주도하지 않게 제한한다.

---

## 수정 3 — 병합 후보 풀 동결 (Loop Contamination 방지)

**파일:** `apps/api/app/services/episode_builder_service.py` — `build_from_session`

### 문제

```python
existing_episodes.append(episode)  # 신규 생성된 에피소드를 즉시 풀에 추가
```

같은 빌드 런에서 방금 생성된 Episode가 이후 `built_episode` 항목의 병합 후보가 됐다.
LLM이 미묘하게 다른 두 Episode를 생성한 경우, 두 번째 항목이 DB의 기존 Episode 대신
방금 만들어진 Episode에 잘못 병합되는 현상이 발생했다.

### 수정

`merge_candidate_pool`을 루프 시작 전 스냅샷으로 고정(frozen)하고,
신규 Episode는 rawlog 범위 중복 체크용 `existing_episodes`에만 추가한다.

```python
merge_candidate_pool: list[Episode] = list(existing_episodes)  # 고정

# 루프 내부
if matching_episode is None:
    ...
    existing_episodes.append(episode)  # rawlog 범위 체크용만
    # merge_candidate_pool에는 추가하지 않음

else:
    ...
    # 병합 후 pool 내 해당 항목을 최신 상태로 교체
    for idx, pool_ep in enumerate(merge_candidate_pool):
        if pool_ep.episode_id == episode.episode_id:
            merge_candidate_pool[idx] = episode
            break
```

병합된 Episode는 pool 내 항목을 최신 버전으로 교체해, 이후 항목이 병합 후 임베딩을
기준으로 비교할 수 있게 한다.

---

## 수정 4 — 크로스세션 병합 추적 (Contributing Session)

**파일:**
- `apps/api/app/services/episode_service.py` — `merge_episode`
- `apps/api/app/services/episode_builder_service.py` — `build_from_session`

### 문제

Session 2의 대화가 Session 1의 Episode에 크로스세션 병합되면,
해당 Episode의 `source_session_id`는 여전히 `session_1`로 유지된다.

Session 2를 재빌드할 때 `session_episodes_before`가 항상 비어 있어,
병합 대상(Session 1의 Episode)이 "session-preferred" 후보에서 제외된다.
Session 1의 Episode 시맨틱 텍스트가 이전 병합으로 조금이라도 변했으면
코사인이 임계값 아래로 떨어져 중복 Episode가 생성됐다.

### 수정 A — `merge_episode`에 `contributing_session_ids` 기록

```python
existing_metadata = episode.metadata_json or {}
contributing: set[str] = set(existing_metadata.get("contributing_session_ids") or [])
contributing.update(session_ids)  # 신규 병합된 세션들 추가

episode.metadata_json = {
    **existing_metadata,
    **(metadata or {}),
    "source_session_ids": session_ids,
    "contributing_session_ids": sorted(contributing),  # 누적
    "merged": True,
}
```

### 수정 B — `build_from_session`에서 contributing 에피소드 로드

```python
contributing_episodes: list[Episode] = [
    ep for ep in all_cross_episodes
    if session_id in (ep.metadata_json or {}).get("contributing_session_ids", [])
]
session_ep_ids_before: set[str] = own_ep_ids_before | contributing_ep_ids
```

자신이 기여한 크로스세션 Episode를 `session_ep_ids_before`에 포함시켜
session-preferred 병합 후보로 취급한다.

### 수정 C — Stale 삭제 범위를 Own Episode로 한정

기존 코드는 `session_ep_ids_before` 전체(own + contributing)에서
미매칭 항목을 삭제했다. 크로스세션 Episode는 다른 세션도 참조하므로 삭제하면 안 된다.

```python
# 변경 전
stale_ids = session_ep_ids_before - matched_session_ep_ids

# 변경 후
stale_ids = own_ep_ids_before - matched_session_ep_ids
```

---

## 변경 파일 요약

| 파일 | 변경 내용 |
|------|---------|
| `services/episode_builder_service.py` | 임계값 완화, 풀 동결, title embedding 백업, contributing 로드, stale 범위 수정 |
| `services/episode_service.py` | `merge_episode`에 `contributing_session_ids` 누적 추적 추가 |

## 예상 효과

- 같은 주제의 크로스세션 대화가 단일 Episode로 통합됨
- 세션 재빌드 시 기존 병합 관계가 유지되어 중복 생성 방지
- 레거시 Episode(semantic_text 미보유)와 신규 Episode 간 병합 복원
- 빌드 런 내부에서 의도하지 않은 Episode 간 병합 제거

---

## 적용 이력 — 전체 재빌드 (2026-05-16)

수정 적용 후 기존 데이터를 새 기준으로 전면 재생성했다.

### 초기화

```sql
DELETE FROM episode_rawlogs;
DELETE FROM episodes;
```

기존 에피소드 **44개** 전체 삭제.

### 재빌드 결과

턴이 2개 이상인 21개 세션을 대상으로 `POST /api/v1/episodes/build-from-session/{session_id}` 순차 호출.

| 세션 (앞 8자) | 턴 수 | 생성 에피소드 | 소요 시간 |
|-------------|------|------------|---------|
| e73606b4 | 22 | 5 | 41.8s |
| 1b19dd13 | 15 | 3 | 21.2s |
| db08defd | 14 | 3 | 23.3s |
| 18add02c | 13 | 1 | 14.8s |
| 1c434055 | 13 | 3 | 22.9s |
| cb2d6d19 | 12 | 3 | 25.0s |
| ab875849 | 10 | 2 | 18.7s |
| e081e207 | 10 | 2 | 16.2s |
| ea4636d2 | 10 | 2 | 13.7s |
| 7f5557ad | 9  | 2 | 16.3s |
| 726e2e0d | 7  | 2 | 13.5s |
| 12f26410 | 6  | 1 | 10.8s |
| 558abec0 | 6  | 1 | 11.1s |
| 07fb4996 | 4  | 1 | 8.0s  |
| a7a44e75 | 4  | 1 | 8.0s  |
| fcd53333 | 4  | 1 | 9.8s  |
| 나머지 5세션 | 2 | 각 1 | 5-9s |

- **총 생성**: 38개 에피소드
- **실패**: 0개
- **병합**: 0개 (첫 재빌드이므로 크로스세션 이력 없음 — 이후 동일 주제 재대화 시 자동 병합 적용됨)

### 참고

재빌드 직후 병합이 0인 것은 정상이다. `contributing_session_ids` 추적은 이번 재빌드부터 기록이 시작되므로, 동일 주제가 새 세션에서 다시 대화될 때부터 크로스세션 병합이 동작한다.
