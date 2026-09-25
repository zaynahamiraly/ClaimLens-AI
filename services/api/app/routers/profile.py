from fastapi import APIRouter, Depends

from ..schemas import Profile
from ..security import CurrentUser, get_current_user


router = APIRouter(tags=["profile"])


@router.get("/profile", response_model=Profile)
async def profile(user: CurrentUser = Depends(get_current_user)) -> Profile:
    return user.profile
