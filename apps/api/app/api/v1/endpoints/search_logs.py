from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.repositories.search_repository import SearchRepository
from app.db.session import get_db
from app.schemas.search_log import SearchLogRead

router = APIRouter()


@router.get("", response_model=list[SearchLogRead])
def list_search_logs(
    limit: int = 50,
    session_id: str | None = None,
    db: Session = Depends(get_db),
) -> list[SearchLogRead]:
    repo = SearchRepository(db)
    logs = repo.list_recent(limit=limit, session_id=session_id)
    return [SearchLogRead.model_validate(log) for log in logs]


@router.get("/{log_id}", response_model=SearchLogRead)
def get_search_log(log_id: str, db: Session = Depends(get_db)) -> SearchLogRead:
    repo = SearchRepository(db)
    log = repo.get_by_id(log_id)
    if log is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Search log not found")
    return SearchLogRead.model_validate(log)
