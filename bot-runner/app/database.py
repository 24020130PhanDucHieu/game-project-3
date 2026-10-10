# -*- coding: utf-8 -*-
"""
Database compatibility bridge re-exporting Database and singleton db from app.repository.database.
"""
from app.repository.database import Database, db

__all__ = ["Database", "db"]
