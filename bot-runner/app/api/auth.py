# -*- coding: utf-8 -*-
"""
Router Xác thực & Đăng ký Sinh viên (Authentication API).
"""

from fastapi import APIRouter, HTTPException
from app.models.schemas import UserRegisterRequest, UserResponse
from app.database import db

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

@router.post("/register", response_model=UserResponse)
def register_student(req: UserRegisterRequest):
    try:
        user = db.register_user(req.student_id, req.full_name, req.class_name, req.password)
        return user
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
